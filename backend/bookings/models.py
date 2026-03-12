# bookings/models.py
import random
from datetime import timedelta
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator


# ─── Enums ────────────────────────────────────────────────────────────────────

class BookingStatus(models.TextChoices):
    PENDING_PAYMENT = "pending_payment", "Pending Payment"   # Created, awaiting payment
    CONFIRMED       = "confirmed",       "Confirmed"          # Payment received — credentials generated
    CHECKED_IN      = "checked_in",      "Checked In"
    CHECKED_OUT     = "checked_out",     "Checked Out"
    EXPIRED         = "expired",         "Expired"            # Payment window elapsed
    CANCELLED       = "cancelled",       "Cancelled"          # Explicitly cancelled
    NO_SHOW         = "no_show",         "No Show"


class PaymentStatus(models.TextChoices):
    UNPAID             = "unpaid",             "Unpaid"
    PAID               = "paid",               "Paid"
    REFUNDED           = "refunded",           "Refunded"
    PARTIALLY_REFUNDED = "partially_refunded", "Partially Refunded"
    FAILED             = "failed",             "Failed"


class RefundStatus(models.TextChoices):
    NONE      = "none",      "None"
    PENDING   = "pending",   "Pending"
    COMPLETED = "completed", "Completed"
    FAILED    = "failed",    "Failed"


# ─── Status transition map ────────────────────────────────────────────────────

ALLOWED_TRANSITIONS = {
    BookingStatus.PENDING_PAYMENT: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.EXPIRED],
    BookingStatus.CONFIRMED:       [BookingStatus.CHECKED_IN, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
    BookingStatus.CHECKED_IN:      [BookingStatus.CHECKED_OUT],
    BookingStatus.CHECKED_OUT:     [],
    BookingStatus.EXPIRED:         [],
    BookingStatus.CANCELLED:       [],
    BookingStatus.NO_SHOW:         [],
}

# Statuses that block a room from being booked — must match rooms.is_available_for_dates()
BLOCKING_STATUSES = [
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_IN,
]

