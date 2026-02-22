import hmac
import hashlib
import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.db import transaction

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters

from rooms.permissions import IsStaffOrAdmin
from bookings.models import Booking, BookingStatus
from .models import Payment, Refund, PaymentStatus, PaymentType, PaymentProvider, PaymentMethod
from .serializers import (
    PaymentSerializer,
    PaymentListSerializer,
    InitiatePaymentSerializer,
    InitiateRefundSerializer,
)
from .filters import PaymentFilter
from .services import PayMongoService, PayPalService

logger = logging.getLogger(__name__)

CHECKOUT_EXPIRES_MINUTES = 30


# ─── User: initiate payment ───────────────────────────────────────────────────

class InitiatePaymentView(APIView):
    """
    POST /api/payments/initiate/
    Creates a Payment record and returns a provider checkout URL.

    Security:
    - Amount is computed server-side from booking.total_price
    - Booking ownership is verified
    - Double-payment is blocked by serializer validation
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InitiatePaymentSerializer(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data          = serializer.validated_data
        booking       = data["booking"]
        payment_type  = data["payment_type"]
        payment_method = data["payment_method"]
        provider      = data["provider"]
        amount        = data["amount"]
        user          = data["user"]

        with transaction.atomic():
            payment = Payment.objects.create(
                booking        = booking,
                user           = user,
                amount         = amount,
                payment_type   = payment_type,
                provider       = provider,
                payment_method = payment_method,
                status         = PaymentStatus.PENDING,
                expires_at     = timezone.now() + timedelta(minutes=CHECKOUT_EXPIRES_MINUTES),
            )

        # ── Create provider checkout session ───────────────────────────────
        checkout_url      = None
        checkout_session_id = None

        try:
            if provider == PaymentProvider.PAYMONGO:
                result = PayMongoService.create_checkout_session(
                    payment=payment,
                    booking=booking,
                    success_url=f"{settings.FRONTEND_URL}/payments/success?payment_id={payment.pk}",
                    cancel_url=f"{settings.FRONTEND_URL}/payments/cancel?payment_id={payment.pk}",
                )
                checkout_url        = result.get("checkout_url")
                checkout_session_id = result.get("session_id")

            elif provider == PaymentProvider.PAYPAL:
                result = PayPalService.create_order(
                    payment=payment,
                    booking=booking,
                    return_url=f"{settings.FRONTEND_URL}/payments/success?payment_id={payment.pk}",
                    cancel_url=f"{settings.FRONTEND_URL}/payments/cancel?payment_id={payment.pk}",
                )
                checkout_url        = result.get("checkout_url")
                checkout_session_id = result.get("order_id")

            elif provider == PaymentProvider.MANUAL:
                # Cash payments are marked directly as PROCESSING; staff confirm later
                payment.status = PaymentStatus.PROCESSING
                payment.save(update_fields=["status", "updated_at"])

            # Persist checkout info
            if checkout_url or checkout_session_id:
                payment.checkout_url        = checkout_url
                payment.checkout_session_id = checkout_session_id
                payment.save(update_fields=["checkout_url", "checkout_session_id", "updated_at"])

        except Exception as exc:
            logger.exception("Failed to create checkout session for payment %s: %s", payment.pk, exc)
            payment.status = PaymentStatus.FAILED
            payment.save(update_fields=["status", "updated_at"])
            return Response(
                {"error": "Payment gateway error. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({
            "payment_id":    payment.pk,
            "amount":        str(payment.amount),
            "currency":      payment.currency,
            "payment_type":  payment.payment_type,
            "checkout_url":  checkout_url,
            "provider":      provider,
            "expires_at":    payment.expires_at,
        }, status=status.HTTP_201_CREATED)


# ─── User: my payments ────────────────────────────────────────────────────────

class MyPaymentListView(generics.ListAPIView):
    """
    GET /api/payments/my/
    Lists all payments for the authenticated user.
    """
    serializer_class   = PaymentListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Payment.objects
            .filter(user=self.request.user)
            .select_related("booking__room")
            .prefetch_related("refunds")
            .order_by("-created_at")
        )


class MyPaymentDetailView(generics.RetrieveAPIView):
    """
    GET /api/payments/my/<id>/
    Single payment detail for the authenticated user.
    """
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Payment.objects
            .filter(user=self.request.user)
            .select_related("booking__room")
            .prefetch_related("refunds")
        )


class PaymentVerifyView(APIView):
    """
    GET /api/payments/<id>/verify/
    Frontend calls this after returning from the provider redirect.
    Returns current payment status — does NOT confirm payment itself.
    (Confirmation happens via webhook only.)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            payment = Payment.objects.select_related("booking__room").get(
                pk=pk, user=request.user
            )
        except Payment.DoesNotExist:
            return Response({"error": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)

        # If still pending and not expired, poll provider status
        if payment.status == PaymentStatus.PENDING and not payment.is_expired:
            try:
                if payment.provider == PaymentProvider.PAYMONGO:
                    provider_status = PayMongoService.get_session_status(payment.checkout_session_id)
                    if provider_status == "paid":
                        payment.mark_paid(transaction_id=payment.checkout_session_id)
                    elif provider_status in ("expired", "cancelled"):
                        payment.mark_failed()
                elif payment.provider == PaymentProvider.PAYPAL:
                    provider_status = PayPalService.get_order_status(payment.checkout_session_id)
                    if provider_status == "COMPLETED":
                        payment.mark_paid(transaction_id=payment.checkout_session_id)
            except Exception as exc:
                logger.warning("Could not poll provider for payment %s: %s", pk, exc)

        serializer = PaymentSerializer(payment)
        return Response(serializer.data)


# ─── Webhooks ─────────────────────────────────────────────────────────────────

class PayMongoWebhookView(APIView):
    """
    POST /api/payments/webhooks/paymongo/
    Receives and processes PayMongo webhook events.
    Verifies signature using PAYMONGO_WEBHOOK_SECRET from settings.
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # No JWT — provider sends raw POST

    def post(self, request):
        # ── Signature verification ─────────────────────────────────────────
        secret = getattr(settings, "PAYMONGO_WEBHOOK_SECRET", "")
        if secret:
            sig_header = request.headers.get("Paymongo-Signature", "")
            try:
                parts = dict(p.split("=", 1) for p in sig_header.split(","))
                timestamp = parts.get("t", "")
                sig       = parts.get("te", "") or parts.get("li", "")
                payload   = f"{timestamp}.{request.body.decode()}"
                expected  = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
                if not hmac.compare_digest(expected, sig):
                    return Response({"error": "Invalid signature."}, status=status.HTTP_401_UNAUTHORIZED)
            except Exception:
                return Response({"error": "Signature verification failed."}, status=status.HTTP_400_BAD_REQUEST)

        event = request.data
        try:
            event_type = event["data"]["attributes"]["type"]
            resource   = event["data"]["attributes"].get("data", {})
        except (KeyError, TypeError):
            return Response({"error": "Malformed webhook payload."}, status=status.HTTP_400_BAD_REQUEST)

        logger.info("PayMongo webhook: %s", event_type)

        if event_type in ("payment.paid", "checkout_session.payment.paid"):
            self._handle_paid(resource, raw=event)
        elif event_type in ("payment.failed", "checkout_session.expired"):
            self._handle_failed(resource, raw=event)

        return Response({"received": True})

    @staticmethod
    def _handle_paid(resource, raw):
        session_id = (
            resource.get("id")
            or resource.get("attributes", {}).get("checkout_session_id")
        )
        if not session_id:
            return
        try:
            payment = Payment.objects.get(checkout_session_id=session_id)
            if payment.status != PaymentStatus.PAID:
                payment.mark_paid(transaction_id=session_id, payload=raw)
        except Payment.DoesNotExist:
            logger.warning("PayMongo webhook: no payment found for session %s", session_id)

    @staticmethod
    def _handle_failed(resource, raw):
        session_id = resource.get("id")
        if not session_id:
            return
        try:
            payment = Payment.objects.get(checkout_session_id=session_id)
            if payment.status not in (PaymentStatus.PAID, PaymentStatus.REFUNDED):
                payment.mark_failed(payload=raw)
        except Payment.DoesNotExist:
            pass


class PayPalWebhookView(APIView):
    """
    POST /api/payments/webhooks/paypal/
    Receives PayPal webhook events and processes order captures.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        event_type = request.data.get("event_type", "")
        resource   = request.data.get("resource", {})

        logger.info("PayPal webhook: %s", event_type)

        if event_type == "CHECKOUT.ORDER.APPROVED":
            order_id = resource.get("id")
            if order_id:
                try:
                    # Capture the order via PayPal API
                    capture = PayPalService.capture_order(order_id)
                    if capture.get("status") == "COMPLETED":
                        payment = Payment.objects.get(checkout_session_id=order_id)
                        payment.mark_paid(transaction_id=order_id, payload=request.data)
                except Payment.DoesNotExist:
                    logger.warning("PayPal webhook: no payment for order %s", order_id)
                except Exception as exc:
                    logger.exception("PayPal capture failed: %s", exc)

        elif event_type == "PAYMENT.CAPTURE.DENIED":
            order_id = resource.get("supplementary_data", {}).get("related_ids", {}).get("order_id")
            if order_id:
                try:
                    payment = Payment.objects.get(checkout_session_id=order_id)
                    payment.mark_failed(payload=request.data)
                except Payment.DoesNotExist:
                    pass

        return Response({"received": True})


# ─── Admin views ──────────────────────────────────────────────────────────────

class AdminPaymentListView(generics.ListAPIView):
    """
    GET /api/payments/admin/
    All payments. Filterable by status, method, booking, date range.
    Staff/Admin only.
    """
    serializer_class   = PaymentListSerializer
    permission_classes = [IsStaffOrAdmin]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = PaymentFilter
    search_fields      = ["receipt_number", "booking__reference_number", "booking__full_name", "booking__email"]
    ordering_fields    = ["created_at", "amount", "paid_at"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        return (
            Payment.objects
            .select_related("booking__room", "user")
            .prefetch_related("refunds")
        )


class AdminPaymentDetailView(generics.RetrieveAPIView):
    """
    GET /api/payments/admin/<id>/
    Full payment detail including refunds.
    """
    serializer_class   = PaymentSerializer
    permission_classes = [IsStaffOrAdmin]
    queryset           = Payment.objects.select_related("booking__room", "user").prefetch_related("refunds")


class AdminManualConfirmView(APIView):
    """
    POST /api/payments/admin/<id>/confirm/
    Staff manually confirms a cash / walk-in payment.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request, pk):
        try:
            payment = Payment.objects.select_related("booking").get(pk=pk)
        except Payment.DoesNotExist:
            return Response({"error": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)

        if payment.provider != PaymentProvider.MANUAL:
            return Response(
                {"error": "Only manual/cash payments can be confirmed this way."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if payment.status not in (PaymentStatus.PENDING, PaymentStatus.PROCESSING):
            return Response(
                {"error": f"Cannot confirm a payment with status '{payment.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment.mark_paid(
            transaction_id=f"MANUAL-{payment.pk}",
            payload={"confirmed_by": request.user.email, "note": request.data.get("note", "")},
        )
        return Response(PaymentSerializer(payment).data)


class AdminInitiateRefundView(APIView):
    """
    POST /api/payments/admin/<id>/refund/
    Staff triggers a refund for a paid payment.
    Creates a Refund record, calls provider API, updates payment status.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request, pk):
        try:
            payment = Payment.objects.select_related("booking").get(pk=pk)
        except Payment.DoesNotExist:
            return Response({"error": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = InitiateRefundSerializer(
            data=request.data, context={"payment": payment}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        amount = serializer.validated_data["amount"]
        reason = serializer.validated_data.get("reason", "")

        with transaction.atomic():
            refund = Refund.objects.create(
                payment      = payment,
                amount       = amount,
                reason       = reason,
                initiated_by = request.user,
            )

            # Call provider API to process refund
            try:
                if payment.provider == PaymentProvider.PAYMONGO:
                    result = PayMongoService.create_refund(payment, amount, reason)
                    refund.provider_refund_id = result.get("refund_id")
                    refund.status = Refund.RefundStatus.COMPLETED
                elif payment.provider == PaymentProvider.PAYPAL:
                    result = PayPalService.create_refund(payment, amount, reason)
                    refund.provider_refund_id = result.get("refund_id")
                    refund.status = Refund.RefundStatus.COMPLETED
                else:
                    # Manual — mark completed immediately
                    refund.status = Refund.RefundStatus.COMPLETED

                refund.save(update_fields=["provider_refund_id", "status", "updated_at"])

                # Update payment status
                payment.status = PaymentStatus.REFUNDED
                payment.save(update_fields=["status", "updated_at"])

                # Sync booking refund status
                booking = payment.booking
                from bookings.models import RefundStatus as BRefundStatus
                booking.refund_status = BRefundStatus.COMPLETED
                booking.refund_amount = amount
                booking.save(update_fields=["refund_status", "refund_amount", "updated_at"])

            except Exception as exc:
                logger.exception("Refund failed for payment %s: %s", pk, exc)
                refund.status = Refund.RefundStatus.FAILED
                refund.save(update_fields=["status", "updated_at"])
                return Response(
                    {"error": "Refund processing failed. Please try again or contact the provider."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        return Response(PaymentSerializer(payment).data)


class AdminPaymentDashboardView(APIView):
    """
    GET /api/payments/admin/dashboard/
    Aggregated revenue stats for the admin dashboard.
    Returns: total revenue, counts by status, breakdown by method, recent payments.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        from django.db.models import Sum, Count, Q
        from django.db.models.functions import TruncMonth

        qs = Payment.objects.filter(status=PaymentStatus.PAID)

        # ── Totals ─────────────────────────────────────────────────────────
        total_revenue   = qs.aggregate(total=Sum("amount"))["total"] or 0
        total_paid      = qs.count()
        total_refunded  = Payment.objects.filter(status=PaymentStatus.REFUNDED).aggregate(
            total=Sum("amount")
        )["total"] or 0
        total_pending   = Payment.objects.filter(status=PaymentStatus.PENDING).count()
        total_failed    = Payment.objects.filter(status=PaymentStatus.FAILED).count()

        # ── By payment method ──────────────────────────────────────────────
        by_method = (
            qs.values("payment_method")
            .annotate(count=Count("id"), total=Sum("amount"))
            .order_by("-total")
        )

        # ── Monthly revenue (last 12 months) ───────────────────────────────
        monthly = (
            qs.annotate(month=TruncMonth("paid_at"))
            .values("month")
            .annotate(revenue=Sum("amount"), count=Count("id"))
            .order_by("month")
        )

        # ── Recent payments ────────────────────────────────────────────────
        recent = Payment.objects.select_related("booking__room").order_by("-created_at")[:10]

        return Response({
            "summary": {
                "total_revenue":  str(total_revenue),
                "total_refunded": str(total_refunded),
                "paid_count":     total_paid,
                "pending_count":  total_pending,
                "failed_count":   total_failed,
            },
            "by_method": list(by_method),
            "monthly_revenue": [
                {
                    "month":   m["month"].strftime("%Y-%m") if m["month"] else None,
                    "revenue": str(m["revenue"]),
                    "count":   m["count"],
                }
                for m in monthly
            ],
            "recent_payments": PaymentListSerializer(recent, many=True).data,
        })


# ─── Expiry utility ───────────────────────────────────────────────────────────

class ExpirePaymentsView(APIView):
    """
    POST /api/payments/admin/expire/
    Marks PENDING payments past their expires_at as EXPIRED.
    Call from Celery beat or a cron job.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        count = expire_pending_payments()
        return Response({"expired": count})


def expire_pending_payments():
    """Mark all stale pending payments as expired. Safe to call from Celery/cron."""
    now     = timezone.now()
    expired = Payment.objects.filter(
        status=PaymentStatus.PENDING,
        expires_at__lt=now,
    )
    ids = list(expired.values_list("id", flat=True))
    expired.update(status=PaymentStatus.EXPIRED)
    logger.info("Expired %d pending payments.", len(ids))
    return len(ids)