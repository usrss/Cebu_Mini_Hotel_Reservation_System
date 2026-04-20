# payments/models.py

import logging
import random
import string
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator

logger = logging.getLogger(__name__)


class PaymentProvider(models.TextChoices):
    PAYMONGO = "paymongo", "PayMongo"
    PAYPAL   = "paypal",   "PayPal"
    MANUAL   = "manual",   "Manual (Cash / Walk-in)"


class PaymentMethod(models.TextChoices):
    CARD          = "card",          "Credit / Debit Card"
    GCASH         = "gcash",         "GCash"
    BANK_TRANSFER = "bank_transfer", "Bank Transfer"
    PAYPAL        = "paypal",        "PayPal"
    CASH          = "cash",          "Cash (Walk-in)"


class PaymentStatus(models.TextChoices):
    PENDING    = "pending",    "Pending"
    PROCESSING = "processing", "Processing"
    PAID       = "paid",       "Paid"
    FAILED     = "failed",     "Failed"
    CANCELLED  = "cancelled",  "Cancelled"
    REFUNDED   = "refunded",   "Refunded"
    EXPIRED    = "expired",    "Expired"


class PaymentType(models.TextChoices):
    FULL_PAYMENT    = "full_payment",    "Full Payment"
    DEPOSIT         = "deposit",         "Deposit (30%)"
    BALANCE_PAYMENT = "balance_payment", "Balance Payment"
    MODIFICATION    = "modification",    "Booking Modification"


DEPOSIT_PERCENTAGE = Decimal("0.30")


def generate_receipt_number():
    year   = timezone.now().year
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    receipt = f"RCP-{year}-{suffix}"
    while Payment.objects.filter(receipt_number=receipt).exists():
        suffix  = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        receipt = f"RCP-{year}-{suffix}"
    return receipt


