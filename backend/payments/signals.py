"""
payments/signals.py

Two responsibilities:
  1. Audit log — log every Payment save.
  2. Confirmation email — send the booking confirmation email with
     reference number, QR code, check-in PIN, stay details,
     payment summary, hotel info, and cancellation policy
     after a Booking transitions to CONFIRMED.

Flow:
  Webhook / manual confirm
    → Payment.mark_paid()
        → booking.confirm_after_payment()
            → Booking post_save fires
                → send_confirmation_email_on_confirmed()
                    → _send_confirmation_email(booking)
"""

import io
import base64
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import EmailMultiAlternatives
from django.conf import settings

from .models import Payment, PaymentStatus

logger = logging.getLogger(__name__)


# ─── 1. Audit log ─────────────────────────────────────────────────────────────

@receiver(post_save, sender=Payment)
def log_payment_status_change(sender, instance, created, **kwargs):
    action = "created" if created else "updated"
    logger.info(
        "Payment %s %s — status=%s amount=%s %s booking=%s",
        instance.pk, action,
        instance.status, instance.amount, instance.currency,
        instance.booking_id,
    )


# ─── 2. Confirmation email ────────────────────────────────────────────────────

@receiver(post_save, sender="bookings.Booking")
def send_confirmation_email_on_confirmed(sender, instance, created, **kwargs):
    """
    Fires on every Booking post_save.
    Sends confirmation email only when:
      - Not a brand-new booking (must be an update)
      - booking.status == CONFIRMED
      - booking.has_credentials (reference_number + checkin_pin are set)
    """
    if created:
        return

    from bookings.models import BookingStatus

    if instance.status != BookingStatus.CONFIRMED:
        return

    # Re-fetch to guarantee reference_number and checkin_pin are populated
    # (confirm_after_payment uses save(update_fields=[...]) partial save)
    try:
        from bookings.models import Booking
        booking = Booking.objects.select_related("room").get(pk=instance.pk)
    except Exception:
        return

    if not booking.has_credentials:
        logger.warning(
            "Booking pk=%s is CONFIRMED but has no credentials — email skipped.",
            booking.pk,
        )
        return

    try:
        _send_confirmation_email(booking)
    except Exception as exc:
        logger.error(
            "Confirmation email FAILED for booking %s (pk=%s): %s",
            booking.reference_number, booking.pk, exc,
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_qr_base64(data: str) -> str:
    """Generate a QR code PNG from data. Returns base64 string or ''."""
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=8,
            border=3,
        )
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#0f172a", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return base64.b64encode(buf.read()).decode("utf-8")
    except ImportError:
        logger.warning("qrcode[pil] not installed — QR omitted. Run: pip install qrcode[pil]")
        return ""
    except Exception as exc:
        logger.warning("QR generation failed: %s", exc)
        return ""


def _fmt_time(t) -> str:
    """Format a time object as '2:00 PM' or return 'Standard time' if None."""
    if not t:
        return "Standard time"
    try:
        from datetime import datetime
        return datetime.combine(datetime.today(), t).strftime("%I:%M %p").lstrip("0")
    except Exception:
        return str(t)


def _fmt_php(amount) -> str:
    """Format as PHP currency string."""
    try:
        return f"PHP {float(amount):,.2f}"
    except Exception:
        return f"PHP {amount}"


def _tr(label: str, value: str, shade: bool = False, bold: bool = False) -> str:
    """Render a two-column <tr> for the details table."""
    bg  = "background:#f9fafb;" if shade else ""
    wgt = "font-weight:700;color:#111827;" if bold else "color:#374151;"
    return (
        f'<tr style="{bg}border-bottom:1px solid #f3f4f6;">'
        f'<td style="color:#9ca3af;font-size:13px;padding:9px 12px;">{label}</td>'
        f'<td style="{wgt}font-size:14px;padding:9px 12px;text-align:right;">{value}</td>'
        f'</tr>'
    )


