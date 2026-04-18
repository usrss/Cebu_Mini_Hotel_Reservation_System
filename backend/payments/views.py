# payments/views.py

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
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InitiatePaymentSerializer(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data           = serializer.validated_data
        booking        = data["booking"]
        payment_type   = data["payment_type"]
        payment_method = data["payment_method"]
        provider       = data["provider"]
        amount         = data["amount"]
        user           = data["user"]

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

        checkout_url        = None
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
                payment.status = PaymentStatus.PROCESSING
                payment.save(update_fields=["status", "updated_at"])

            if checkout_url or checkout_session_id:
                payment.checkout_url        = checkout_url
                payment.checkout_session_id = checkout_session_id
                payment.save(update_fields=["checkout_url", "checkout_session_id", "updated_at"])

            # Only send "Complete Your Payment" email for DEPOSIT payments.
            # Full-payment guests are already paying the full amount in the
            # checkout session itself — no separate reminder needed.
            if (
                checkout_url
                and provider in (PaymentProvider.PAYMONGO, PaymentProvider.PAYPAL)
                and payment_type != PaymentType.FULL_PAYMENT
            ):
                try:
                    from payments.signals import send_payment_link_email
                    send_payment_link_email(
                        payment      = payment,
                        booking      = booking,
                        checkout_url = checkout_url,
                    )
                except Exception as exc:
                    logger.warning(
                        "Payment link email failed for payment %s: %s", payment.pk, exc,
                    )

        except Exception as exc:
            logger.exception(
                "Failed to create checkout session for payment %s: %s", payment.pk, exc
            )
            payment.status = PaymentStatus.FAILED
            payment.save(update_fields=["status", "updated_at"])
            return Response(
                {"error": "Payment gateway error. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({
            "payment_id":   payment.pk,
            "amount":       str(payment.amount),
            "currency":     payment.currency,
            "payment_type": payment.payment_type,
            "checkout_url": checkout_url,
            "provider":     provider,
            "expires_at":   payment.expires_at,
        }, status=status.HTTP_201_CREATED)


# ─── User: my payments ────────────────────────────────────────────────────────

class MyPaymentListView(generics.ListAPIView):
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
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            payment = Payment.objects.select_related("booking__room").get(
                pk=pk, user=request.user
            )
        except Payment.DoesNotExist:
            return Response({"error": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)

        if payment.status in (
            PaymentStatus.PAID, PaymentStatus.FAILED,
            PaymentStatus.EXPIRED, PaymentStatus.CANCELLED,
        ):
            return Response(PaymentSerializer(payment).data)

        if payment.status == PaymentStatus.PENDING and payment.checkout_session_id:
            try:
                if payment.provider == PaymentProvider.PAYMONGO:
                    session       = PayMongoService.get_full_session(payment.checkout_session_id)
                    payments_list = session.get("payments") or []
                    is_paid       = any(
                        p.get("attributes", {}).get("status") == "paid"
                        for p in payments_list
                    )
                    if is_paid:
                        transaction_id = payments_list[0].get("id") if payments_list else None
                        payment.mark_paid(transaction_id=transaction_id)
                    elif session.get("status") == "expired":
                        payment.mark_failed()

                elif payment.provider == PaymentProvider.PAYPAL:
                    provider_status = PayPalService.get_order_status(payment.checkout_session_id)
                    if provider_status == "COMPLETED":
                        payment.mark_paid(transaction_id=payment.checkout_session_id)

            except Exception as exc:
                logger.warning("Could not poll provider for payment %s: %s", pk, exc)

        return Response(PaymentSerializer(payment).data)


# ─── Webhooks ─────────────────────────────────────────────────────────────────

class PayMongoWebhookView(APIView):
    """
    POST /api/payments/webhooks/paymongo/
    Receives and processes PayMongo webhook events.

    FIXED: removed the duplicate _handle_paid definition that was silently
    overwriting the first one (with food order fallback) and discarding it.
    The single authoritative _handle_paid now handles BOTH booking payments
    and food order payments, in that priority order.
    """
    permission_classes     = [AllowAny]
    authentication_classes = []

    def post(self, request):
        # ── Signature verification ─────────────────────────────────────────
        secret = getattr(settings, "PAYMONGO_WEBHOOK_SECRET", "")
        if secret:
            sig_header = request.headers.get("Paymongo-Signature", "")
            try:
                parts     = dict(p.split("=", 1) for p in sig_header.split(","))
                timestamp = parts.get("t", "")
                sig       = parts.get("te", "") or parts.get("li", "")
                payload   = f"{timestamp}.{request.body.decode()}"
                expected  = hmac.new(
                    secret.encode(), payload.encode(), hashlib.sha256
                ).hexdigest()
                if not hmac.compare_digest(expected, sig):
                    return Response(
                        {"error": "Invalid signature."}, status=status.HTTP_401_UNAUTHORIZED
                    )
            except Exception:
                return Response(
                    {"error": "Signature verification failed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        event = request.data
        try:
            event_type = event["data"]["attributes"]["type"]
            resource   = event["data"]["attributes"].get("data", {})
        except (KeyError, TypeError):
            return Response(
                {"error": "Malformed webhook payload."}, status=status.HTTP_400_BAD_REQUEST
            )

        logger.info("PayMongo webhook received: %s", event_type)

        if event_type in ("payment.paid", "checkout_session.payment.paid"):
            self._handle_paid(resource, raw=event)
        elif event_type in ("payment.failed", "checkout_session.expired"):
            self._handle_failed(resource, raw=event)

        return Response({"received": True})

    @staticmethod
    def _handle_paid(resource, raw):
        """
        Resolve the PayMongo session ID and mark the associated record as paid.

        Priority:
          1. booking Payment record  (normal hotel booking payment)
          2. FoodOrder record        (food pay_now)

        FIXED: this was defined TWICE — Python silently kept only the second
        (simpler) definition which had no food order fallback. Now there is
        exactly ONE definition that handles both cases.

        Food order release-to-kitchen:
          After marking payment_status='paid' we also set order_status='pending'
          so the kitchen can see and prepare the order. This mirrors what
          FoodOrderVerifyPaymentView does via polling, but fires faster via webhook.
        """
        session_id = (
            resource.get("id")
            or resource.get("attributes", {}).get("checkout_session_id")
        )
        if not session_id:
            logger.warning("PayMongo _handle_paid: no session_id in resource %r", resource)
            return

        # ── 1. Try booking payment ─────────────────────────────────────────
        try:
            payment = Payment.objects.get(checkout_session_id=session_id)
            if payment.status != PaymentStatus.PAID:
                payment.mark_paid(transaction_id=session_id, payload=raw)
                logger.info("Booking payment #%s marked paid via webhook.", payment.pk)
            return  # done — don't fall through to food order check
        except Payment.DoesNotExist:
            pass

        # ── 2. Try food order payment ──────────────────────────────────────
        try:
            from food.models import FoodOrder, OrderStatus as FoodOrderStatus, PaymentStatus as FoodPaymentStatus

            order = FoodOrder.objects.get(paymongo_session_id=session_id)

            if order.payment_status != FoodPaymentStatus.PAID:
                # Mark paid AND release to kitchen in one save
                order.payment_status = FoodPaymentStatus.PAID
                order.order_status   = FoodOrderStatus.PENDING  # kitchen can now see it
                order.save(update_fields=["payment_status", "order_status", "updated_at"])
                logger.info(
                    "Food order #%s marked paid and released to kitchen via webhook.",
                    order.pk,
                )
        except FoodOrder.DoesNotExist:
            logger.warning(
                "PayMongo webhook: no Payment or FoodOrder found for session_id=%s", session_id
            )

    @staticmethod
    def _handle_failed(resource, raw):
        """Mark the associated payment or food order as failed/cancelled."""
        session_id = (
            resource.get("id")
            or resource.get("attributes", {}).get("checkout_session_id")
        )
        if not session_id:
            return

        # ── 1. Booking payment ─────────────────────────────────────────────
        try:
            payment = Payment.objects.get(checkout_session_id=session_id)
            payment.mark_failed(payload=raw)
            logger.info("Booking payment #%s marked failed via webhook.", payment.pk)
            return
        except Payment.DoesNotExist:
            pass

        # ── 2. Food order ──────────────────────────────────────────────────
        try:
            from food.models import FoodOrder, OrderStatus as FoodOrderStatus

            order = FoodOrder.objects.get(paymongo_session_id=session_id)
            if order.order_status not in (
                FoodOrderStatus.COMPLETED, FoodOrderStatus.CANCELLED
            ):
                order.order_status = FoodOrderStatus.CANCELLED
                order.save(update_fields=["order_status", "updated_at"])
                logger.info("Food order #%s cancelled via failed/expired webhook.", order.pk)
        except FoodOrder.DoesNotExist:
            logger.warning(
                "PayMongo webhook _handle_failed: no record for session_id=%s", session_id
            )


class PayPalWebhookView(APIView):
    permission_classes     = [AllowAny]
    authentication_classes = []

    def post(self, request):
        event_type = request.data.get("event_type", "")
        resource   = request.data.get("resource", {})

        logger.info("PayPal webhook: %s", event_type)

        if event_type == "CHECKOUT.ORDER.APPROVED":
            order_id = resource.get("id")
            if order_id:
                try:
                    capture = PayPalService.capture_order(order_id)
                    if capture.get("status") == "COMPLETED":
                        payment = Payment.objects.get(checkout_session_id=order_id)
                        payment.mark_paid(transaction_id=order_id, payload=request.data)
                except Payment.DoesNotExist:
                    logger.warning("PayPal webhook: no payment for order %s", order_id)
                except Exception as exc:
                    logger.exception("PayPal capture failed: %s", exc)

        elif event_type == "PAYMENT.CAPTURE.DENIED":
            order_id = (
                resource.get("supplementary_data", {})
                .get("related_ids", {})
                .get("order_id")
            )
            if order_id:
                try:
                    payment = Payment.objects.get(checkout_session_id=order_id)
                    payment.mark_failed(payload=request.data)
                except Payment.DoesNotExist:
                    pass

        return Response({"received": True})


# ─── Admin views ──────────────────────────────────────────────────────────────

class AdminPaymentListView(generics.ListAPIView):
    serializer_class   = PaymentListSerializer
    permission_classes = [IsStaffOrAdmin]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = PaymentFilter
    search_fields      = [
        "receipt_number",
        "booking__reference_number",
        "booking__full_name",
        "booking__email",
    ]
    ordering_fields = ["created_at", "amount", "paid_at"]
    ordering        = ["-created_at"]

    def get_queryset(self):
        return (
            Payment.objects
            .select_related("booking__room", "user")
            .prefetch_related("refunds")
        )


class AdminPaymentDetailView(generics.RetrieveAPIView):
    serializer_class   = PaymentSerializer
    permission_classes = [IsStaffOrAdmin]
    queryset           = (
        Payment.objects
        .select_related("booking__room", "user")
        .prefetch_related("refunds")
    )


class AdminManualConfirmView(APIView):
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
            payload={
                "confirmed_by": request.user.email,
                "note": request.data.get("note", ""),
            },
        )
        return Response(PaymentSerializer(payment).data)


class AdminInitiateRefundView(APIView):
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
                    refund.status = Refund.RefundStatus.COMPLETED

                refund.save(update_fields=["provider_refund_id", "status", "updated_at"])

                payment.status = PaymentStatus.REFUNDED
                payment.save(update_fields=["status", "updated_at"])

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
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        from django.db.models import Sum, Count
        from django.db.models.functions import TruncMonth

        qs = Payment.objects.filter(status=PaymentStatus.PAID)

        total_revenue  = qs.aggregate(total=Sum("amount"))["total"] or 0
        total_paid     = qs.count()
        total_refunded = (
            Payment.objects
            .filter(status=PaymentStatus.REFUNDED)
            .aggregate(total=Sum("amount"))["total"] or 0
        )
        total_pending = Payment.objects.filter(status=PaymentStatus.PENDING).count()
        total_failed  = Payment.objects.filter(status=PaymentStatus.FAILED).count()

        by_method = (
            qs.values("payment_method")
            .annotate(count=Count("id"), total=Sum("amount"))
            .order_by("-total")
        )

        monthly = (
            qs.annotate(month=TruncMonth("paid_at"))
            .values("month")
            .annotate(revenue=Sum("amount"), count=Count("id"))
            .order_by("month")
        )

        recent = (
            Payment.objects
            .select_related("booking__room")
            .order_by("-created_at")[:10]
        )

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