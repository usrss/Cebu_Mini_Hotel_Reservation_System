from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers

from bookings.models import Booking, BookingStatus, PaymentStatus as BPaymentStatus
from .models import Payment, Refund, PaymentStatus, PaymentType, PaymentMethod, PaymentProvider, DEPOSIT_PERCENTAGE


# ─── Guard helpers ────────────────────────────────────────────────────────────

PAYABLE_BOOKING_STATUSES = [BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED]


def _assert_booking_payable(booking, user=None):
    """Shared validation — raises ValidationError if booking cannot be paid."""
    if booking.status not in PAYABLE_BOOKING_STATUSES:
        raise serializers.ValidationError(
            {"booking": f"Cannot pay a booking with status '{booking.status}'."}
        )
    if user and booking.user and booking.user != user:
        raise serializers.ValidationError(
            {"booking": "You do not own this booking."}
        )


def _existing_paid(booking):
    """Return True if this booking already has a successful full payment."""
    return booking.payments.filter(
        status=PaymentStatus.PAID,
        payment_type=PaymentType.FULL_PAYMENT,
    ).exists()


def _existing_paid_deposit(booking):
    """Return True if a paid deposit exists for this booking."""
    return booking.payments.filter(
        status=PaymentStatus.PAID,
        payment_type=PaymentType.DEPOSIT,
    ).exists()


def _existing_paid_balance(booking):
    """Return True if balance has already been paid."""
    return booking.payments.filter(
        status=PaymentStatus.PAID,
        payment_type=PaymentType.BALANCE_PAYMENT,
    ).exists()


# ─── Read serializers ─────────────────────────────────────────────────────────

class RefundSerializer(serializers.ModelSerializer):
    initiated_by_name = serializers.SerializerMethodField()
    status_display    = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = Refund
        fields = [
            "id", "amount", "reason",
            "status", "status_display",
            "provider_refund_id",
            "initiated_by_name",
            "created_at", "updated_at",
        ]

    def get_initiated_by_name(self, obj):
        if obj.initiated_by:
            return obj.initiated_by.get_full_name() or obj.initiated_by.email
        return "System"


