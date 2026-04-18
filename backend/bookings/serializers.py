from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from rooms.models import Room, RoomStatus  # noqa


from .models import (
    Booking, BookingStatus, BookingStatusHistory,
    PaymentStatus, RefundStatus, BLOCKING_STATUSES,
    BookingPaymentType,
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

    # Payment breakdown — consumed by PaymentPage.jsx and MyBookingsPage.jsx modal
    amount_paid       = serializers.SerializerMethodField()
    amount_due        = serializers.SerializerMethodField()
    payment_type_used = serializers.SerializerMethodField()

    # Discount info — confirmation page "You saved ₱X" row
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
        return str(obj.room.price_per_night)

    def get_discount_percentage(self, obj):
        return str(obj.room.discount_percentage or Decimal("0"))

    def get_discount_amount(self, obj):
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
            # ── NEW fields ──
            "special_requests",
            "payment_type",
            "payment_expires_at",
            # ───────────────
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
            "original_price_per_night", "discount_percentage", "discount_amount",
            "created_at", "updated_at",
            "status_history",
        ]


class BookingCreateSerializer(serializers.Serializer):
    room_id          = serializers.IntegerField()
    check_in         = serializers.DateField()
    check_out        = serializers.DateField()
    guests_count     = serializers.IntegerField(min_value=1)
    full_name        = serializers.CharField(max_length=255, required=False)
    email            = serializers.EmailField(required=False)
    phone            = serializers.CharField(max_length=30, required=False)
    # ── NEW: optional guest fields ───────────────────────────────────────
    special_requests = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    payment_type     = serializers.ChoiceField(
        choices=BookingPaymentType.choices,
        default=BookingPaymentType.FULL,
        required=False,
    )

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

        # ── Compute payment_expires_at at creation time ───────────────────
        from django.utils import timezone as tz
        from datetime import timedelta
        payment_expires_at = tz.now() + timedelta(minutes=Booking.PAYMENT_WINDOW_MINUTES)

        booking = Booking.objects.create(
            user                = user,
            room                = room,
            full_name           = validated_data["full_name"],
            email               = validated_data["email"],
            phone               = validated_data["phone"],
            special_requests    = validated_data.get("special_requests") or None,
            payment_type        = validated_data.get("payment_type", BookingPaymentType.FULL),
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
            payment_expires_at  = payment_expires_at,
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

    # Global check-in time: 12:00 PM (noon)
    CHECKIN_HOUR = 12

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

        now_local = timezone.localtime(timezone.now())
        today = now_local.date()
        if booking.check_in != today:
            raise serializers.ValidationError(
                {"check_in": f"Check-in date is {booking.check_in}, not today ({today})."}
            )

        # Validate check-in time: only allow after 12:00 PM (local time)
        if now_local.hour < self.CHECKIN_HOUR:
            raise serializers.ValidationError(
                {"time": f"Check-in is only available from {self.CHECKIN_HOUR}:00 (noon). Please try again later."}
            )

        # Validate check-out date: guest cannot check in after checkout date
        if now_local.date() > booking.check_out:
            raise serializers.ValidationError(
                {"check_out": f"Check-in window has closed. Your scheduled checkout was {booking.check_out}. Booking marked as No Show."}
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
        booking = self.context["booking"]
        request = self.context.get("request")
        user = request.user if request else None
        old_status = booking.status
        reason = self.validated_data.get("reason", "")

        # ── Compute refund eligibility ────────────────────────────────────────
        pct, amount = booking.compute_refund()

        # ── Transition booking to CANCELLED ───────────────────────────────────
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = timezone.now()
        booking.cancellation_reason = reason
        booking.refund_percentage = pct
        booking.refund_amount = amount
        booking.refund_status = RefundStatus.PENDING if amount > 0 else RefundStatus.NONE

        if amount > 0:
            booking.payment_status = PaymentStatus.PARTIALLY_REFUNDED

        booking.save(update_fields=[
            "status", "cancelled_at", "cancellation_reason",
            "refund_percentage", "refund_amount", "refund_status",
            "payment_status", "updated_at",
        ])

        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=old_status,
            new_status=BookingStatus.CANCELLED,
            changed_by=user,
            note=reason or "Cancelled.",
        )

        # ── Refund flow — only when money was actually received ───────────────
        if amount > 0:
            try:
                from payments.models import (
                    Payment, PaymentStatus as PStatus,
                    Refund, PaymentProvider,
                )
                from payments.services import PayMongoService, PayPalService

                paid_payment = (
                    booking.payments
                    .filter(status=PStatus.PAID)
                    .order_by("-paid_at")
                    .first()
                )

                if paid_payment:
                    refund = Refund.objects.create(
                        payment=paid_payment,
                        amount=amount,
                        reason=reason or "Booking cancelled.",
                        initiated_by=user,
                        status=Refund.RefundStatus.PENDING,
                    )

                    provider_succeeded = False
                    try:
                        if paid_payment.provider == PaymentProvider.PAYMONGO:
                            result = PayMongoService.create_refund(
                                paid_payment, amount,
                                reason=reason or "Booking cancelled.",
                            )
                            refund.provider_refund_id = result.get("refund_id")
                            refund.status = Refund.RefundStatus.COMPLETED
                            refund.save(update_fields=[
                                "provider_refund_id", "status", "updated_at"
                            ])
                            provider_succeeded = True

                        elif paid_payment.provider == PaymentProvider.PAYPAL:
                            result = PayPalService.create_refund(
                                paid_payment, amount,
                                reason=reason or "Booking cancelled.",
                            )
                            refund.provider_refund_id = result.get("refund_id")
                            refund.status = Refund.RefundStatus.COMPLETED
                            refund.save(update_fields=[
                                "provider_refund_id", "status", "updated_at"
                            ])
                            provider_succeeded = True

                        elif paid_payment.provider == PaymentProvider.MANUAL:
                            # Cash — staff handles physical handover; mark completed
                            refund.status = Refund.RefundStatus.COMPLETED
                            refund.save(update_fields=["status", "updated_at"])
                            provider_succeeded = True

                    except Exception as exc:
                        import logging
                        logging.getLogger(__name__).warning(
                            "Provider refund failed for booking %s (payment %s): %s — "
                            "Refund #%s stays PENDING for manual staff action.",
                            booking.reference_number or booking.pk,
                            paid_payment.pk, exc, refund.pk,
                        )

                    if provider_succeeded:
                        paid_payment.status = PStatus.REFUNDED
                        paid_payment.save(update_fields=["status", "updated_at"])
                        booking.refund_status = RefundStatus.COMPLETED
                        booking.save(update_fields=["refund_status", "updated_at"])

            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(
                    "Refund flow error for booking %s: %s",
                    booking.reference_number or booking.pk, exc,
                )

        # ── Send cancellation email to guest (non-blocking) ───────────────────
        # Runs outside the @transaction.atomic scope intentionally — email
        # failure should never roll back the cancellation itself.
        try:
            _send_cancellation_email(booking)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "Cancellation email failed for booking %s: %s",
                booking.reference_number or booking.pk, exc,
            )

        return booking


