"""
payments/signals.py

Two responsibilities:
  1. Audit log — log every Payment save (unchanged from original).
  2. Confirmation email — send the booking confirmation email with
     reference number, QR code, and check-in PIN after a Booking
     transitions to CONFIRMED.

Why the email signal lives HERE (payments) not in bookings:
  - The trigger is payment success → mark_paid() → confirm_after_payment()
  - payments/apps.py.ready() imports this file, wiring up the Booking
    post_save receiver below.
  - bookings/apps.py already imports bookings.signals for the room-lock
    release signal — no changes needed there.

Flow recap:
  Webhook arrives
    → Payment.mark_paid()
        → booking.confirm_after_payment()   ← writes ref + PIN, saves Booking
            → Booking post_save fires
                → send_confirmation_email_on_confirmed()  ← THIS FILE
                    → _send_confirmation_email(booking)
                        → EmailMultiAlternatives with inline QR sent to guest
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


# ─── 1. Audit log (original, unchanged) ──────────────────────────────────────

@receiver(post_save, sender=Payment)
def log_payment_status_change(sender, instance, created, **kwargs):
    """Log every payment save for audit purposes."""
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
    Listens to Booking post_save.
    Sends confirmation email only when ALL of these are true:
      - Not a brand-new booking (must be an update)
      - booking.status == CONFIRMED
      - booking.has_credentials (reference_number + checkin_pin are set)

    Re-fetches from DB before sending to avoid stale field values
    from confirm_after_payment()'s update_fields= partial save.
    """
    if created:
        return

    # Lazy import to avoid circular import at module load time
    from bookings.models import BookingStatus

    if instance.status != BookingStatus.CONFIRMED:
        return

    # Re-fetch: confirm_after_payment() uses save(update_fields=[...])
    # which means Django only updates listed columns on the in-memory object.
    # Re-fetching guarantees reference_number and checkin_pin are present.
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
        # Never let email failure roll back the booking confirmation
        logger.error(
            "Confirmation email FAILED for booking %s (pk=%s): %s",
            booking.reference_number, booking.pk, exc,
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_qr_base64(data: str) -> str:
    """
    Generate a QR code PNG encoding `data`.
    Returns base64 string, or empty string if qrcode package is missing.
    Install with: pip install qrcode[pil]
    """
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
        img    = qr.make_image(fill_color="#0f172a", back_color="white")
        buf    = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return base64.b64encode(buf.read()).decode("utf-8")
    except ImportError:
        logger.warning("qrcode[pil] not installed — QR omitted from email. Run: pip install qrcode[pil]")
        return ""
    except Exception as exc:
        logger.warning("QR generation failed: %s", exc)
        return ""


def _tr(label: str, value: str, shade: bool = False, bold: bool = False) -> str:
    """Render a two-column <tr> for the stay-details table in the HTML email."""
    bg   = "background:#f9fafb;" if shade else ""
    wgt  = "font-weight:700;color:#111827;" if bold else "color:#374151;"
    return (
        f'<tr style="{bg}border-bottom:1px solid #f3f4f6;">'
        f'<td style="color:#9ca3af;font-size:13px;padding:9px 12px;">{label}</td>'
        f'<td style="{wgt}font-size:14px;padding:9px 12px;text-align:right;">{value}</td>'
        f'</tr>'
    )


def _send_confirmation_email(booking) -> None:
    """
    Builds and sends the HTML + plain-text confirmation email.

    The QR code is attached as an inline CID image so it renders
    directly inside the email body without needing a public URL.

    Required settings.py keys:
        EMAIL_BACKEND, EMAIL_HOST, EMAIL_PORT, EMAIL_USE_TLS
        EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
        DEFAULT_FROM_EMAIL  e.g. "CMH Hotel <no-reply@cmhhotel.com>"

    Optional settings.py keys (all have safe defaults):
        SITE_NAME      — default "CMH Hotel"
        SUPPORT_EMAIL  — default "support@cmhhotel.com"
        FRONTEND_URL   — default "http://localhost:5173"
    """
    from email.mime.image import MIMEImage

    site_name     = getattr(settings, "SITE_NAME",          "CMH Hotel")
    support_email = getattr(settings, "SUPPORT_EMAIL",      "support@cmhhotel.com")
    frontend_url  = getattr(settings, "FRONTEND_URL",       "http://localhost:5173")
    from_email    = getattr(settings, "DEFAULT_FROM_EMAIL",  f"{site_name} <no-reply@cmhhotel.com>")
    booking_url   = f"{frontend_url}/bookings/my/{booking.pk}"

    # ── QR Code ────────────────────────────────────────────────────────────
    qr_base64 = _build_qr_base64(booking.reference_number)
    qr_tag    = (
        '<img src="cid:qr_code" alt="Check-in QR Code" width="180" height="180" '
        'style="display:block;border-radius:4px;" />'
        if qr_base64 else
        '<p style="color:#9ca3af;font-size:13px;">QR unavailable</p>'
    )

    # ── PIN digits — each digit as a styled box ────────────────────────────
    pin_boxes = "".join(
        f'<span style="display:inline-block;width:46px;height:54px;line-height:54px;'
        f'text-align:center;font-size:28px;font-weight:800;border:2px solid #e0e7ff;'
        f'border-radius:8px;margin:0 4px;background:#f8faff;color:#4f46e5;">'
        f'{d}</span>'
        for d in booking.checkin_pin
    )

    # ── Plain-text fallback ────────────────────────────────────────────────
    text_body = f"""
{site_name} — Booking Confirmed
{'─' * 48}

Hi {booking.full_name},

Your booking is confirmed and payment received.

  Reference Number : {booking.reference_number}
  Check-in PIN     : {booking.checkin_pin}
  Room             : #{booking.room.room_number} ({booking.room.get_room_type_display()})
  Check-in         : {booking.check_in}
  Check-out        : {booking.check_out}
  Nights           : {booking.nights}
  Guests           : {booking.guests_count}
  Total Paid       : PHP {booking.total_price:,.2f}

Present your Reference Number and PIN at reception with a valid ID.

View your booking: {booking_url}

Questions? Contact {support_email}

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

    <!-- ── Header ── -->
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

    <!-- ── Success hero ── -->
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

    <!-- ── Reference + QR card ── -->
    <tr>
      <td style="padding:0 32px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f8faff;border:2px solid #e0e7ff;
                      border-radius:14px;">
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

    <!-- ── Stay details ── -->
    <tr>
      <td style="padding:0 32px 28px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Stay Details
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {_tr("Room",       f"#{booking.room.room_number} — {booking.room.get_room_type_display()}")}
          {_tr("Check-in",   str(booking.check_in),  shade=True)}
          {_tr("Check-out",  str(booking.check_out))}
          {_tr("Duration",   f"{booking.nights} night{'s' if booking.nights != 1 else ''}",  shade=True)}
          {_tr("Guests",     str(booking.guests_count))}
          {_tr("Total Paid", f"PHP {booking.total_price:,.2f}", shade=True, bold=True)}
        </table>
      </td>
    </tr>

    <!-- ── CTA ── -->
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

    <!-- ── Footer ── -->
    <tr>
      <td style="background:#f9fafb;border-top:1px solid #f3f4f6;
                 padding:22px 32px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#9ca3af;">
          Questions? Email
          <a href="mailto:{support_email}"
             style="color:#4f46e5;text-decoration:none;">{support_email}</a>
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