def _get_payment_summary(booking):
    """
    Returns (amount_paid, amount_due, payment_method_label) for the booking.
    Reads from the actual Payment records to get accurate figures.
    """
    from decimal import Decimal
    from payments.models import PaymentStatus as PStatus

    try:
        paid_payments = booking.payments.filter(status=PStatus.PAID).order_by("-paid_at")
        amount_paid = sum(p.amount for p in paid_payments) or Decimal("0")
        amount_due  = max(booking.total_price - amount_paid, Decimal("0"))

        # Get the most recent paid payment method
        latest = paid_payments.first()
        method_label = ""
        if latest:
            method_map = {
                "cash":          "Cash",
                "gcash":         "GCash",
                "card":          "Credit / Debit Card",
                "bank_transfer": "Bank Transfer",
                "paypal":        "PayPal",
            }
            method_label = method_map.get(latest.payment_method, latest.payment_method.replace("_", " ").title())

        return amount_paid, amount_due, method_label
    except Exception:
        return booking.total_price, 0, ""


def _send_confirmation_email(booking) -> None:
    """
    Builds and sends the HTML + plain-text confirmation email.

    Required settings.py:
        EMAIL_BACKEND, EMAIL_HOST, EMAIL_PORT, EMAIL_USE_TLS
        EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, DEFAULT_FROM_EMAIL

    Optional settings.py (all have safe defaults):
        SITE_NAME           — "CMH Hotel"
        SUPPORT_EMAIL       — "support@cmhhotel.com"
        HOTEL_ADDRESS       — "123 Street, Cebu City, Philippines"
        HOTEL_PHONE         — "+63 32 123 4567"
        CANCELLATION_POLICY — default policy text
        FRONTEND_URL        — "http://localhost:5173"
    """
    site_name    = getattr(settings, "SITE_NAME",       "CMH Hotel")
    support_email = getattr(settings, "SUPPORT_EMAIL",  "support@cmhhotel.com")
    hotel_address = getattr(settings, "HOTEL_ADDRESS",  "Cebu City, Philippines")
    hotel_phone  = getattr(settings, "HOTEL_PHONE",     "+63 32 123 4567")
    frontend_url = getattr(settings, "FRONTEND_URL",    "http://localhost:5173")
    from_email   = getattr(settings, "DEFAULT_FROM_EMAIL", f"{site_name} <no-reply@cmhhotel.com>")
    cancel_policy = getattr(
        settings, "CANCELLATION_POLICY",
        "Free cancellation 48+ hours before check-in (90% refund). "
        "50% refund for cancellations within 48 hours. "
        "No refund for same-day cancellations."
    )

    booking_url  = f"{frontend_url}/bookings/my/{booking.pk}"

    # ── Room times ─────────────────────────────────────────────────────────
    checkin_time  = _fmt_time(getattr(booking.room, "checkin_time",  None))
    checkout_time = _fmt_time(getattr(booking.room, "checkout_time", None))

    # ── Payment summary ────────────────────────────────────────────────────
    amount_paid, amount_due, payment_method = _get_payment_summary(booking)
    is_deposit = amount_due > 0

    # ── QR Code ────────────────────────────────────────────────────────────
    qr_base64 = _build_qr_base64(booking.reference_number)
    qr_tag = (
        '<img src="cid:qr_code" alt="Check-in QR Code" width="180" height="180" '
        'style="display:block;border-radius:4px;" />'
        if qr_base64 else
        '<p style="color:#9ca3af;font-size:13px;">QR unavailable</p>'
    )

    # ── PIN boxes ──────────────────────────────────────────────────────────
    pin_boxes = "".join(
        f'<span style="display:inline-block;width:46px;height:54px;line-height:54px;'
        f'text-align:center;font-size:28px;font-weight:800;border:2px solid #e0e7ff;'
        f'border-radius:8px;margin:0 4px;background:#f8faff;color:#4f46e5;">'
        f'{d}</span>'
        for d in booking.checkin_pin
    )

    # ── Deposit notice HTML ────────────────────────────────────────────────
    deposit_notice = ""
    if is_deposit:
        deposit_notice = f"""
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;">
          <tr>
            <td style="padding:14px 18px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400e;">
                ⚠ Outstanding Balance
              </p>
              <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">
                You have a remaining balance of <strong>{_fmt_php(amount_due)}</strong>
                to be settled at check-in.
                Amount paid so far: {_fmt_php(amount_paid)}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""

    # ── Plain-text fallback ────────────────────────────────────────────────
    text_body = f"""
{site_name} — Booking Confirmed
{'─' * 48}