# ─── Cancellation email ───────────────────────────────────────────────────────

def _send_cancellation_email(booking):
    """
    Sends a booking cancellation confirmation email to the guest.

    Three cases handled:
      - No payment made (unpaid) → free cancellation notice
      - Refund issued            → amount + 3-7 day timeline
      - No refund                → policy reason shown

    Visual style mirrors _send_modification_email in modification_signals.py.
    """
    from django.core.mail import EmailMultiAlternatives
    from django.conf import settings as django_settings
    import logging

    logger = logging.getLogger(__name__)

    site_name = getattr(django_settings, "SITE_NAME", "CMH Hotel")
    support_email = getattr(django_settings, "SUPPORT_EMAIL", "support@cmhhotel.com")
    hotel_phone = getattr(django_settings, "HOTEL_PHONE", "+63 32 123 4567")
    frontend_url = getattr(django_settings, "FRONTEND_URL", "http://localhost:5173")
    from_email = getattr(django_settings, "DEFAULT_FROM_EMAIL", f"{site_name} <no-reply@cmhhotel.com>")

    ref = booking.reference_number or f"#{booking.pk}"
    bookings_url = f"{frontend_url}/bookings/my"
    refund_amt = booking.refund_amount or 0
    has_refund = refund_amt > 0
    no_payment = booking.payment_status == "unpaid"

    subject = f"[{site_name}] Booking Cancelled — {ref}"

    # ── Refund / no-charge notice (HTML) ─────────────────────────────────────
    if has_refund:
        notice_html = f"""
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1e40af;">
                ↩ Refund Initiated
              </p>
              <p style="margin:0;font-size:13px;color:#1d4ed8;line-height:1.6;">
                A refund of <strong>{_fmt_php(refund_amt)}</strong>
                ({int(booking.refund_percentage)}%) has been initiated and will
                appear within 3–7 business days depending on your bank or payment provider.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""
        refund_text = (
            f"Refund: {_fmt_php(refund_amt)} "
            f"({int(booking.refund_percentage)}%) — allow 3-7 business days."
        )

    elif no_payment:
        notice_html = f"""
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#166534;">
                ✓ No Charge
              </p>
              <p style="margin:0;font-size:13px;color:#15803d;line-height:1.6;">
                No payment was made for this booking — this cancellation is free of charge.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""
        refund_text = "No charge — free cancellation."

    else:
        notice_html = f"""
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400e;">
                No Refund Applicable
              </p>
              <p style="margin:0;font-size:13px;color:#b45309;line-height:1.6;">
                Based on our cancellation policy, this booking is not eligible
                for a refund. If you believe this is an error, please contact us.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""
        refund_text = "No refund applicable per cancellation policy."

    # ── Optional reason row ───────────────────────────────────────────────────
    reason_row = (
        _tr("Reason", booking.cancellation_reason)
        if booking.cancellation_reason else ""
    )

    # ── Plain text ────────────────────────────────────────────────────────────
    text_body = f"""
{site_name} — Booking Cancelled
{'─' * 48}

