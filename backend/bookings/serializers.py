from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from rest_framework import serializers

from rooms.models import Room, RoomStatus  # noqa

from .models import (
    Booking, BookingStatus, BookingStatusHistory,
    PaymentStatus, RefundStatus, BLOCKING_STATUSES,
)

TAX_RATE        = Decimal("0.12")   # 12 % VAT
SERVICE_FEE_PCT = Decimal("0.05")   # 5 % service fee


# ─── Overlap check ────────────────────────────────────────────────────────────

def check_overlapping_bookings(room, check_in, check_out, exclude_id=None):
    """
    Returns True if an active (blocking) booking overlaps the requested dates.
    BLOCKING_STATUSES includes PENDING_PAYMENT so pending bookings hold the room.
    """
    qs = Booking.objects.filter(
        room=room,
        status__in=BLOCKING_STATUSES,
        check_in__lt=check_out,
        check_out__gt=check_in,
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.exists()


# ─── Read serializers ─────────────────────────────────────────────────────────

class BookingStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = BookingStatusHistory
        fields = ["id", "old_status", "new_status", "changed_by_name", "note", "changed_at"]

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return obj.changed_by.get_full_name() or obj.changed_by.email
        return "System"


class BookingListSerializer(serializers.ModelSerializer):
    room_number            = serializers.CharField(source="room.room_number", read_only=True)
    room_type              = serializers.CharField(source="room.get_room_type_display", read_only=True)
    status_display         = serializers.CharField(source="get_status_display", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    # reference_number may be null — safe to expose; null = not yet confirmed
    has_credentials        = serializers.BooleanField(read_only=True)

    class Meta:
        model  = Booking
        fields = [
            "id", "reference_number",
            "room_number", "room_type",
            "full_name", "email", "phone",
            "check_in", "check_out", "nights", "guests_count",
            "total_price",
            "status", "status_display",
            "payment_status", "payment_status_display",
            "has_credentials",
            "created_at",
        ]


class BookingDetailSerializer(serializers.ModelSerializer):
    room_number            = serializers.CharField(source="room.room_number", read_only=True)
    room_type              = serializers.CharField(source="room.get_room_type_display", read_only=True)
    room_floor             = serializers.IntegerField(source="room.floor", read_only=True)
    room_bed_type          = serializers.CharField(source="room.get_bed_type_display", read_only=True)
    status_display         = serializers.CharField(source="get_status_display", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    refund_status_display  = serializers.CharField(source="get_refund_status_display", read_only=True)
    status_history         = BookingStatusHistorySerializer(many=True, read_only=True)
    is_expired             = serializers.BooleanField(read_only=True)
    has_credentials        = serializers.BooleanField(read_only=True)
    payment_deadline       = serializers.DateTimeField(read_only=True)
    amount_paid            = serializers.SerializerMethodField()
    amount_due             = serializers.SerializerMethodField()
    payment_type_used      = serializers.SerializerMethodField()

    # Credentials are included in the serializer output but will be null
    # until the booking is CONFIRMED. The frontend must handle null gracefully.
    # checkin_pin is intentionally included here so the confirmation page
    # can display it immediately after payment — but it will be null/absent
    # for any unconfirmed booking.

    class Meta:
        model  = Booking
        fields = [
            "id", "reference_number", "checkin_pin",
            "user",
            "room", "room_number", "room_type", "room_floor", "room_bed_type",
            "full_name", "email", "phone",
            "check_in", "check_out", "nights", "guests_count",
            "room_price_snapshot", "subtotal", "tax", "service_fee", "total_price",
            "status", "status_display",
            "payment_status", "payment_status_display",
            "confirmed_at",
            "cancelled_at", "cancellation_reason",
            "refund_percentage", "refund_amount",
            "refund_status", "refund_status_display",
            "is_expired", "has_credentials", "payment_deadline",
            "created_at", "updated_at",
            "status_history",
        ]


# ─── Booking creation (Phase 1 — PENDING_PAYMENT) ────────────────────────────

class BookingCreateSerializer(serializers.Serializer):
    """
    Creates a booking in PENDING_PAYMENT status.
    No reference number, QR code, or PIN is generated here.
    The room is soft-blocked for PAYMENT_WINDOW_MINUTES minutes.
    """
    room_id      = serializers.IntegerField()
    check_in     = serializers.DateField()
    check_out    = serializers.DateField()
    guests_count = serializers.IntegerField(min_value=1)
    full_name    = serializers.CharField(max_length=255, required=False)
    email        = serializers.EmailField(required=False)
    phone        = serializers.CharField(max_length=30, required=False)

    def validate(self, data):
        today = timezone.now().date()

        if data["check_in"] < today:
            raise serializers.ValidationError({"check_in": "Check-in cannot be in the past."})
        if data["check_out"] <= data["check_in"]:
            raise serializers.ValidationError({"check_out": "Check-out must be after check-in."})
        if (data["check_out"] - data["check_in"]).days > 90:
            raise serializers.ValidationError("Booking cannot exceed 90 nights.")

        try:
            room = Room.objects.get(pk=data["room_id"], is_active=True)
        except Room.DoesNotExist:
            raise serializers.ValidationError({"room_id": "Room not found."})

        if room.status != RoomStatus.AVAILABLE:
            raise serializers.ValidationError(
                {"room_id": f"Room is not available (current status: {room.status})."}
            )

        if data["guests_count"] > room.capacity:
            raise serializers.ValidationError(
                {"guests_count": f"Room capacity is {room.capacity} guest(s)."}
            )

        data["room"] = room

        request = self.context.get("request")
        user    = request.user if request and request.user.is_authenticated else None

        if user:
            data.setdefault("full_name", user.get_full_name() or user.email)
            data.setdefault("email", user.email)
            data.setdefault("phone", getattr(user, "phone", "") or "")
        else:
            for field in ["full_name", "email", "phone"]:
                if not data.get(field):
                    raise serializers.ValidationError(
                        {field: "This field is required for guest bookings."}
                    )

        return data

    @transaction.atomic
    def create(self, validated_data):
        room      = validated_data["room"]
        check_in  = validated_data["check_in"]
        check_out = validated_data["check_out"]

        request = self.context.get("request")
        user    = request.user if request and request.user.is_authenticated else None

        # Lock the room row to prevent race conditions
        room = Room.objects.select_for_update().get(pk=room.pk)

        if check_overlapping_bookings(room, check_in, check_out):
            raise serializers.ValidationError(
                "This room is no longer available for the selected dates."
            )

        nights              = (check_out - check_in).days
        room_price_snapshot = room.price_per_night
        subtotal            = room_price_snapshot * nights
        tax                 = (subtotal * TAX_RATE).quantize(Decimal("0.01"))
        service_fee         = (subtotal * SERVICE_FEE_PCT).quantize(Decimal("0.01"))
        total_price         = subtotal + tax + service_fee

        # Phase 1: Create booking WITHOUT reference_number, checkin_pin
        # These are intentionally left NULL until payment is confirmed.
        booking = Booking.objects.create(
            # reference_number = NULL (not yet assigned)
            # checkin_pin      = NULL (not yet assigned)
            user                = user,
            room                = room,
            full_name           = validated_data["full_name"],
            email               = validated_data["email"],
            phone               = validated_data["phone"],
            check_in            = check_in,
            check_out           = check_out,
            nights              = nights,
            guests_count        = validated_data["guests_count"],
            room_price_snapshot = room_price_snapshot,
            subtotal            = subtotal,
            tax                 = tax,
            service_fee         = service_fee,
            total_price         = total_price,
            status              = BookingStatus.PENDING_PAYMENT,
            payment_status      = PaymentStatus.UNPAID,
        )

        BookingStatusHistory.objects.create(
            booking    = booking,
            old_status = "",
            new_status = BookingStatus.PENDING_PAYMENT,
            changed_by = user,
            note       = (
                f"Booking initiated. Room held for {Booking.PAYMENT_WINDOW_MINUTES} minutes "
                f"pending payment. No credentials generated."
            ),
        )

        return booking


# ─── Payment confirmation (Phase 2 — CONFIRMED) ───────────────────────────────

class BookingConfirmSerializer(serializers.Serializer):
    """
    Called by the payments app after a successful payment.
    Transitions PENDING_PAYMENT → CONFIRMED and generates credentials.
    This is the ONLY serializer allowed to produce reference_number / checkin_pin.
    """

    def validate(self, data):
        booking = self.context["booking"]

        if booking.status != BookingStatus.PENDING_PAYMENT:
            raise serializers.ValidationError(
                f"Booking is not in PENDING_PAYMENT status (current: '{booking.status}')."
            )
        if booking.is_expired:
            raise serializers.ValidationError(
                "Payment window has expired. Booking cannot be confirmed."
            )
        return data

    @transaction.atomic
    def save(self, **kwargs):
        booking    = self.context["booking"]
        request    = self.context.get("request")
        changed_by = request.user if request else None
        return booking.confirm_after_payment(changed_by=changed_by)


# ─── Status transition (staff only) ──────────────────────────────────────────

class BookingStatusUpdateSerializer(serializers.Serializer):
    """Staff-only manual status transition."""
    status = serializers.ChoiceField(choices=BookingStatus.choices)
    note   = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        booking    = self.context["booking"]
        new_status = data["status"]
        if not booking.can_transition_to(new_status):
            raise serializers.ValidationError(
                f"Cannot transition from '{booking.status}' to '{new_status}'."
            )
        return data

    @transaction.atomic
    def save(self, **kwargs):
        booking = self.context["booking"]
        request = self.context.get("request")
        user    = request.user if request else None
        return booking.transition_to(
            self.validated_data["status"],
            changed_by = user,
            note       = self.validated_data.get("note", ""),
        )


# ─── Check-in verification ────────────────────────────────────────────────────

class CheckInVerifySerializer(serializers.Serializer):
    """
    Verifies reference_number + checkin_pin for reception desk check-in.
    Only CONFIRMED bookings with credentials can pass this check.
    """
    reference_number = serializers.CharField()
    checkin_pin      = serializers.CharField(max_length=4, min_length=4)

    def validate(self, data):
        # reference_number is only set on CONFIRMED bookings
        try:
            booking = Booking.objects.select_related("room").get(
                reference_number=data["reference_number"]
            )
        except Booking.DoesNotExist:
            raise serializers.ValidationError({"reference_number": "Booking not found."})

        # Enforce: credentials only exist for CONFIRMED bookings (enforced by model),
        # but double-check status here for a clear error message.
        if booking.status != BookingStatus.CONFIRMED:
            raise serializers.ValidationError(
                {"status": f"Booking must be CONFIRMED before check-in (current: '{booking.status}')."}
            )

        if not booking.has_credentials:
            raise serializers.ValidationError(
                {"reference_number": "This booking has no valid check-in credentials."}
            )

        if booking.checkin_pin != data["checkin_pin"]:
            raise serializers.ValidationError({"checkin_pin": "Invalid PIN."})

        today = timezone.now().date()
        if booking.check_in != today:
            raise serializers.ValidationError(
                {"check_in": f"Check-in date is {booking.check_in}, not today ({today})."}
            )

        data["booking"] = booking
        return data


# ─── Cancellation ─────────────────────────────────────────────────────────────

class BookingCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        booking = self.context["booking"]
        if not booking.can_transition_to(BookingStatus.CANCELLED):
            raise serializers.ValidationError(
                f"Cannot cancel a booking with status '{booking.status}'."
            )
        return data

    @transaction.atomic
    def save(self, **kwargs):
        booking    = self.context["booking"]
        request    = self.context.get("request")
        user       = request.user if request else None
        old_status = booking.status

        # Refund only applies if payment was received (i.e. CONFIRMED or later)
        pct, amount = booking.compute_refund()

        booking.status              = BookingStatus.CANCELLED
        booking.cancelled_at        = timezone.now()
        booking.cancellation_reason = self.validated_data.get("reason", "")
        booking.refund_percentage   = pct
        booking.refund_amount       = amount
        booking.refund_status       = RefundStatus.PENDING if amount > 0 else RefundStatus.NONE

        if amount > 0:
            booking.payment_status = PaymentStatus.PARTIALLY_REFUNDED

        booking.save(update_fields=[
            "status", "cancelled_at", "cancellation_reason",
            "refund_percentage", "refund_amount", "refund_status",
            "payment_status", "updated_at",
        ])

        BookingStatusHistory.objects.create(
            booking    = booking,
            old_status = old_status,
            new_status = BookingStatus.CANCELLED,
            changed_by = user,
            note       = self.validated_data.get("reason", "Cancelled."),
        )

        # Sync Payment record and create Refund entry if applicable
        if amount > 0:
            try:
                from payments.models import (  # noqa
                    Payment,
                    PaymentStatus as PStatus,
                    Refund,
                )
                paid_payment = (
                    booking.payments
                    .filter(status=PStatus.PAID)
                    .order_by("-paid_at")
                    .first()
                )
                if paid_payment:
                    Refund.objects.create(
                        payment      = paid_payment,
                        amount       = amount,
                        reason       = self.validated_data.get("reason", "Booking cancelled."),
                        initiated_by = user,
                        status       = Refund.RefundStatus.PENDING,
                    )
                    paid_payment.status = PStatus.REFUNDED
                    paid_payment.save(update_fields=["status", "updated_at"])

            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(
                    "Could not sync payment refund for booking %s: %s",
                    booking.reference_number or booking.pk, exc,
                )

        return booking