# Statuses that are considered "access-granted" — only these may check in
ACCESS_GRANTED_STATUSES = [
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_IN,
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def generate_reference_number():
    """
    Generate a unique customer-facing reference like CMH-2026-000124.
    MUST only be called after successful payment confirmation.
    """
    year = timezone.now().year
    while True:
        seq = random.randint(1, 999999)
        ref = f"CMH-{year}-{seq:06d}"
        if not Booking.objects.filter(reference_number=ref).exists():
            return ref


def generate_checkin_pin():
    """
    Generate a secure 4-digit numeric PIN.
    MUST only be called after successful payment confirmation.
    """
    return f"{random.randint(1000, 9999)}"


# ─── Booking ──────────────────────────────────────────────────────────────────

class Booking(models.Model):
    """
    Core booking record. Single source of truth for reservation state.

    ── Two-phase booking design ──────────────────────────────────────────────
    Phase 1 — Creation (PENDING_PAYMENT):
      • Internal `id` is assigned by the DB.
      • `reference_number`, `checkin_pin` are NULL — not yet generated.
      • Room is soft-blocked via BLOCKING_STATUSES.
      • A payment window timer starts (PAYMENT_WINDOW_MINUTES).

    Phase 2 — Confirmation (CONFIRMED):
      • Payment is verified externally (payments app).
      • `reference_number` is generated and stored.
      • `checkin_pin` is generated and stored.
      • Room remains hard-locked for the booked dates.
      • Confirmation notification is triggered via signal.

    Access credentials (reference_number, checkin_pin) are NEVER present
    on PENDING_PAYMENT, EXPIRED, or CANCELLED bookings.

    Field naming deliberately matches rooms.Room.is_available_for_dates():
      - check_in  (DateField)
      - check_out (DateField)
      - status    (CharField)
    """

    # Payment window — room is held this many minutes before auto-expiry
    PAYMENT_WINDOW_MINUTES = 30

    # ── Internal ID (never exposed to guests before confirmation) ──────────
    # reference_number is NULL until payment is confirmed
    reference_number = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        editable=False,
        help_text="Generated ONLY after payment is confirmed. NULL for pending/expired bookings.",
    )

    # checkin_pin is NULL until payment is confirmed
    checkin_pin = models.CharField(
        max_length=4,
        null=True,
        blank=True,
        editable=False,
        help_text="Generated ONLY after payment is confirmed. NULL for pending/expired bookings.",
    )

    # Relations
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="bookings",
        help_text="Null for walk-in / guest bookings",
    )
    room = models.ForeignKey(
        "rooms.Room",
        on_delete=models.PROTECT,
        related_name="bookings",
    )

    # Guest snapshot — never rely solely on the user FK
    full_name = models.CharField(max_length=255)
    email     = models.EmailField()
    phone     = models.CharField(max_length=30)

    # Stay — field names match what rooms.is_available_for_dates() queries
    check_in     = models.DateField()
    check_out    = models.DateField()
    nights       = models.PositiveIntegerField()
    guests_count = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    # Price snapshot (immutable after creation)
    room_price_snapshot = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal            = models.DecimalField(max_digits=10, decimal_places=2)
    tax                 = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    service_fee         = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_price         = models.DecimalField(max_digits=10, decimal_places=2)

    # Status
    status = models.CharField(
        max_length=20,
        choices=BookingStatus.choices,
        default=BookingStatus.PENDING_PAYMENT,
        db_index=True,
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
    )

    # Confirmation timestamps
    confirmed_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Set when booking transitions to CONFIRMED after payment.",
    )

    # Cancellation / refund
    cancelled_at        = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)
    refund_percentage   = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    refund_amount       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refund_status       = models.CharField(
        max_length=20,
        choices=RefundStatus.choices,
        default=RefundStatus.NONE,
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bookings"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["reference_number"]),
            models.Index(fields=["status"]),
            models.Index(fields=["check_in", "check_out"]),
            models.Index(fields=["email"]),
            models.Index(
                fields=["room", "check_in", "check_out"],
                name="bookings_room_dates_idx",
            ),
        ]

    def __str__(self):
        ref = self.reference_number or f"(pending #{self.pk})"
        return f"Booking {ref} — {self.full_name}"

    # ── Credential helpers ─────────────────────────────────────────────────

    @property
    def has_credentials(self):
        """True only when reference_number and checkin_pin are both present."""
        return bool(self.reference_number and self.checkin_pin)

    @property
    def payment_deadline(self):
        """Datetime by which payment must be completed."""
        return self.created_at + timedelta(minutes=self.PAYMENT_WINDOW_MINUTES)

    @property
    def is_expired(self):
        """
        True if still in PENDING_PAYMENT and the payment window has elapsed.
        Does NOT apply to any other status.
        """
        if self.status != BookingStatus.PENDING_PAYMENT:
            return False
        return timezone.now() > self.payment_deadline

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def can_transition_to(self, new_status):
        return new_status in ALLOWED_TRANSITIONS.get(self.status, [])

    def transition_to(self, new_status, changed_by=None, note=""):
        if not self.can_transition_to(new_status):
            raise ValueError(
                f"Cannot transition from '{self.status}' to '{new_status}'."
            )
        old_status  = self.status
        self.status = new_status
        self.save(update_fields=["status", "updated_at"])

        BookingStatusHistory.objects.create(
            booking    = self,
            old_status = old_status,
            new_status = new_status,
            changed_by = changed_by,
            note       = note,
        )
        return self

    def confirm_after_payment(self, changed_by=None):
        """
        Called exclusively by the payments app after a successful payment.
        Generates credentials and transitions to CONFIRMED.
        This is the ONLY place reference_number and checkin_pin are created.
        """
        if self.status != BookingStatus.PENDING_PAYMENT:
            raise ValueError(
                f"Cannot confirm booking with status '{self.status}'. "
                "Only PENDING_PAYMENT bookings can be confirmed."
            )
        if self.is_expired:
            raise ValueError(
                "Cannot confirm booking: payment window has expired."
            )

        # Generate access credentials — only here, only after payment
        self.reference_number = generate_reference_number()
        self.checkin_pin      = generate_checkin_pin()
        self.status           = BookingStatus.CONFIRMED
        self.payment_status   = PaymentStatus.PAID
        self.confirmed_at     = timezone.now()

        self.save(update_fields=[
            "reference_number", "checkin_pin",
            "status", "payment_status", "confirmed_at", "updated_at",
        ])

        BookingStatusHistory.objects.create(
            booking    = self,
            old_status = BookingStatus.PENDING_PAYMENT,
            new_status = BookingStatus.CONFIRMED,
            changed_by = changed_by,
            note       = "Payment confirmed. Reference number and check-in credentials generated.",
        )
        return self

    # ── Cancellation / refund ──────────────────────────────────────────────

    def compute_refund(self):
        """
        Returns (refund_percentage, refund_amount) based on policy.
        Only CONFIRMED bookings are eligible for a refund (payment was made).
        PENDING_PAYMENT cancellations never have a refund.
          ≥ 48 h before check-in  → 90 %
          <  48 h before check-in → 50 %
          Same day / past         →  0 %
        """
        from decimal import Decimal

        # No refund if payment was never received
        if self.payment_status != PaymentStatus.PAID:
            return Decimal("0"), Decimal("0")

        now_date    = timezone.now().date()
        hours_until = (self.check_in - now_date).total_seconds() / 3600

        if hours_until >= 48:
            pct = Decimal("90")
        elif hours_until > 0:
            pct = Decimal("50")
        else:
            pct = Decimal("0")

        amount = (self.total_price * pct / 100).quantize(Decimal("0.01"))
        return pct, amount


# ─── Status History ───────────────────────────────────────────────────────────

class BookingStatusHistory(models.Model):
    """Full audit trail — one row per status change."""
    booking    = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="status_history")
    old_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="booking_status_changes",
    )
    note       = models.TextField(blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "booking_status_history"
        ordering = ["-changed_at"]

    def __str__(self):
        ref = self.booking.reference_number or f"(pending #{self.booking_id})"
        return f"{ref}: {self.old_status} → {self.new_status}"