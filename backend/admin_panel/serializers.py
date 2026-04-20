"""
admin_panel/serializers.py

Serializers for:
  1. Guest Management   — CustomUser viewed / managed by staff
  2. Payment Management — Payment + Refund (uses the actual Refund model)
  3. Review Management  — RoomReview moderation

Verified against:
  - payments/models.py : Payment fields (checkout_session_id, NOT session_id)
                         Refund model with inner RefundStatus class
                         NO refund_amount / refund_status / refunded_at on Payment
  - users/models.py    : CustomUser (email, first_name, last_name, phone,
                         is_staff, is_active, date_joined, get_full_name())
  - bookings/models.py : Booking, BookingStatus
  - rooms/models.py    : RoomReview
"""

from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from bookings.models import Booking, BookingStatus
from payments.models import Payment, PaymentStatus, Refund
from rooms.models import RoomReview
import logging
logger = logging.getLogger(__name__)
from payments.services import PayMongoService, PayPalService, send_refund_confirmation_email
from decimal import Decimal
from django.conf import settings
User = get_user_model()


# ─── Shared mini-serializer ────────────────────────────────────────────────────

class _BookingMiniSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source="room.room_number",           read_only=True)
    room_type   = serializers.CharField(source="room.get_room_type_display", read_only=True)

    class Meta:
        model  = Booking
        fields = [
            "id", "reference_number", "room_number", "room_type",
            "check_in", "check_out", "status",
            "total_price", "created_at",
        ]


# ═══════════════════════════════════════════════════════════════════════════════
# 1. GUEST MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class GuestListSerializer(serializers.ModelSerializer):
    """Lightweight list view of guest (non-staff) accounts."""
    full_name     = serializers.CharField(source="get_full_name", read_only=True)
    booking_count = serializers.SerializerMethodField()
    total_spent   = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            "id", "email", "full_name",
            "first_name", "last_name", "phone",
            "is_active", "date_joined",
            "booking_count", "total_spent",
        ]
        read_only_fields = fields

    def get_booking_count(self, obj):
        return obj.bookings.count()

    def get_total_spent(self, obj):
        result = obj.payments.filter(
            status=PaymentStatus.PAID
        ).aggregate(total=Sum("amount"))
        return result["total"] or 0


class GuestDetailSerializer(serializers.ModelSerializer):
    """Full guest profile including recent bookings."""
    full_name      = serializers.CharField(source="get_full_name", read_only=True)
    booking_count  = serializers.SerializerMethodField()
    total_spent    = serializers.SerializerMethodField()
    recent_bookings = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            "id", "email", "full_name",
            "first_name", "last_name", "phone",
            "is_active", "is_staff",
            "date_joined", "last_login",
            "booking_count", "total_spent",
            "recent_bookings",
        ]
        read_only_fields = fields

    def get_booking_count(self, obj):
        return obj.bookings.count()

    def get_total_spent(self, obj):
        result = obj.payments.filter(
            status=PaymentStatus.PAID
        ).aggregate(total=Sum("amount"))
        return result["total"] or 0

    def get_recent_bookings(self, obj):
        recent = (
            obj.bookings
            .select_related("room")
            .order_by("-created_at")[:5]
        )
        return _BookingMiniSerializer(recent, many=True).data


class GuestBlockSerializer(serializers.Serializer):
    """Block or re-activate a guest account."""
    is_active = serializers.BooleanField(
        help_text="False = block the account. True = re-activate."
    )
    reason = serializers.CharField(
        max_length=500, required=False, allow_blank=True,
        help_text="Internal reason for the action (not shown to guest).",
    )

    def update(self, instance, validated_data):
        instance.is_active = validated_data["is_active"]
        instance.save(update_fields=["is_active"])
        return instance


