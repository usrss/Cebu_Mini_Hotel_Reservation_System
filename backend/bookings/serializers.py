from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from rest_framework import serializers

from rooms.models import Room, RoomStatus # noqa

from .models import (
    Booking, BookingStatus, BookingStatusHistory,
    RefundStatus, BLOCKING_STATUSES,
    generate_reference_number, generate_checkin_pin,
)

TAX_RATE        = Decimal("0.12")   # 12 % VAT
SERVICE_FEE_PCT = Decimal("0.05")   # 5 % service fee


# ─── Overlap check ────────────────────────────────────────────────────────────

def check_overlapping_bookings(room, check_in, check_out, exclude_id=None):
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
            "cancelled_at", "cancellation_reason",
            "refund_percentage", "refund_amount",
            "refund_status", "refund_status_display",
            "is_expired",
            "created_at", "updated_at",
            "status_history",
        ]


# ─── Booking creation ─────────────────────────────────────────────────────────

class BookingCreateSerializer(serializers.Serializer):
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

        booking = Booking.objects.create(
            reference_number    = generate_reference_number(),
            checkin_pin         = generate_checkin_pin(),
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
            status              = BookingStatus.AWAITING_PAYMENT,
        )

        BookingStatusHistory.objects.create(
            booking    = booking,
            old_status = "",
            new_status = BookingStatus.AWAITING_PAYMENT,
            changed_by = user,
            note       = "Booking created.",
        )

        return booking


# ─── Status transition ────────────────────────────────────────────────────────

class BookingStatusUpdateSerializer(serializers.Serializer):
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
    reference_number = serializers.CharField()
    checkin_pin      = serializers.CharField(max_length=4, min_length=4)

    def validate(self, data):
        try:
            booking = Booking.objects.select_related("room").get(
                reference_number=data["reference_number"]
            )
        except Booking.DoesNotExist:
            raise serializers.ValidationError({"reference_number": "Booking not found."})

        if booking.checkin_pin != data["checkin_pin"]:
            raise serializers.ValidationError({"checkin_pin": "Invalid PIN."})

        if booking.status != BookingStatus.CONFIRMED:
            raise serializers.ValidationError(
                {"status": f"Booking must be CONFIRMED before check-in (current: '{booking.status}')."}
            )

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

        # ── Compute refund based on cancellation policy ────────────────────
        pct, amount = booking.compute_refund()

        # ── Update booking ─────────────────────────────────────────────────
        from .models import PaymentStatus as BPaymentStatus

        booking.status              = BookingStatus.CANCELLED
        booking.cancelled_at        = timezone.now()
        booking.cancellation_reason = self.validated_data.get("reason", "")
        booking.refund_percentage   = pct
        booking.refund_amount       = amount
        booking.refund_status       = RefundStatus.PENDING if amount > 0 else RefundStatus.NONE

        # Update payment_status on the booking to reflect refund
        if amount > 0:
            booking.payment_status = BPaymentStatus.PARTIALLY_REFUNDED
        # If fully refunded (100%) mark as refunded — 90% is still partial
        # since fees are non-refundable in most policies, keep PARTIALLY_REFUNDED

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

        # ── Sync Payment record and create Refund entry ────────────────────
        if amount > 0:
            try:
                from payments.models import ( # noqa

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
                    # Create a Refund record for tracking
                    Refund.objects.create(
                        payment      = paid_payment,
                        amount       = amount,
                        reason       = self.validated_data.get("reason", "Booking cancelled."),
                        initiated_by = user,
                        status       = Refund.RefundStatus.PENDING,
                    )
                    # Mark the payment as refunded
                    paid_payment.status = PStatus.REFUNDED
                    paid_payment.save(update_fields=["status", "updated_at"])

            except Exception as exc:
                # Don't block cancellation if payment sync fails — log it
                import logging
                logging.getLogger(__name__).warning(
                    "Could not sync payment refund for booking %s: %s",
                    booking.reference_number, exc,
                )

        return booking