Hi {booking.full_name},

Your booking is confirmed and payment received.

BOOKING CREDENTIALS
  Reference Number : {booking.reference_number}
  Check-in PIN     : {booking.checkin_pin}

STAY DETAILS
  Room             : #{booking.room.room_number} ({booking.room.get_room_type_display()})
  Check-in         : {booking.check_in} from {checkin_time}
  Check-out        : {booking.check_out} by {checkout_time}
  Nights           : {booking.nights}
  Guests           : {booking.guests_count}

PAYMENT
  Amount Paid      : {_fmt_php(amount_paid)}{f' via {payment_method}' if payment_method else ''}
  {'Remaining Balance: ' + _fmt_php(amount_due) if is_deposit else 'Status          : Fully Paid'}
  Total            : {_fmt_php(booking.total_price)}

HOTEL INFORMATION
  Address          : {hotel_address}
  Phone            : {hotel_phone}
  Email            : {support_email}

CANCELLATION POLICY
  {cancel_policy}

Present your Reference Number and PIN at reception with a valid ID.
View your booking: {booking_url}

— The {site_name} Team
    """.strip()

    # ── HTML body ──────────────────────────────────────────────────────────
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Booking Confirmed — {site_name}</title>
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
      <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
                 padding:36px 40px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;
                   letter-spacing:-0.5px;">{site_name}</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">
          Booking Confirmation
        </p>
      </td>
    </tr>

    <!-- Success hero -->
    <tr>
      <td style="text-align:center;padding:36px 40px 24px;">
        <div style="display:inline-block;width:60px;height:60px;background:#ecfdf5;
                    border-radius:50%;line-height:60px;font-size:28px;margin-bottom:16px;">
          ✓
        </div>
        <h2 style="margin:0;color:#111827;font-size:22px;font-weight:700;">
          Payment Confirmed!
        </h2>
        <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">
          Hi <strong>{booking.full_name}</strong>, your reservation is locked in.
        </p>
      </td>
    </tr>

    <!-- Reference + QR card -->
    <tr>
      <td style="padding:0 32px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f8faff;border:2px solid #e0e7ff;border-radius:14px;">
          <tr>
            <!-- Left: reference + PIN -->
            <td style="padding:28px 24px;vertical-align:top;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;
                         text-transform:uppercase;letter-spacing:0.08em;">
                Reference Number
              </p>
              <p style="margin:0 0 22px;font-size:22px;font-weight:800;color:#4f46e5;
                         font-family:'Courier New',monospace;letter-spacing:0.05em;">
                {booking.reference_number}
              </p>
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;
                         text-transform:uppercase;letter-spacing:0.08em;">
                Check-in PIN
              </p>
              <div style="margin-bottom:10px;">{pin_boxes}</div>
              <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
                Show this PIN at reception<br/>along with a valid ID
              </p>
            </td>
            <!-- Right: QR code -->
            <td style="padding:28px 24px;vertical-align:top;
                       text-align:center;width:210px;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;
                         text-transform:uppercase;letter-spacing:0.08em;">
                Scan to Check In
              </p>
              <div style="display:inline-block;padding:10px;background:#ffffff;
                           border:1px solid #e5e7eb;border-radius:10px;">
                {qr_tag}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Stay details -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Stay Details
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {_tr("Room",         f"#{booking.room.room_number} — {booking.room.get_room_type_display()}")}
          {_tr("Check-in",     f"{booking.check_in} &nbsp;·&nbsp; from {checkin_time}",   shade=True)}
          {_tr("Check-out",    f"{booking.check_out} &nbsp;·&nbsp; by {checkout_time}")}
          {_tr("Duration",     f"{booking.nights} night{'s' if booking.nights != 1 else ''}",  shade=True)}
          {_tr("Guests",       str(booking.guests_count))}
        </table>
      </td>
    </tr>

    <!-- Payment summary -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Payment Summary
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {_tr("Subtotal",      _fmt_php(booking.subtotal))}
          {_tr("Tax (12%)",     _fmt_php(booking.tax),         shade=True)}
          {_tr("Service Fee",   _fmt_php(booking.service_fee))}
          {_tr("Total",         _fmt_php(booking.total_price), shade=True, bold=True)}
          {_tr("Amount Paid",   f"{_fmt_php(amount_paid)}{f' via {payment_method}' if payment_method else ''}", bold=True)}
          {_tr("Balance Due",   _fmt_php(amount_due) if is_deposit else "None — Fully Paid", shade=True, bold=is_deposit)}
        </table>
      </td>
    </tr>

    <!-- Deposit warning (if applicable) -->
    {deposit_notice}

    <!-- Hotel info -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Hotel Information
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {_tr("Address", hotel_address)}
          {_tr("Phone",   hotel_phone,   shade=True)}
          {_tr("Email",   support_email)}
        </table>
      </td>
    </tr>

    <!-- Cancellation policy -->
    <tr>
      <td style="padding:0 32px 28px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Cancellation Policy
        </p>
        <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:10px;
                    padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.7;">
            {cancel_policy}
          </p>
        </div>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="text-align:center;padding:0 32px 36px;">
        <a href="{booking_url}"
           style="display:inline-block;background:#4f46e5;color:#ffffff;
                  text-decoration:none;font-size:15px;font-weight:700;
                  padding:14px 40px;border-radius:10px;">
          View My Booking
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

    # ── Assemble and send ──────────────────────────────────────────────────
    subject = f"[{site_name}] Booking Confirmed — {booking.reference_number}"

    msg = EmailMultiAlternatives(
        subject    = subject,
        body       = text_body,
        from_email = from_email,
        to         = [booking.email],
    )
    msg.attach_alternative(html_body, "text/html")

    # Inline QR image — referenced in HTML as cid:qr_code
    if qr_base64:
        from email.mime.image import MIMEImage
        qr_bytes = base64.b64decode(qr_base64)
        qr_img   = MIMEImage(qr_bytes, _subtype="png")
        qr_img.add_header("Content-ID", "<qr_code>")
        qr_img.add_header("Content-Disposition", "inline", filename="booking_qr.png")
        msg.attach(qr_img)

    msg.send(fail_silently=False)

    logger.info(
        "Confirmation email sent → %s | ref=%s",
        booking.email, booking.reference_number,
    )



# Usage:
#   from payments.signals import send_payment_link_email
#   send_payment_link_email(payment, booking, checkout_url)
# ─────────────────────────────────────────────────────────────────────────────

def send_payment_link_email(payment, booking, checkout_url: str) -> None:
    """
    Sends an email to the guest with the checkout link immediately after
    a PayMongo or PayPal payment session is created.

    This is separate from the booking confirmation email (_send_confirmation_email)
    which fires after payment is completed via webhook.

    Called from: payments/views.py → InitiatePaymentView.post()
    """
    site_name     = getattr(settings, "SITE_NAME",         "CMH Hotel")
    support_email = getattr(settings, "SUPPORT_EMAIL",     "support@cmhhotel.com")
    hotel_phone   = getattr(settings, "HOTEL_PHONE",       "+63 32 123 4567")
    from_email    = getattr(settings, "DEFAULT_FROM_EMAIL", f"{site_name} <no-reply@cmhhotel.com>")

    provider_label = {
        "paymongo": "PayMongo",
        "paypal":   "PayPal",
    }.get(payment.provider, payment.provider.title())

    amount_label = _fmt_php(payment.amount)
    payment_type_label = {
        "full_payment":    "Full Payment",
        "deposit":         "Deposit (30%)",
        "balance_payment": "Balance Payment",
    }.get(payment.payment_type, payment.payment_type.replace("_", " ").title())

    checkin_time  = _fmt_time(getattr(booking.room, "checkin_time",  None))
    checkout_time = _fmt_time(getattr(booking.room, "checkout_time", None))

    # ── Plain text ─────────────────────────────────────────────────────────
    text_body = f"""
{site_name} — Complete Your Payment