# ═══════════════════════════════════════════════════════════════════════════════
# 2. PAYMENT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class RefundSerializer(serializers.ModelSerializer):
    """
    Nested read-only serializer for Refund records attached to a Payment.
    Refund.RefundStatus is an inner TextChoices class: PENDING, COMPLETED, FAILED.
    """
    status_display     = serializers.CharField(source="get_status_display", read_only=True)
    initiated_by_email = serializers.SerializerMethodField()

    class Meta:
        model  = Refund
        fields = [
            "id", "amount", "reason",
            "status", "status_display",
            "provider_refund_id",
            "initiated_by", "initiated_by_email",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_initiated_by_email(self, obj):
        return obj.initiated_by.email if obj.initiated_by else None


class PaymentAdminSerializer(serializers.ModelSerializer):
    """
    Full payment record for admin / manager / front-desk views.

    Field names exactly match payments/models.py:
      - checkout_session_id  (NOT session_id)
      - Refunds are nested via the Refund model FK (related_name="refunds")
      - NO refund_amount / refund_status / refunded_at on Payment itself
    """
    booking_reference      = serializers.CharField(
        source="booking.reference_number", read_only=True
    )
    guest_email            = serializers.SerializerMethodField()
    guest_name             = serializers.SerializerMethodField()
    room_number            = serializers.CharField(
        source="booking.room.room_number", read_only=True
    )
    status_display         = serializers.CharField(source="get_status_display",         read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    payment_type_display   = serializers.CharField(source="get_payment_type_display",   read_only=True)
    provider_display       = serializers.CharField(source="get_provider_display",       read_only=True)

    # Refunds are a separate model — nested here as read-only
    refunds        = RefundSerializer(many=True, read_only=True)
    refund_count   = serializers.SerializerMethodField()
    total_refunded = serializers.SerializerMethodField()

    class Meta:
        model  = Payment
        fields = [
            "id",
            "receipt_number",
            "booking", "booking_reference",
            "guest_email", "guest_name", "room_number",
            "amount", "currency",
            "status", "status_display",
            "payment_method", "payment_method_display",
            "payment_type", "payment_type_display",
            "provider", "provider_display",
            "transaction_id",
            "checkout_url",
            "checkout_session_id",   # exact field name on Payment model
            "paid_at", "expires_at",
            "refunds", "refund_count", "total_refunded",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_guest_email(self, obj):
        user = getattr(obj.booking, "user", None)
        if user:
            return user.email
        return getattr(obj.booking, "email", None) or "walk-in"

    def get_guest_name(self, obj):
        user = getattr(obj.booking, "user", None)
        if user:
            return user.get_full_name()
        return getattr(obj.booking, "full_name", None) or "Walk-in Guest"

    def get_refund_count(self, obj):
        return obj.refunds.count()

    def get_total_refunded(self, obj):
        result = obj.refunds.filter(
            status=Refund.RefundStatus.COMPLETED
        ).aggregate(total=Sum("amount"))
        return result["total"] or 0


class PaymentConfirmSerializer(serializers.Serializer):
    """
    Manually confirm a cash / walk-in payment.
    POST /api/admin/payments/<id>/confirm/

    NOTE: We do NOT call payment.mark_paid() here.
    mark_paid() also calls booking.confirm_after_payment() which is only for
    the online payment flow. For manual cash confirmation the booking is already
    in the correct state — we only flip payment.status and record paid_at.
    """
    notes = serializers.CharField(
        max_length=500, required=False, allow_blank=True,
        help_text="Optional notes (e.g. 'Cash received at front desk').",
    )

    def validate(self, attrs):
        payment = self.instance
        if payment.status == PaymentStatus.PAID:
            raise serializers.ValidationError("Payment is already marked as paid.")
        if payment.status in (PaymentStatus.REFUNDED, PaymentStatus.CANCELLED):
            raise serializers.ValidationError(
                f"Cannot confirm a {payment.get_status_display()} payment."
            )
        return attrs

    def update(self, instance, validated_data):
        from payments.models import generate_receipt_number
        from bookings.models import BookingStatus

        instance.status = PaymentStatus.PAID
        instance.paid_at = timezone.now()
        if not instance.receipt_number:
            instance.receipt_number = generate_receipt_number()
        instance.save(update_fields=["status", "paid_at", "receipt_number", "updated_at"])

        booking = instance.booking
        if booking.status == BookingStatus.PENDING_PAYMENT:
            booking.confirm_after_payment(
                changed_by=self.context["request"].user
            )

        return instance


class RefundInitiateSerializer(serializers.Serializer):
    """
    Initiate a refund by creating a Refund record and calling the provider.
    POST /api/admin/payments/<id>/refund/

    Architecture (verified against payments/models.py):
      - Payment has NO refund_amount / refund_status / refunded_at fields.
      - Refunds are tracked via the Refund model (FK → Payment, related_name="refunds").
      - Refund.RefundStatus is an inner TextChoices class: PENDING, COMPLETED, FAILED.
      - Payment.status is set to REFUNDED only when the full amount has been refunded.
    """
    refund_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False,
        help_text="Amount to refund in PHP. Defaults to full remaining amount if omitted.",
    )
    reason = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default="",
        help_text="Reason code for PayMongo: duplicate, fraudulent, requested_by_customer, other",
    )
    notes = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default="",
        help_text="Additional notes about the refund (stored internally)",
    )

    def validate_reason(self, value):
        """Ensure reason is one of PayMongo's accepted values."""
        if not value:
            return "requested_by_customer"  # default

        valid_reasons = ["duplicate", "fraudulent", "requested_by_customer", "other"]
        if value not in valid_reasons:
            # Map common text to valid reasons
            lower = value.lower()
            if "duplicate" in lower or "double" in lower:
                return "duplicate"
            elif "fraud" in lower or "scam" in lower:
                return "fraudulent"
            elif "customer" in lower or "guest" in lower or "request" in lower:
                return "requested_by_customer"
            else:
                return "other"
        return value

    def validate(self, attrs):
        payment = self.instance

        if payment.status != PaymentStatus.PAID:
            raise serializers.ValidationError(
                f"Can only refund a PAID payment. Current status: {payment.get_status_display()}."
            )

        already_refunded = (
                payment.refunds
                .filter(status=Refund.RefundStatus.COMPLETED)
                .aggregate(total=Sum("amount"))["total"] or 0
        )
        remaining = payment.amount - already_refunded

        if remaining <= 0:
            raise serializers.ValidationError("This payment has already been fully refunded.")

        refund_amount = attrs.get("refund_amount") or remaining
        if refund_amount > remaining:
            raise serializers.ValidationError(
                f"Refund amount ({refund_amount}) exceeds remaining refundable "
                f"amount ({remaining})."
            )

        attrs["refund_amount"] = refund_amount
        attrs["already_refunded"] = already_refunded
        return attrs

    def update(self, instance, validated_data):
        refund_amount = validated_data["refund_amount"]
        reason = validated_data.get("reason", "requested_by_customer")
        notes = validated_data.get("notes", "")
        cash_refund = validated_data.get("cash_refund", False)
        actor = self.context["request"].user

        # Step 1 — persist refund as PENDING
        refund = Refund.objects.create(
            payment=instance,
            amount=refund_amount,
            reason=notes or reason,
            status=Refund.RefundStatus.PENDING,
            initiated_by=actor,
        )

        # Step 2 — call provider OR handle manual
        try:
            provider = instance.provider

            if provider == "paymongo":
                result = PayMongoService.create_refund(instance, refund_amount, reason)
                refund.provider_refund_id = result.get("refund_id", "")
            elif provider == "paypal":
                result = PayPalService.create_refund(instance, refund_amount, reason)
                refund.provider_refund_id = result.get("refund_id", "")
            else:
                # Manual/cash refund - just mark as completed
                # Could add additional logic here (e.g., require manager approval)
                pass

            refund.status = Refund.RefundStatus.COMPLETED
            refund.save(update_fields=["status", "provider_refund_id", "updated_at"])

            # Step 2b — Send refund confirmation email to guest (skip for walk-ins without email?)
            if instance.booking.email or (instance.booking.user and instance.booking.user.email):
                try:
                    send_refund_confirmation_email(
                        payment=instance,
                        refund_amount=refund_amount,
                        reason=reason,
                        notes=notes
                    )
                except Exception as email_err:
                    logger.warning(
                        "Refund processed but email failed for payment %s: %s",
                        instance.pk, email_err
                    )

        except Exception as e:
            refund.status = Refund.RefundStatus.FAILED
            refund.save(update_fields=["status", "updated_at"])
            raise serializers.ValidationError(
                f"Refund submitted but the provider returned an error: {str(e)}. "
                "Status set to FAILED — check the provider dashboard."
            )

        # Step 3 — flip Payment.status if fully refunded
        total_refunded = (
                instance.refunds
                .filter(status=Refund.RefundStatus.COMPLETED)
                .aggregate(total=Sum("amount"))["total"] or 0
        )
        if total_refunded >= instance.amount:
            instance.status = PaymentStatus.REFUNDED
            instance.save(update_fields=["status", "updated_at"])

        # Step 4 — Log manual refund for audit
        if provider not in ["paymongo", "paypal"]:
            logger.info(
                "Manual refund issued by %s for payment %s: amount=%s, reason=%s",
                actor.email, instance.pk, refund_amount, reason
            )

        return instance