class PaymentSerializer(serializers.ModelSerializer):
    status_display       = serializers.CharField(source="get_status_display",        read_only=True)
    payment_type_display = serializers.CharField(source="get_payment_type_display",  read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    provider_display     = serializers.CharField(source="get_provider_display",      read_only=True)
    is_expired           = serializers.BooleanField(read_only=True)
    is_successful        = serializers.BooleanField(read_only=True)
    refunds              = RefundSerializer(many=True, read_only=True)

    # Denormalized booking info for convenience
    booking_reference    = serializers.CharField(source="booking.reference_number",  read_only=True)
    room_number          = serializers.CharField(source="booking.room.room_number",  read_only=True)

    class Meta:
        model  = Payment
        fields = [
            "id", "receipt_number",
            "booking", "booking_reference", "room_number",
            "user",
            "amount", "currency",
            "payment_type", "payment_type_display",
            "provider", "provider_display",
            "payment_method", "payment_method_display",
            "status", "status_display",
            "transaction_id", "checkout_url", "checkout_session_id",
            "is_expired", "is_successful",
            "paid_at", "expires_at",
            "created_at", "updated_at",
            "refunds",
        ]


class PaymentListSerializer(serializers.ModelSerializer):
    """Lightweight — used in list views and admin dashboards."""
    status_display         = serializers.CharField(source="get_status_display",          read_only=True)
    payment_type_display   = serializers.CharField(source="get_payment_type_display",    read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display",  read_only=True)
    booking_reference      = serializers.CharField(source="booking.reference_number",    read_only=True)
    room_number            = serializers.CharField(source="booking.room.room_number",    read_only=True)

    class Meta:
        model  = Payment
        fields = [
            "id", "receipt_number",
            "booking", "booking_reference", "room_number",
            "amount", "currency",
            "payment_type", "payment_type_display",
            "payment_method", "payment_method_display",
            "status", "status_display",
            "paid_at", "created_at",
        ]


# ─── Checkout initiation ──────────────────────────────────────────────────────

class InitiatePaymentSerializer(serializers.Serializer):
    """
    POST /api/payments/initiate/
    Frontend sends: booking_id, payment_method, payment_type.
    Amount is ALWAYS computed server-side — never accepted from the frontend.
    """
    booking_id     = serializers.IntegerField()
    payment_method = serializers.ChoiceField(choices=PaymentMethod.choices)
    payment_type   = serializers.ChoiceField(
        choices=PaymentType.choices,
        default=PaymentType.FULL_PAYMENT,
    )

    def validate(self, data):
        request = self.context.get("request")
        user    = request.user if request and request.user.is_authenticated else None

        try:
            booking = Booking.objects.select_related("room", "user").get(pk=data["booking_id"])
        except Booking.DoesNotExist:
            raise serializers.ValidationError({"booking_id": "Booking not found."})

        _assert_booking_payable(booking, user)

        payment_type = data["payment_type"]

        # Double-payment guard
        if payment_type == PaymentType.FULL_PAYMENT:
            if _existing_paid(booking) or _existing_paid_deposit(booking):
                raise serializers.ValidationError(
                    {"booking_id": "This booking already has an active payment."}
                )

        elif payment_type == PaymentType.DEPOSIT:
            if _existing_paid(booking) or _existing_paid_deposit(booking):
                raise serializers.ValidationError(
                    {"booking_id": "Deposit has already been paid for this booking."}
                )

        elif payment_type == PaymentType.BALANCE_PAYMENT:
            if not _existing_paid_deposit(booking):
                raise serializers.ValidationError(
                    {"booking_id": "No paid deposit found. Pay deposit first."}
                )
            if _existing_paid_balance(booking):
                raise serializers.ValidationError(
                    {"booking_id": "Balance has already been paid."}
                )

        # Determine provider from method
        method = data["payment_method"]
        if method == PaymentMethod.PAYPAL:
            provider = PaymentProvider.PAYPAL
        elif method == PaymentMethod.CASH:
            provider = PaymentProvider.MANUAL
        else:
            provider = PaymentProvider.PAYMONGO

        # Compute amount server-side
        total = booking.total_price
        if payment_type == PaymentType.DEPOSIT:
            amount = (total * DEPOSIT_PERCENTAGE).quantize(Decimal("0.01"))
        elif payment_type == PaymentType.BALANCE_PAYMENT:
            paid_deposit = booking.payments.filter(
                status=PaymentStatus.PAID, payment_type=PaymentType.DEPOSIT
            ).first()
            amount = total - (paid_deposit.amount if paid_deposit else Decimal("0"))
        else:
            amount = total

        data["booking"]   = booking
        data["provider"]  = provider
        data["amount"]    = amount
        data["user"]      = user
        return data


# ─── Webhook ──────────────────────────────────────────────────────────────────

class PayMongoWebhookSerializer(serializers.Serializer):
    """Validates the incoming PayMongo webhook envelope shape."""
    data = serializers.DictField()

    def validate_data(self, value):
        attrs = value.get("attributes", {})
        if not attrs.get("type"):
            raise serializers.ValidationError("Missing event type.")
        return value


class PayPalWebhookSerializer(serializers.Serializer):
    """Validates the incoming PayPal IPN / webhook shape."""
    event_type = serializers.CharField()
    resource   = serializers.DictField()


# ─── Refund initiation ────────────────────────────────────────────────────────

class InitiateRefundSerializer(serializers.Serializer):
    """
    POST /api/payments/<id>/refund/
    Staff/Admin initiates a refund for a paid payment.
    Amount defaults to full payment amount if not specified.
    """
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        payment = self.context["payment"]
        if payment.status != PaymentStatus.PAID:
            raise serializers.ValidationError(
                f"Cannot refund a payment with status '{payment.status}'."
            )
        amount = data.get("amount", payment.amount)
        if amount > payment.amount:
            raise serializers.ValidationError(
                {"amount": f"Refund amount ({amount}) cannot exceed payment amount ({payment.amount})."}
            )
        data["amount"] = amount
        return data