Hi {booking.full_name},

Your booking reservation has been created. Please complete your payment to confirm it.

PAYMENT DETAILS
  Amount       : {amount_label} ({payment_type_label})
  Provider     : {provider_label}
  Pay by       : Click the link below

PAYMENT LINK
  {checkout_url}

BOOKING SUMMARY
  Room         : #{booking.room.room_number} ({booking.room.get_room_type_display()})
  Check-in     : {booking.check_in} from {checkin_time}
  Check-out    : {booking.check_out} by {checkout_time}
  Nights       : {booking.nights}
  Guests       : {booking.guests_count}
  Total Price  : {_fmt_php(booking.total_price)}

Once payment is completed, you will receive a separate confirmation email
with your Reference Number, Check-in PIN, and QR Code.

Questions? Contact {support_email} or call {hotel_phone}

— The {site_name} Team
    """.strip()

    # ── HTML body ──────────────────────────────────────────────────────────
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Complete Your Payment — {site_name}</title>
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
      <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
                 padding:36px 40px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;
                   letter-spacing:-0.5px;">{site_name}</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">
          Payment Required
        </p>
      </td>
    </tr>

    <!-- Hero -->
    <tr>
      <td style="text-align:center;padding:36px 40px 24px;">
        <div style="display:inline-block;width:60px;height:60px;background:#eff6ff;
                    border-radius:50%;line-height:60px;font-size:28px;margin-bottom:16px;">
          🔗
        </div>
        <h2 style="margin:0;color:#111827;font-size:22px;font-weight:700;">
          Complete Your Payment
        </h2>
        <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">
          Hi <strong>{booking.full_name}</strong>, your reservation is waiting.
          Complete payment to confirm your booking.
        </p>
      </td>
    </tr>

    <!-- Payment amount card -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f8faff;border:2px solid #e0e7ff;border-radius:14px;">
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6b7280;
                         text-transform:uppercase;letter-spacing:0.08em;">
                Amount Due ({payment_type_label})
              </p>
              <p style="margin:0 0 20px;font-size:36px;font-weight:800;color:#4f46e5;">
                {amount_label}
              </p>
              <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">
                Pay securely via <strong>{provider_label}</strong>
              </p>
              <a href="{checkout_url}"
                 style="display:inline-block;background:#4f46e5;color:#ffffff;
                        text-decoration:none;font-size:16px;font-weight:700;
                        padding:16px 48px;border-radius:10px;letter-spacing:0.02em;">
                Pay Now →
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Booking summary -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Booking Summary
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {_tr("Room",      f"#{booking.room.room_number} — {booking.room.get_room_type_display()}")}
          {_tr("Check-in",  f"{booking.check_in} &nbsp;·&nbsp; from {checkin_time}",  shade=True)}
          {_tr("Check-out", f"{booking.check_out} &nbsp;·&nbsp; by {checkout_time}")}
          {_tr("Duration",  f"{booking.nights} night{'s' if booking.nights != 1 else ''}",  shade=True)}
          {_tr("Guests",    str(booking.guests_count))}
          {_tr("Total Price", _fmt_php(booking.total_price), shade=True, bold=True)}
        </table>
      </td>
    </tr>

    <!-- Notice -->
    <tr>
      <td style="padding:0 32px 28px;">
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;
                    padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">
            ⚠ <strong>Important:</strong> After payment is completed, you will receive
            a separate confirmation email with your <strong>Reference Number</strong>,
            <strong>Check-in PIN</strong>, and <strong>QR Code</strong>.
          </p>
        </div>
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

    subject = f"[{site_name}] Complete Your Payment — {provider_label}"

    msg = EmailMultiAlternatives(
        subject    = subject,
        body       = text_body,
        from_email = from_email,
        to         = [booking.email],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send(fail_silently=False)

    logger.info(
        "Payment link email sent → %s | provider=%s amount=%s",
        booking.email, payment.provider, payment.amount,
    )