# ═══════════════════════════════════════════════════════════════════════════════
# 3. REVIEW MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class ReviewAdminSerializer(serializers.ModelSerializer):
    """Full review record for admin / manager moderation views."""
    guest_email       = serializers.EmailField(source="guest.email",               read_only=True)
    guest_name        = serializers.CharField(read_only=True)
    room_number       = serializers.CharField(source="room.room_number",           read_only=True)
    room_type         = serializers.CharField(source="room.get_room_type_display", read_only=True)
    booking_reference = serializers.CharField(
        source="booking.reference_number", read_only=True
    )
    star_display      = serializers.CharField(read_only=True)
    helpful_count     = serializers.IntegerField(read_only=True)
    not_helpful_count = serializers.IntegerField(read_only=True)

    class Meta:
        model  = RoomReview
        fields = [
            "id",
            "room", "room_number", "room_type",
            "booking", "booking_reference",
            "guest", "guest_email", "guest_name",
            "rating", "star_display",
            "review_text",
            "is_verified", "is_visible",
            "helpful_count", "not_helpful_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "room", "room_number", "room_type",
            "booking", "booking_reference",
            "guest", "guest_email", "guest_name",
            "rating", "star_display", "review_text",
            "is_verified", "helpful_count", "not_helpful_count",
            "created_at", "updated_at",
        ]


class ReviewVisibilitySerializer(serializers.Serializer):
    """
    Show or hide a review from public pages.
    PATCH /api/admin/reviews/<id>/visibility/
    """
    is_visible = serializers.BooleanField(
        help_text="False = hide from public. True = show."
    )
    reason = serializers.CharField(
        max_length=500, required=False, allow_blank=True,
        help_text="Internal moderation reason (not shown to guests).",
    )

    def update(self, instance, validated_data):
        instance.is_visible = validated_data["is_visible"]
        instance.save(update_fields=["is_visible", "updated_at"])
        return instance