# bookings/modification_serializers.py
"""
Serializers for the booking modification system.

Two main entry-point serializers:
  - RescheduleRequestSerializer   : validates + computes a reschedule preview
  - ExtendStayRequestSerializer   : validates + computes an extend-stay preview
  - ModificationDetailSerializer  : read-only, returned to the frontend
  - ModificationConfirmSerializer : commits a pre-computed modification
"""

from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from rest_framework import serializers

from bookings.models import (
    Booking,
    BookingStatus,
    BLOCKING_STATUSES,
)
from .models import (
    BookingModification,
    ModificationPayment,
    ModificationType,
    ModificationStatus,
)

TAX_RATE        = Decimal("0.12")
SERVICE_FEE_PCT = Decimal("0.05")


# ─── helpers ─────────────────────────────────────────────────────────────────

def _check_overlap(room, check_in, check_out, exclude_booking_id=None):
    """Return True if any blocking booking overlaps [check_in, check_out)."""
    qs = Booking.objects.filter(
        room=room,
        status__in=BLOCKING_STATUSES,
        check_in__lt=check_out,
        check_out__gt=check_in,
    )
    if exclude_booking_id:
        qs = qs.exclude(pk=exclude_booking_id)
    return qs.exists()


def _recalculate(room, check_in, check_out):
    """
    Recompute all price fields for the given date range.
    Returns a dict compatible with BookingModification price fields.
    """
    nights          = (check_out - check_in).days
    total_room_cost = room.calculate_total_price(check_in, check_out)

    if nights > 0:
        snapshot = (total_room_cost / nights).quantize(Decimal("0.01"))
    else:
        snapshot = room.discounted_price or room.price_per_night

    subtotal    = (snapshot * nights).quantize(Decimal("0.01"))
    tax         = (subtotal * TAX_RATE).quantize(Decimal("0.01"))
    service_fee = (subtotal * SERVICE_FEE_PCT).quantize(Decimal("0.01"))
    total       = subtotal + tax + service_fee

    return {
        "nights":                 nights,
        "new_room_price_snapshot": snapshot,
        "new_subtotal":           subtotal,
        "new_tax":                tax,
        "new_service_fee":        service_fee,
        "new_total":              total,
    }


def _assert_modifiable(booking):
    """Raise ValidationError if the booking cannot be modified."""
    if booking.status == BookingStatus.CONFIRMED:
        return
    raise serializers.ValidationError(
        f"Booking cannot be modified in status '{booking.status}'. "
        "Only CONFIRMED bookings may be rescheduled or extended."
    )


# ─── read serializer ─────────────────────────────────────────────────────────

class ModificationDetailSerializer(serializers.ModelSerializer):
    modification_type_display = serializers.CharField(
        source="get_modification_type_display", read_only=True
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )

    class Meta:
        model  = BookingModification
        fields = [
            "id", "booking",
            "modification_type", "modification_type_display",
            "status", "status_display",

            "original_check_in", "original_check_out", "original_nights", "original_total",
            "new_check_in", "new_check_out", "new_nights",
            "new_room_price_snapshot", "new_subtotal", "new_tax",
            "new_service_fee", "new_total",

            "price_difference",
            "processing_fee_deduction",
            "penalty_deduction",
            "net_refund_amount",

            "requires_additional_payment",
            "requires_refund",
            "no_price_change",

            "note",
            "created_at", "confirmed_at",
        ]
        read_only_fields = fields


# ─── Reschedule ───────────────────────────────────────────────────────────────

