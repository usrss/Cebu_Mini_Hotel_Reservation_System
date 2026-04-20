# bookings/modification_views.py

from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.views    import APIView
from rest_framework.response import Response
from rest_framework          import generics, status
from rest_framework.permissions import IsAuthenticated

from bookings.models import (
    Booking,
    BookingStatus,
    BookingModification,
    ModificationStatus,
    ModificationPayment,
)
from payments.models import (
    Payment, PaymentStatus, PaymentType, PaymentProvider, PaymentMethod,
)
from .modification_serializers import (
    RescheduleRequestSerializer,
    ExtendStayRequestSerializer,
    ModificationDetailSerializer,
    ModificationConfirmSerializer,
)

import logging
logger = logging.getLogger(__name__)


# ─── helpers ─────────────────────────────────────────────────────────────────

def _get_user_booking(pk, user):
    try:
        return Booking.objects.select_related("room").get(pk=pk, user=user)
    except Booking.DoesNotExist:
        return None


def _get_user_modification(mod_id, user):
    try:
        return BookingModification.objects.select_related(
            "booking__room"
        ).get(pk=mod_id, booking__user=user)
    except BookingModification.DoesNotExist:
        return None


# ─── Reschedule ───────────────────────────────────────────────────────────────

class RescheduleRequestView(APIView):
    """
    POST /api/bookings/my/<id>/reschedule/

    Body:
      { "new_check_in": "YYYY-MM-DD", "new_check_out": "YYYY-MM-DD" }

    Returns a ModificationDetailSerializer payload. Frontend then:
      - status == PENDING          → call /confirm/ directly (no charge)
      - status == AWAITING_PAYMENT → redirect to payment flow
      - status == AWAITING_REFUND  → show refund breakdown, call /confirm-refund/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        booking = _get_user_booking(pk, request.user)
        if not booking:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = RescheduleRequestSerializer(
            data=request.data,
            context={"booking": booking, "request": request},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        mod = serializer.save()
        return Response(
            ModificationDetailSerializer(mod).data,
            status=status.HTTP_201_CREATED,
        )


# ─── Extend Stay ─────────────────────────────────────────────────────────────

class ExtendStayRequestView(APIView):
    """
    POST /api/bookings/my/<id>/extend/

    Body:
      { "new_check_out": "YYYY-MM-DD" }

    Returns a ModificationDetailSerializer payload with
    status == AWAITING_PAYMENT. Frontend redirects to payment flow.
    Email is sent automatically by modification_signals.py after payment.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        booking = _get_user_booking(pk, request.user)
        if not booking:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ExtendStayRequestSerializer(
            data=request.data,
            context={"booking": booking, "request": request},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        mod = serializer.save()
        return Response(
            ModificationDetailSerializer(mod).data,
            status=status.HTTP_201_CREATED,
        )


# ─── List modifications for a booking ────────────────────────────────────────

class MyModificationListView(generics.ListAPIView):
    """
    GET /api/bookings/my/<id>/modifications/
    """
    serializer_class   = ModificationDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        booking_id = self.kwargs["pk"]
        return BookingModification.objects.filter(
            booking_id=booking_id,
            booking__user=self.request.user,
        ).order_by("-created_at")


# ─── Detail ───────────────────────────────────────────────────────────────────

class MyModificationDetailView(generics.RetrieveAPIView):
    """
    GET /api/bookings/my/modification/<mod_id>/
    """
    serializer_class   = ModificationDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        mod = _get_user_modification(self.kwargs["mod_id"], self.request.user)
        if not mod:
            from rest_framework.exceptions import NotFound
            raise NotFound("Modification not found.")
        return mod


# ─── Confirm (no-charge path) ─────────────────────────────────────────────────

class ModificationConfirmView(APIView):
    """
    POST /api/bookings/my/modification/<mod_id>/confirm/

    Used only when price_difference == 0.
    Commits the modification and sends confirmation email.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, mod_id):
        mod = _get_user_modification(mod_id, request.user)
        if not mod:
            return Response(
                {"error": "Modification not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ModificationConfirmSerializer(
            data={},
            context={"modification": mod, "request": request},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        mod = serializer.save()

        # Send email — no charge, no refund
        try:
            from .modification_signals import send_modification_free_email
            send_modification_free_email(mod)
        except Exception as exc:
            logger.warning("Free modification email failed for mod %s: %s", mod.pk, exc)

        return Response(ModificationDetailSerializer(mod).data)


# ─── Cancel ───────────────────────────────────────────────────────────────────

class ModificationCancelView(APIView):
    """
    POST /api/bookings/my/modification/<mod_id>/cancel/
    """
    permission_classes = [IsAuthenticated]

    CANCELLABLE = {
        ModificationStatus.PENDING,
        ModificationStatus.AWAITING_PAYMENT,
        ModificationStatus.AWAITING_REFUND,
    }

    def post(self, request, mod_id):
        mod = _get_user_modification(mod_id, request.user)
        if not mod:
            return Response(
                {"error": "Modification not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if mod.status not in self.CANCELLABLE:
            return Response(
                {"error": f"Cannot cancel a modification with status '{mod.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mod.status = ModificationStatus.CANCELLED
        mod.save(update_fields=["status", "updated_at"])
        return Response(ModificationDetailSerializer(mod).data)


# ─── Payment initiation ───────────────────────────────────────────────────────

class ModificationPaymentInitiateView(APIView):
    """
    POST /api/bookings/my/modification/<mod_id>/pay/

    Creates a Payment record for AWAITING_PAYMENT modifications and
    returns a checkout URL. After payment, modification_signals.py
    commits the new dates and sends the email automatically.

    Body:
      { "payment_method": "card" | "gcash" | "bank_transfer" | "paypal" }
    """
    permission_classes = [IsAuthenticated]

    VALID_METHODS = [
        PaymentMethod.CARD,
        PaymentMethod.GCASH,
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.PAYPAL,
    ]

    def post(self, request, mod_id):
        mod = _get_user_modification(mod_id, request.user)
        if not mod:
            return Response(
                {"error": "Modification not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if mod.status != ModificationStatus.AWAITING_PAYMENT:
            return Response(
                {
                    "error": (
                        f"Modification is not awaiting payment "
                        f"(current status: '{mod.status}')."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_method = request.data.get("payment_method", "").strip()
        if raw_method == PaymentMethod.PAYPAL:
            provider = PaymentProvider.PAYPAL
        elif raw_method in self.VALID_METHODS:
            provider = PaymentProvider.PAYMONGO
        else:
            return Response(
                {
                    "error": (
                        f"Invalid payment method '{raw_method}'. "
                        f"Valid: card, gcash, bank_transfer, paypal."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking = mod.booking
        amount  = mod.price_difference  # always positive for AWAITING_PAYMENT

        from datetime import timedelta
        CHECKOUT_EXPIRES_MINUTES = 30

        with transaction.atomic():
            payment = Payment.objects.create(
                booking        = booking,
                user           = request.user,
                amount         = amount,
                payment_type   = PaymentType.MODIFICATION,
                provider       = provider,
                payment_method = raw_method,
                status         = PaymentStatus.PENDING,
                expires_at     = timezone.now() + timedelta(minutes=CHECKOUT_EXPIRES_MINUTES),
            )

            ModificationPayment.objects.create(
                modification=mod,
                payment=payment,
            )

        checkout_url        = None
        checkout_session_id = None

        try:
            from django.conf import settings as django_settings
            from payments.services import PayMongoService, PayPalService

            success_url = (
                f"{django_settings.FRONTEND_URL}"
                f"/payments/success?payment_id={payment.pk}&mod_id={mod.pk}"
            )
            cancel_url = (
                f"{django_settings.FRONTEND_URL}"
                f"/payments/cancel?payment_id={payment.pk}"
            )

            if provider == PaymentProvider.PAYMONGO:
                result = PayMongoService.create_checkout_session(
                    payment=payment,
                    booking=booking,
                    success_url=success_url,
                    cancel_url=cancel_url,
                )
                checkout_url        = result.get("checkout_url")
                checkout_session_id = result.get("session_id")

            elif provider == PaymentProvider.PAYPAL:
                result = PayPalService.create_order(
                    payment=payment,
                    booking=booking,
                    return_url=success_url,
                    cancel_url=cancel_url,
                )
                checkout_url        = result.get("checkout_url")
                checkout_session_id = result.get("order_id")

            if checkout_url or checkout_session_id:
                payment.checkout_url        = checkout_url
                payment.checkout_session_id = checkout_session_id
                payment.save(update_fields=[
                    "checkout_url", "checkout_session_id", "updated_at"
                ])

        except Exception as exc:
            logger.exception(
                "Failed to create checkout session for modification %s: %s", mod.pk, exc
            )
            payment.status = PaymentStatus.FAILED
            payment.save(update_fields=["status", "updated_at"])
            return Response(
                {"error": "Payment gateway error. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "payment_id":      payment.pk,
                "modification_id": mod.pk,
                "amount":          str(amount),
                "currency":        payment.currency,
                "checkout_url":    checkout_url,
                "provider":        provider,
                "expires_at":      payment.expires_at,
            },
            status=status.HTTP_201_CREATED,
        )


# ─── Refund confirm (AWAITING_REFUND path) ────────────────────────────────────

class ModificationRefundConfirmView(APIView):
    """
    POST /api/bookings/my/modification/<mod_id>/confirm-refund/

    Guest confirms the reschedule with refund. The system:
      1. Re-checks availability
      2. Commits new dates to booking
      3. Creates Refund record
      4. Calls provider refund API
      5. Sends modification email with refund details
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, mod_id):
        mod = _get_user_modification(mod_id, request.user)
        if not mod:
            return Response(
                {"error": "Modification not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if mod.status != ModificationStatus.AWAITING_REFUND:
            return Response(
                {
                    "error": (
                        f"Modification is not in AWAITING_REFUND state "
                        f"(current: '{mod.status}')."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .modification_serializers import _check_overlap

        with transaction.atomic():
            # Final availability re-check before commit
            if _check_overlap(
                mod.booking.room,
                mod.new_check_in,
                mod.new_check_out,
                exclude_booking_id=mod.booking_id,
            ):
                return Response(
                    {"error": "Dates are no longer available. Please start a new modification."},
                    status=status.HTTP_409_CONFLICT,
                )

            # Commit dates to booking
            mod.commit_to_booking(changed_by=request.user)

            # Create refund record if net_refund_amount > 0
            if mod.net_refund_amount > Decimal("0"):
                try:
                    from payments.models import PaymentStatus as PStatus, Refund

                    paid_payment = (
                        mod.booking.payments
                        .filter(status=PStatus.PAID)
                        .order_by("-paid_at")
                        .first()
                    )
                    if paid_payment:
                        refund = Refund.objects.create(
                            payment      = paid_payment,
                            amount       = mod.net_refund_amount,
                            reason       = (
                                f"Reschedule refund — Booking {mod.booking.reference_number}. "
                                f"Dates changed to {mod.new_check_in} → {mod.new_check_out}."
                            ),
                            initiated_by = request.user,
                        )

                        ModificationPayment.objects.update_or_create(
                            modification=mod,
                            defaults={"refund": refund},
                        )

                        # Attempt provider refund (non-blocking on failure)
                        try:
                            from payments.models import PaymentProvider as PP
                            from payments.services import PayMongoService, PayPalService

                            if paid_payment.provider == PP.PAYMONGO:
                                result = PayMongoService.create_refund(
                                    paid_payment,
                                    mod.net_refund_amount,
                                    reason="Reschedule refund",
                                )
                                refund.provider_refund_id = result.get("refund_id")
                                refund.status = Refund.RefundStatus.COMPLETED
                                refund.save(update_fields=[
                                    "provider_refund_id", "status", "updated_at"
                                ])

                            elif paid_payment.provider == PP.PAYPAL:
                                result = PayPalService.create_refund(
                                    paid_payment,
                                    mod.net_refund_amount,
                                    reason="Reschedule refund",
                                )
                                refund.provider_refund_id = result.get("refund_id")
                                refund.status = Refund.RefundStatus.COMPLETED
                                refund.save(update_fields=[
                                    "provider_refund_id", "status", "updated_at"
                                ])

                        except Exception as exc:
                            logger.warning(
                                "Provider refund failed for modification %s: %s", mod.pk, exc
                            )
                            # Refund stays PENDING — staff will process manually

                except Exception as exc:
                    logger.error(
                        "Failed to create refund record for modification %s: %s", mod.pk, exc
                    )

        # Send modification email with refund details (outside transaction)
        try:
            from .modification_signals import send_modification_refund_email
            send_modification_refund_email(mod)
        except Exception as exc:
            logger.warning(
                "Refund modification email failed for mod %s: %s", mod.pk, exc
            )

        return Response(ModificationDetailSerializer(mod).data)