class Payment(models.Model):
    receipt_number = models.CharField(
        max_length=20, unique=True, blank=True, null=True, default=None,
    )
    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.PROTECT,
        related_name="payments",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="payments",
    )
    amount         = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    currency       = models.CharField(max_length=3, default="PHP")
    payment_type   = models.CharField(max_length=20, choices=PaymentType.choices, default=PaymentType.FULL_PAYMENT)
    provider       = models.CharField(max_length=20, choices=PaymentProvider.choices)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    status         = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)

    transaction_id      = models.CharField(max_length=255, blank=True, null=True, unique=True)
    checkout_url        = models.URLField(max_length=1024, blank=True, null=True)
    checkout_session_id = models.CharField(max_length=255, blank=True, null=True)
    provider_payload    = models.JSONField(blank=True, null=True)

    paid_at    = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payments"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["booking", "status"]),
            models.Index(fields=["status"]),
            models.Index(fields=["transaction_id"]),
            models.Index(fields=["checkout_session_id"]),
        ]

    def __str__(self):
        return (
            f"Payment {self.receipt_number or self.pk} — "
            f"{self.get_status_display()} ({self.amount} {self.currency})"
        )

    @property
    def is_expired(self):
        if self.status == PaymentStatus.PENDING and self.expires_at:
            return timezone.now() > self.expires_at
        return False

    @property
    def is_successful(self):
        return self.status == PaymentStatus.PAID

    def mark_paid(self, transaction_id=None, payload=None):
        from bookings.models import BookingStatus, PaymentStatus as BPaymentStatus

        # ── Step 1: Mark payment PAID and generate receipt ────────────────────
        self.status         = PaymentStatus.PAID
        self.paid_at        = timezone.now()
        self.receipt_number = generate_receipt_number()
        if transaction_id:
            self.transaction_id = transaction_id
        if payload:
            self.provider_payload = payload
        self.save(update_fields=[
            "status", "paid_at", "receipt_number",
            "transaction_id", "provider_payload", "updated_at",
        ])

        # ── Step 2: Confirm booking ───────────────────────────────────────────
        booking = self.booking
        if booking.status == BookingStatus.PENDING_PAYMENT:
            try:
                booking.confirm_after_payment(changed_by=None)
                logger.info(
                    "Booking pk=%s confirmed after payment %s — ref=%s pin=%s",
                    booking.pk, self.receipt_number,
                    booking.reference_number, booking.checkin_pin,
                )
            except Exception as exc:
                logger.error(
                    "confirm_after_payment failed for booking pk=%s: %s",
                    booking.pk, exc,
                )
                raise

        elif booking.status == BookingStatus.CONFIRMED:
            # Balance payment on an already-confirmed booking
            booking.payment_status = BPaymentStatus.PAID
            booking.save(update_fields=["payment_status", "updated_at"])
            logger.info(
                "Balance payment %s received for confirmed booking pk=%s",
                self.receipt_number, booking.pk,
            )
        else:
            logger.warning(
                "mark_paid: booking pk=%s has unexpected status '%s'",
                booking.pk, booking.status,
            )

        # ── Step 3: Role-based payment notifications ──────────────────────────
        # Notifies Front Desk + Manager based on payment type.
        # Each call is guarded so a notification failure never breaks the payment.
        try:
            from notifications.service import NotificationService
            if self.payment_type == PaymentType.DEPOSIT:
                NotificationService.notify_deposit_received(booking, self.amount)
            elif self.payment_type == PaymentType.FULL_PAYMENT:
                NotificationService.notify_full_payment_received(booking, self.amount)
            elif self.payment_type == PaymentType.BALANCE_PAYMENT:
                NotificationService.notify_balance_collected(booking, self.amount)
            # MODIFICATION payments do not trigger a booking notification
        except Exception as exc:
            logger.warning(
                "Payment notification failed for payment pk=%s: %s",
                self.pk, exc,
            )

    def mark_paid_for_extension(self, modification, transaction_id=None, payload=None):
        """
        Called exclusively by the extension payment flow.

        Unlike mark_paid() which is designed for PENDING_PAYMENT → CONFIRMED
        transitions, this method handles payments made against CHECKED_IN
        bookings (i.e. stay extensions).

        What it does:
          1. Marks this Payment as PAID and generates a receipt number.
          2. Updates booking.payment_status to PAID.
          3. Calls modification.commit_to_booking() to apply the new
             check_out date and recalculated totals to the parent booking.
          4. Logs the extension in BookingStatusHistory via commit_to_booking().

        What it does NOT do:
          - Does not call booking.confirm_after_payment() — that method
            only works for PENDING_PAYMENT bookings and would raise ValueError.
          - Does not change booking.status (stays CHECKED_IN).
          - Does not generate a new reference_number or checkin_pin.

        Args:
            modification (BookingModification): The AWAITING_PAYMENT
                extension modification being settled.
            transaction_id (str, optional): Provider or desk transaction ID.
            payload (dict, optional): Raw provider response for audit trail.

        Returns:
            self (Payment): The updated Payment instance.
        """
        from bookings.models import BookingStatus, PaymentStatus as BPaymentStatus

        booking = self.booking

        # Guard: only for checked-in bookings
        if booking.status != BookingStatus.CHECKED_IN:
            raise ValueError(
                f"mark_paid_for_extension() requires a CHECKED_IN booking "
                f"(current status: '{booking.status}')."
            )

        # ── Step 1: Mark payment as PAID ──────────────────────────────────────
        self.status = PaymentStatus.PAID
        self.paid_at = timezone.now()
        self.receipt_number = generate_receipt_number()

        if transaction_id:
            self.transaction_id = transaction_id
        if payload:
            self.provider_payload = payload

        self.save(update_fields=[
            "status", "paid_at", "receipt_number",
            "transaction_id", "provider_payload", "updated_at",
        ])

        # ── Step 2: Update booking payment status ─────────────────────────────
        booking.payment_status = BPaymentStatus.PAID
        booking.save(update_fields=["payment_status", "updated_at"])

        # ── Step 3: Commit extension dates + totals to booking ────────────────
        # commit_to_booking() updates check_out, nights, total_price and
        # writes a BookingStatusHistory entry for full audit trail.
        modification.commit_to_booking(changed_by=None)

        logger.info(
            "Extension payment settled — booking pk=%s receipt=%s "
            "new_check_out=%s new_total=%s",
            booking.pk,
            self.receipt_number,
            modification.new_check_out,
            modification.new_total,
        )

        # ── Step 4: Notify relevant staff ─────────────────────────────────────
        try:
            from notifications.service import NotificationService
            NotificationService.notify_extension_payment_received(booking, self.amount)
        except Exception as exc:
            logger.warning(
                "Extension payment notification failed for payment pk=%s: %s",
                self.pk, exc,
            )

        return self

    def mark_failed(self, payload=None):
        self.status = PaymentStatus.FAILED
        if payload:
            self.provider_payload = payload
        self.save(update_fields=["status", "provider_payload", "updated_at"])

        # Notify Admin + Front Desk of payment failure
        try:
            from notifications.service import NotificationService
            NotificationService.notify_payment_failed(self.booking)
        except Exception as exc:
            logger.warning(
                "notify_payment_failed failed for payment pk=%s: %s",
                self.pk, exc,
            )

    def mark_expired(self):
        self.status = PaymentStatus.EXPIRED
        self.save(update_fields=["status", "updated_at"])


class Refund(models.Model):
    class RefundStatus(models.TextChoices):
        PENDING   = "pending",   "Pending"
        COMPLETED = "completed", "Completed"
        FAILED    = "failed",    "Failed"

    payment = models.ForeignKey(
        Payment, on_delete=models.CASCADE, related_name="refunds"
    )
    amount             = models.DecimalField(max_digits=10, decimal_places=2)
    reason             = models.TextField(blank=True)
    status             = models.CharField(
        max_length=20, choices=RefundStatus.choices, default=RefundStatus.PENDING
    )
    provider_refund_id = models.CharField(max_length=255, blank=True, null=True)
    initiated_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="initiated_refunds",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_refunds"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Refund {self.pk} — {self.amount} PHP ({self.get_status_display()})"