class RescheduleRequestSerializer(serializers.Serializer):
    """
    POST /api/bookings/my/<id>/reschedule/

    Validates the new dates, checks availability, computes the price delta,
    and creates a BookingModification in PENDING / AWAITING_PAYMENT /
    AWAITING_REFUND state.  Does NOT update the booking yet.
    """
    new_check_in  = serializers.DateField()
    new_check_out = serializers.DateField()

    def validate(self, data):
        booking       = self.context["booking"]
        new_check_in  = data["new_check_in"]
        new_check_out = data["new_check_out"]
        today         = timezone.now().date()

        # ── Status check ──────────────────────────────────────────────────────
        _assert_modifiable(booking)

        # ── Must be before original check-in ──────────────────────────────────
        if today >= booking.check_in:
            raise serializers.ValidationError(
                "Rescheduling is only allowed before the original check-in date."
            )

        # ── Date sanity ───────────────────────────────────────────────────────
        if new_check_in < today:
            raise serializers.ValidationError(
                {"new_check_in": "New check-in cannot be in the past."}
            )
        if new_check_out <= new_check_in:
            raise serializers.ValidationError(
                {"new_check_out": "New check-out must be after new check-in."}
            )
        if (new_check_out - new_check_in).days > 90:
            raise serializers.ValidationError(
                "Booking cannot exceed 90 nights."
            )

        # ── No-op guard ───────────────────────────────────────────────────────
        if new_check_in == booking.check_in and new_check_out == booking.check_out:
            raise serializers.ValidationError(
                "New dates are identical to the current booking dates."
            )

        # ── Availability check (exclude this booking) ─────────────────────────
        if _check_overlap(booking.room, new_check_in, new_check_out,
                          exclude_booking_id=booking.pk):
            raise serializers.ValidationError(
                "The room is not available for the selected dates. "
                "Please choose different dates."
            )

        data["booking"] = booking
        return data

    @transaction.atomic
    def save(self, **kwargs):
        booking       = self.validated_data["booking"]
        new_check_in  = self.validated_data["new_check_in"]
        new_check_out = self.validated_data["new_check_out"]
        request       = self.context.get("request")
        user          = request.user if request else None

        # Recheck availability inside the transaction (race-condition guard)
        room = booking.room.__class__.objects.select_for_update().get(pk=booking.room_id)
        if _check_overlap(room, new_check_in, new_check_out, exclude_booking_id=booking.pk):
            raise serializers.ValidationError(
                "The room was just booked for those dates. Please try again."
            )

        price_data = _recalculate(room, new_check_in, new_check_out)
        diff       = (price_data["new_total"] - booking.total_price).quantize(Decimal("0.01"))

        # Build the modification record
        mod = BookingModification(
            booking           = booking,
            requested_by      = user,
            modification_type = ModificationType.RESCHEDULE,
            original_check_in  = booking.check_in,
            original_check_out = booking.check_out,
            original_nights    = booking.nights,
            original_total     = booking.total_price,
            new_check_in       = new_check_in,
            new_check_out      = new_check_out,
            new_nights         = price_data["nights"],
            new_room_price_snapshot = price_data["new_room_price_snapshot"],
            new_subtotal       = price_data["new_subtotal"],
            new_tax            = price_data["new_tax"],
            new_service_fee    = price_data["new_service_fee"],
            new_total          = price_data["new_total"],
            price_difference   = diff,
        )

        if diff > Decimal("0"):
            # Guest owes more
            mod.status = ModificationStatus.AWAITING_PAYMENT

        elif diff < Decimal("0"):
            # Refund scenario — compute deductions
            penalty    = mod.compute_penalty()
            raw_refund = abs(diff)
            proc_fee   = (
                booking.total_price
                * BookingModification.PROCESSING_FEE_RATE
            ).quantize(Decimal("0.01"))
            net_refund = max(raw_refund - proc_fee - penalty, Decimal("0"))

            mod.penalty_deduction        = penalty
            mod.processing_fee_deduction = proc_fee
            mod.net_refund_amount        = net_refund
            mod.status = ModificationStatus.AWAITING_REFUND

        else:
            # No price difference → can confirm immediately
            mod.status = ModificationStatus.PENDING

        mod.save()
        return mod


# ─── Extend Stay ─────────────────────────────────────────────────────────────