Hi {booking.full_name},

Your booking has been cancelled. Here are the details:

BOOKING DETAILS
  Reference : {ref}
  Room      : #{booking.room.room_number} — {booking.room.get_room_type_display()}
  Check-in  : {booking.check_in}
  Check-out : {booking.check_out}
  Nights    : {booking.nights}
  Guests    : {booking.guests_count}
  Total     : {_fmt_php(booking.total_price)}
  {'Reason    : ' + booking.cancellation_reason if booking.cancellation_reason else ''}

REFUND
  {refund_text}

Questions?
  Email : {support_email}
  Phone : {hotel_phone}

View your bookings: {bookings_url}

— The {site_name} Team
    """.strip()

    # ── HTML ──────────────────────────────────────────────────────────────────
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Booking Cancelled — {site_name}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;
             font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"
       style="background:#f3f4f6;padding:40px 16px;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0"
         style="background:#ffffff;border-radius:16px;overflow:hidden;
                box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;">

    <!-- Header -->
    <tr>
      <td style="background:linear-gradient(135deg,#1f2937 0%,#374151 100%);
                 padding:36px 40px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;
                   letter-spacing:-0.5px;">{site_name}</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.65);font-size:14px;">
          Booking Cancellation
        </p>
      </td>
    </tr>

    <!-- Hero -->
    <tr>
      <td style="text-align:center;padding:36px 40px 24px;">
        <div style="display:inline-block;width:60px;height:60px;background:#fef2f2;
                    border-radius:50%;line-height:60px;font-size:26px;
                    margin-bottom:16px;">✕</div>
        <h2 style="margin:0;color:#111827;font-size:22px;font-weight:700;">
          Booking Cancelled
        </h2>
        <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">
          Hi <strong>{booking.full_name}</strong>, your booking has been
          successfully cancelled.
        </p>
      </td>
    </tr>

    <!-- Booking summary -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Cancelled Booking
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {_tr("Reference", ref)}
          {_tr("Room", f"#{booking.room.room_number} — {booking.room.get_room_type_display()}", shade=True)}
          {_tr("Check-in", str(booking.check_in))}
          {_tr("Check-out", str(booking.check_out), shade=True)}
          {_tr("Duration", f"{booking.nights} night{'s' if booking.nights != 1 else ''}")}
          {_tr("Guests", str(booking.guests_count), shade=True)}
          {_tr("Total", _fmt_php(booking.total_price))}
          {reason_row}
        </table>
      </td>
    </tr>

    <!-- Refund / no-charge notice -->
    {notice_html}

    <!-- CTA -->
    <tr>
      <td style="text-align:center;padding:0 32px 36px;">
        <a href="{bookings_url}"
           style="display:inline-block;background:#1f2937;color:#ffffff;
                  text-decoration:none;font-size:15px;font-weight:700;
                  padding:14px 40px;border-radius:10px;">
          View My Bookings
        </a>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f9fafb;border-top:1px solid #f3f4f6;
                 padding:22px 32px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#9ca3af;">
          Questions? Email
          <a href="mailto:{support_email}"
             style="color:#4f46e5;text-decoration:none;">{support_email}</a>
          or call {hotel_phone}
        </p>
        <p style="margin:6px 0 0;font-size:12px;color:#d1d5db;">
          &copy; {site_name}. All rights reserved.
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>"""

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=from_email,
        to=[booking.email],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send(fail_silently=False)

    logger.info(
        "Cancellation email sent → %s | ref=%s",
        booking.email, ref,
    )


# ─── Shared email helpers ─────────────────────────────────────────────────────

def _fmt_php(amount) -> str:
    try:
        return f"PHP {float(amount):,.2f}"
    except Exception:
        return f"PHP {amount}"


def _tr(label: str, value: str, shade: bool = False, bold: bool = False) -> str:
    bg = "background:#f9fafb;" if shade else ""
    wgt = "font-weight:700;color:#111827;" if bold else "color:#374151;"
    return (
        f'<tr style="{bg}border-bottom:1px solid #f3f4f6;">'
        f'<td style="color:#9ca3af;font-size:13px;padding:9px 12px;">{label}</td>'
        f'<td style="{wgt}font-size:14px;padding:9px 12px;text-align:right;">{value}</td>'
        f'</tr>'
    )