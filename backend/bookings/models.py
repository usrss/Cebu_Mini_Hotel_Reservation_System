import random
from datetime import timedelta
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator


# ─── Enums ────────────────────────────────────────────────────────────────────

class BookingStatus(models.TextChoices):
    PENDING         = "pending",         "Pending"           # alias kept for rooms.is_available_for_dates()
    AWAITING_PAYMENT = "awaiting_payment", "Awaiting Payment"
    CONFIRMED       = "confirmed",       "Confirmed"
    CHECKED_IN      = "checked_in",      "Checked In"
    CHECKED_OUT     = "checked_out",     "Checked Out"
    CANCELLED       = "cancelled",       "Cancelled"
    NO_SHOW         = "no_show",         "No Show"


class PaymentStatus(models.TextChoices):
    UNPAID              = "unpaid",             "Unpaid"
    PAID                = "paid",               "Paid"
    REFUNDED            = "refunded",           "Refunded"
    PARTIALLY_REFUNDED  = "partially_refunded", "Partially Refunded"
    FAILED              = "failed",             "Failed"


class RefundStatus(models.TextChoices):
    NONE      = "none",      "None"
    PENDING   = "pending",   "Pending"
    COMPLETED = "completed", "Completed"
    FAILED    = "failed",    "Failed"


# ─── Status transition map ────────────────────────────────────────────────────

ALLOWED_TRANSITIONS = {
    BookingStatus.AWAITING_PAYMENT: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
    BookingStatus.PENDING:          [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
    BookingStatus.CONFIRMED:        [BookingStatus.CHECKED_IN, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
    BookingStatus.CHECKED_IN:       [BookingStatus.CHECKED_OUT],
    BookingStatus.CHECKED_OUT:      [],
    BookingStatus.CANCELLED:        [],
    BookingStatus.NO_SHOW:          [],
}

# Statuses that block a room from being booked — must match rooms.is_available_for_dates()
BLOCKING_STATUSES = [
    BookingStatus.AWAITING_PAYMENT,
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_IN,
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def generate_reference_number():
    """Generate unique booking reference like CMH-2026-000124."""
    year = timezone.now().year
    while True:
        seq = random.randint(1, 999999)
        ref = f"CMH-{year}-{seq:06d}"
        if not Booking.objects.filter(reference_number=ref).exists():
            return ref


def generate_checkin_pin():
    """Generate a secure 4-digit numeric PIN."""
    return f"{random.randint(1000, 9999)}"


# ─── Booking ──────────────────────────────────────────────────────────────────

class Booking(models.Model):
    """
    Core booking record. Single source of truth for reservation state.

    Field naming convention deliberately matches rooms.Room.is_available_for_dates():
      - check_in  (DateField)
      - check_out (DateField)
      - status    (CharField)
    """

    # Reference & PIN
    reference_number = models.CharField(max_length=20, unique=True, editable=False)
    checkin_pin      = models.CharField(max_length=4, editable=False)

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

    # Price snapshot (immutable after creation — never recalculate from room table)
    room_price_snapshot = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal            = models.DecimalField(max_digits=10, decimal_places=2)
    tax                 = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    service_fee         = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_price         = models.DecimalField(max_digits=10, decimal_places=2)

    # Status — field name matches rooms.is_available_for_dates() filter on `status`
    status = models.CharField(
        max_length=20,
        choices=BookingStatus.choices,
        default=BookingStatus.AWAITING_PAYMENT,
        db_index=True,
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
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
            # PostgreSQL partial index — fast lookup of active bookings only
            models.Index(
                fields=["room", "check_in", "check_out"],
                name="bookings_room_dates_idx",
            ),
        ]

    def __str__(self):
        return f"Booking {self.reference_number} — {self.full_name}"

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

    # ── Cancellation / refund ──────────────────────────────────────────────

    def compute_refund(self):
        """
        Returns (refund_percentage, refund_amount) based on policy:
          ≥ 48 h before check-in  → 90 %
          <  48 h before check-in → 50 %
          Same day / past         →  0 %
        """
        from decimal import Decimal
        now_date     = timezone.now().date()
        hours_until  = (self.check_in - now_date).total_seconds() / 3600

        if hours_until >= 48:
            pct = Decimal("90")
        elif hours_until > 0:
            pct = Decimal("50")
        else:
            pct = Decimal("0")

        amount = (self.total_price * pct / 100).quantize(Decimal("0.01"))
        return pct, amount

    # ── Expiration ─────────────────────────────────────────────────────────

    @property
    def is_expired(self):
        if self.status not in (BookingStatus.AWAITING_PAYMENT, BookingStatus.PENDING):
            return False
        return timezone.now() > self.created_at + timedelta(minutes=30)


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
        return f"{self.booking.reference_number}: {self.old_status} → {self.new_status}"