class ExtendStayRequestSerializer(serializers.Serializer):
    """
    POST /api/bookings/my/<id>/extend/

    Validates the new (later) check-out date, checks availability only for
    the extension window, computes additional cost, and creates a
    BookingModification in AWAITING_PAYMENT state.
    """
    new_check_out = serializers.DateField()

    def validate(self, data):
        booking       = self.context["booking"]
        new_check_out = data["new_check_out"]
        today         = timezone.now().date()

        # ── Status check ──────────────────────────────────────────────────────
        if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN):
            raise serializers.ValidationError(
                f"Extend Stay is only available for CONFIRMED or CHECKED_IN bookings "
                f"(current: '{booking.status}')."
            )

        # ── Must be before current checkout ───────────────────────────────────
        if today >= booking.check_out:
            raise serializers.ValidationError(
                "Cannot extend a stay that has already ended."
            )

        # ── New checkout must be strictly later ───────────────────────────────
        if new_check_out <= booking.check_out:
            raise serializers.ValidationError(
                {"new_check_out": "New check-out must be after the current check-out date."}
            )

        if (new_check_out - booking.check_in).days > 90:
            raise serializers.ValidationError(
                "Total stay cannot exceed 90 nights."
            )

        # ── Availability — only check the EXTENSION window ────────────────────
        # (current booking already blocks check_in → current check_out)
        if _check_overlap(
            booking.room,
            booking.check_out,      # extension starts from current checkout
            new_check_out,
            exclude_booking_id=booking.pk,
        ):
            raise serializers.ValidationError(
                "The selected extension dates are not available. "
                "Another booking exists for those dates."
            )

        data["booking"] = booking
        return data

    @transaction.atomic
    def save(self, **kwargs):
        booking       = self.validated_data["booking"]
        new_check_out = self.validated_data["new_check_out"]
        request       = self.context.get("request")
        user          = request.user if request else None

        room = booking.room.__class__.objects.select_for_update().get(pk=booking.room_id)

        # Re-check extension window inside transaction
        if _check_overlap(
            room,
            booking.check_out,
            new_check_out,
            exclude_booking_id=booking.pk,
        ):
            raise serializers.ValidationError(
                "The extension dates were just booked. Please try again."
            )

        # Price for the full new range (reuse existing rate logic)
        price_data = _recalculate(room, booking.check_in, new_check_out)
        diff       = (price_data["new_total"] - booking.total_price).quantize(Decimal("0.01"))

        mod = BookingModification.objects.create(
            booking           = booking,
            requested_by      = user,
            modification_type = ModificationType.EXTEND,
            status            = ModificationStatus.AWAITING_PAYMENT,
            original_check_in  = booking.check_in,
            original_check_out = booking.check_out,
            original_nights    = booking.nights,
            original_total     = booking.total_price,
            new_check_in       = booking.check_in,  # check-in never changes for extend
            new_check_out      = new_check_out,
            new_nights         = price_data["nights"],
            new_room_price_snapshot = price_data["new_room_price_snapshot"],
            new_subtotal       = price_data["new_subtotal"],
            new_tax            = price_data["new_tax"],
            new_service_fee    = price_data["new_service_fee"],
            new_total          = price_data["new_total"],
            price_difference   = diff,   # always positive for extend
        )
        return mod


# ─── Confirm (no-charge path) ─────────────────────────────────────────────────

class ModificationConfirmSerializer(serializers.Serializer):
    """
    POST /api/bookings/my/<mod_id>/modification/confirm/

    Used when price_difference == 0 (no charge or refund needed).
    Commits the modification to the booking immediately.
    """

    def validate(self, data):
        mod = self.context["modification"]
        if mod.status != ModificationStatus.PENDING:
            raise serializers.ValidationError(
                f"Modification is not in PENDING state (current: '{mod.status}'). "
                "Modifications that require payment or refund must be processed "
                "through the payment gateway first."
            )
        if not mod.no_price_change:
            raise serializers.ValidationError(
                "This modification has a price difference and must go through payment."
            )
        return data

    @transaction.atomic
    def save(self, **kwargs):
        mod     = self.context["modification"]
        request = self.context.get("request")
        user    = request.user if request else None

        # Final availability re-check before commit
        booking = mod.booking
        if _check_overlap(
            booking.room,
            mod.new_check_in,
            mod.new_check_out,
            exclude_booking_id=booking.pk,
        ):
            raise serializers.ValidationError(
                "Dates are no longer available. Please start a new modification request."
            )

        mod.commit_to_booking(changed_by=user)
        return mod