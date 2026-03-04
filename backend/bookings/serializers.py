from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from rooms.models import Room, RoomStatus  # noqa


from .models import (
    Booking, BookingStatus, BookingStatusHistory,
    PaymentStatus, RefundStatus, BLOCKING_STATUSES,
)

TAX_RATE        = Decimal("0.12")
SERVICE_FEE_PCT = Decimal("0.05")


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

    # Payment breakdown — consumed by PaymentPage.jsx and MybookingDetailPage.jsx
    amount_paid       = serializers.SerializerMethodField()
    amount_due        = serializers.SerializerMethodField()
    payment_type_used = serializers.SerializerMethodField()

    # ✅ FIX (Problem 6): expose discount info so confirmation and detail pages
    #    can render a "You saved ₱X" row in the price summary.
    original_price_per_night = serializers.SerializerMethodField()
    discount_percentage      = serializers.SerializerMethodField()
    discount_amount          = serializers.SerializerMethodField()

    def get_amount_paid(self, obj):
        from payments.models import PaymentStatus as PStatus
        total = obj.payments.filter(status=PStatus.PAID).aggregate(
            total=Sum('amount')
        )['total']
        return str(total or Decimal('0.00'))

    def get_amount_due(self, obj):
        from payments.models import PaymentStatus as PStatus
        paid = obj.payments.filter(status=PStatus.PAID).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        return str(max(obj.total_price - paid, Decimal('0.00')))

    def get_payment_type_used(self, obj):
        from payments.models import PaymentStatus as PStatus, PaymentType
        if obj.status not in [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED]:
            return 'none'
        has_full    = obj.payments.filter(status=PStatus.PAID, payment_type=PaymentType.FULL_PAYMENT).exists()
        has_deposit = obj.payments.filter(status=PStatus.PAID, payment_type=PaymentType.DEPOSIT).exists()
        has_balance = obj.payments.filter(status=PStatus.PAID, payment_type=PaymentType.BALANCE_PAYMENT).exists()
        if has_full or (has_deposit and has_balance):
            return 'settled'
        if has_deposit:
            return 'balance_payment'
        return 'full_payment'

    def get_original_price_per_night(self, obj):
        """The undiscounted base rate stored on the room."""
        return str(obj.room.price_per_night)

    def get_discount_percentage(self, obj):
        """The discount percentage that was active on the room."""
        return str(obj.room.discount_percentage or Decimal("0"))

    def get_discount_amount(self, obj):
        """
        Total savings = (original rate − snapshot rate) × nights.
        Returns '0.00' when no discount was applied.
        """
        original = obj.room.price_per_night
        snapshot = obj.room_price_snapshot
        nights   = obj.nights or 0
        savings  = max(original - snapshot, Decimal("0")) * nights
        return str(savings.quantize(Decimal("0.01")))

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
            "amount_paid", "amount_due", "payment_type_used",
            # ✅ new discount fields
            "original_price_per_night", "discount_percentage", "discount_amount",
            "created_at", "updated_at",
            "status_history",
        ]


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

        nights = (check_out - check_in).days

        # ✅ FIX (Problem 1): use calculate_total_price() which applies
        #    discount_percentage and seasonal pricing night-by-night,
        #    then derive the effective per-night snapshot from the total.
        #    This replaces the old `room.price_per_night` which ignored discounts entirely.
        total_room_cost     = room.calculate_total_price(check_in, check_out)
        room_price_snapshot = (
            (total_room_cost / nights).quantize(Decimal("0.01"))
            if nights > 0
            else (room.discounted_price or room.price_per_night)
        )

        subtotal    = (room_price_snapshot * nights).quantize(Decimal("0.01"))
        tax         = (subtotal * TAX_RATE).quantize(Decimal("0.01"))
        service_fee = (subtotal * SERVICE_FEE_PCT).quantize(Decimal("0.01"))
        total_price = subtotal + tax + service_fee

        booking = Booking.objects.create(
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


class BookingConfirmSerializer(serializers.Serializer):
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

        if amount > 0:
            try:
                from payments.models import Payment, PaymentStatus as PStatus, Refund  # noqa
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