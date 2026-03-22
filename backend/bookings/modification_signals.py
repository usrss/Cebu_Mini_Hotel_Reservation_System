# bookings/modification_signals.py
"""
Signals for the booking modification system.

Responsibilities:
  1. commit_modification_on_payment — when a modification payment is marked PAID,
     commit the new dates to the booking.
  2. send_modification_email — send a confirmation email after the modification
     is committed, showing updated dates, new total, and refund info if applicable.
"""

import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from payments.models import Payment, PaymentStatus

logger = logging.getLogger(__name__)


# ─── 1. Commit modification after payment ─────────────────────────────────────

@receiver(post_save, sender=Payment)
def commit_modification_on_payment(sender, instance, created, **kwargs):
    """
    When a Payment transitions to PAID and it is linked to a
    BookingModification (via ModificationPayment), commit the new
    dates to the booking and send the modification email.
    """
    if created:
        return
    if instance.status != PaymentStatus.PAID:
        return

    try:
        from bookings.models import ModificationPayment, ModificationStatus
        mod_payment = ModificationPayment.objects.select_related(
            "modification__booking__room"
        ).get(payment=instance)
    except ModificationPayment.DoesNotExist:
        return
    except Exception as exc:
        logger.error("commit_modification_on_payment error: %s", exc)
        return

    mod = mod_payment.modification

    if mod.status != ModificationStatus.AWAITING_PAYMENT:
        logger.warning(
            "Modification %s already in status '%s' — skipping commit.",
            mod.pk, mod.status,
        )
        return

    try:
        mod.commit_to_booking(changed_by=None)
        logger.info(
            "Modification %s committed to booking %s after payment %s.",
            mod.pk, mod.booking_id, instance.pk,
        )
        # Send modification confirmation email
        try:
            _send_modification_email(mod, payment=instance)
        except Exception as exc:
            logger.error(
                "Modification email failed for mod %s: %s", mod.pk, exc
            )
    except Exception as exc:
        logger.error(
            "Failed to commit modification %s after payment: %s",
            mod.pk, exc,
        )


# ─── 2. Email for refund-confirmed modifications ──────────────────────────────

def send_modification_refund_email(mod):
    """
    Called from ModificationRefundConfirmView after a reschedule with
    refund is confirmed. Sends the modification email with refund details.
    """
    try:
        _send_modification_email(mod, payment=None)
    except Exception as exc:
        logger.error(
            "Modification refund email failed for mod %s: %s", mod.pk, exc
        )


# ─── 3. Email for no-charge modifications ─────────────────────────────────────

def send_modification_free_email(mod):
    """
    Called from ModificationConfirmView after a reschedule with no price
    difference is confirmed. Sends the modification email.
    """
    try:
        _send_modification_email(mod, payment=None)
    except Exception as exc:
        logger.error(
            "Modification free email failed for mod %s: %s", mod.pk, exc
        )


# ─── Email builder ────────────────────────────────────────────────────────────

def _send_modification_email(mod, payment=None):
    """
    Sends a booking modification confirmation email to the guest.

    Works for all three modification paths:
      - Additional payment (extend or reschedule upgrade)
      - Refund (reschedule downgrade)
      - No price change (reschedule same price)

    Reuses the same helper functions and visual style as the booking
    confirmation email in payments/signals.py.
    """
    import io
    import base64
    from django.core.mail import EmailMultiAlternatives
    from django.conf import settings as django_settings
    from bookings.models import ModificationType

    site_name     = getattr(django_settings, "SITE_NAME",          "CMH Hotel")
    support_email = getattr(django_settings, "SUPPORT_EMAIL",      "support@cmhhotel.com")
    hotel_phone   = getattr(django_settings, "HOTEL_PHONE",        "+63 32 123 4567")
    frontend_url  = getattr(django_settings, "FRONTEND_URL",       "http://localhost:5173")
    from_email    = getattr(django_settings, "DEFAULT_FROM_EMAIL",  f"{site_name} <no-reply@cmhhotel.com>")

    booking      = mod.booking
    booking_url  = f"{frontend_url}/bookings/my/{booking.pk}"
    is_extend    = mod.modification_type == ModificationType.EXTEND
    is_reschedule = mod.modification_type == ModificationType.RESCHEDULE

    # ── Payment summary ────────────────────────────────────────────────────
    amount_paid    = payment.amount if payment else None
    net_refund     = mod.net_refund_amount if mod.net_refund_amount > 0 else None
    no_price_change = mod.no_price_change

    # ── Room times ─────────────────────────────────────────────────────────
    checkin_time  = _fmt_time(getattr(booking.room, "checkin_time",  None))
    checkout_time = _fmt_time(getattr(booking.room, "checkout_time", None))

    # ── Added nights (extend only) ─────────────────────────────────────────
    added_nights = mod.new_nights - mod.original_nights

    # ── Subject line ───────────────────────────────────────────────────────
    if is_extend:
        subject = f"[{site_name}] Stay Extended — {booking.reference_number}"
        action_label = "Stay Extended"
        hero_icon    = "📅"
        hero_subtitle = f"Your stay has been extended by {added_nights} night{'s' if added_nights != 1 else ''}."
    else:
        subject = f"[{site_name}] Booking Rescheduled — {booking.reference_number}"
        action_label = "Booking Rescheduled"
        hero_icon    = "🔄"
        hero_subtitle = "Your booking dates have been updated successfully."

    # ── Payment/refund notice HTML ─────────────────────────────────────────
    payment_notice_html = ""
    if amount_paid:
        payment_notice_html = f"""
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;">
          <tr>
            <td style="padding:14px 18px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#065f46;">
                ✓ Additional Payment Received
              </p>
              <p style="margin:0;font-size:13px;color:#047857;line-height:1.6;">
                <strong>{_fmt_php(amount_paid)}</strong> has been charged for this modification.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""
    elif net_refund:
        payment_notice_html = f"""
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
          <tr>
            <td style="padding:14px 18px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1e40af;">
                ↩ Refund Initiated
              </p>
              <p style="margin:0;font-size:13px;color:#1d4ed8;line-height:1.6;">
                A refund of <strong>{_fmt_php(net_refund)}</strong> has been initiated
                and will appear within 3–7 business days.
                {f'Processing fee of {_fmt_php(mod.processing_fee_deduction)} was deducted.' if mod.processing_fee_deduction > 0 else ''}
                {f'A same-day penalty of {_fmt_php(mod.penalty_deduction)} was applied.' if mod.penalty_deduction > 0 else ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""

    # ── Change summary rows ────────────────────────────────────────────────
    change_rows = ""
    if is_extend:
        change_rows = f"""
          {_tr("Previous Check-out", str(mod.original_check_out))}
          {_tr("New Check-out",      f"{mod.new_check_out} &nbsp;·&nbsp; by {checkout_time}", shade=True)}
          {_tr("Nights Added",       f"+{added_nights} night{'s' if added_nights != 1 else ''}")}
          {_tr("Total Nights",       f"{mod.new_nights} night{'s' if mod.new_nights != 1 else ''}", shade=True)}
        """
    else:
        change_rows = f"""
          {_tr("Previous Dates",    f"{mod.original_check_in} → {mod.original_check_out}")}
          {_tr("New Check-in",      f"{mod.new_check_in} &nbsp;·&nbsp; from {checkin_time}", shade=True)}
          {_tr("New Check-out",     f"{mod.new_check_out} &nbsp;·&nbsp; by {checkout_time}")}
          {_tr("Duration",          f"{mod.new_nights} night{'s' if mod.new_nights != 1 else ''}", shade=True)}
        """

    # ── Plain text fallback ────────────────────────────────────────────────
    if is_extend:
        change_text = f"""
  Previous Check-out : {mod.original_check_out}
  New Check-out      : {mod.new_check_out}
  Nights Added       : +{added_nights}
  Total Nights       : {mod.new_nights}"""
    else:
        change_text = f"""
  Previous Dates : {mod.original_check_in} → {mod.original_check_out}
  New Check-in   : {mod.new_check_in} from {checkin_time}
  New Check-out  : {mod.new_check_out} by {checkout_time}
  Duration       : {mod.new_nights} night{'s' if mod.new_nights != 1 else ''}"""

    if amount_paid:
        payment_text = f"  Additional Charge  : {_fmt_php(amount_paid)}"
    elif net_refund:
        payment_text = f"  Refund Initiated   : {_fmt_php(net_refund)} (3–7 business days)"
    else:
        payment_text = "  Price Change       : None"

    text_body = f"""
{site_name} — {action_label}
{'─' * 48}

Hi {booking.full_name},

Your booking has been successfully modified.

BOOKING REFERENCE
  {booking.reference_number}

WHAT CHANGED
{change_text}

NEW PRICE SUMMARY
  New Total          : {_fmt_php(mod.new_total)}
{payment_text}

YOUR CHECK-IN CREDENTIALS (UNCHANGED)
  Reference Number : {booking.reference_number}
  Check-in PIN     : {booking.checkin_pin}

HOTEL INFORMATION
  Phone  : {hotel_phone}
  Email  : {support_email}

View your booking: {booking_url}

— The {site_name} Team
    """.strip()

    # ── HTML body ──────────────────────────────────────────────────────────
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>{action_label} — {site_name}</title>
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
          Booking Modification
        </p>
      </td>
    </tr>

    <!-- Hero -->
    <tr>
      <td style="text-align:center;padding:36px 40px 24px;">
        <div style="display:inline-block;width:60px;height:60px;background:#ecfdf5;
                    border-radius:50%;line-height:60px;font-size:28px;margin-bottom:16px;">
          {hero_icon}
        </div>
        <h2 style="margin:0;color:#111827;font-size:22px;font-weight:700;">
          {action_label}!
        </h2>
        <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">
          Hi <strong>{booking.full_name}</strong>, {hero_subtitle}
        </p>
      </td>
    </tr>

    <!-- Reference -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f8faff;border:2px solid #e0e7ff;border-radius:14px;
                      padding:20px 24px;">
          <tr>
            <td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;
                         text-transform:uppercase;letter-spacing:0.08em;">
                Reference Number
              </p>
              <p style="margin:0 0 16px;font-size:22px;font-weight:800;color:#4f46e5;
                         font-family:'Courier New',monospace;">
                {booking.reference_number}
              </p>
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;
                         text-transform:uppercase;letter-spacing:0.08em;">
                Check-in PIN (unchanged)
              </p>
              <p style="margin:0;font-size:20px;font-weight:800;color:#111827;
                         letter-spacing:0.3em;font-family:'Courier New',monospace;">
                {booking.checkin_pin}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- What changed -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          What Changed
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {change_rows}
        </table>
      </td>
    </tr>

    <!-- Price summary -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Updated Price Summary
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {_tr("Subtotal",    _fmt_php(mod.new_subtotal))}
          {_tr("Tax (12%)",   _fmt_php(mod.new_tax),         shade=True)}
          {_tr("Service Fee", _fmt_php(mod.new_service_fee))}
          {_tr("New Total",   _fmt_php(mod.new_total),       shade=True, bold=True)}
          {_tr("Previous Total", _fmt_php(mod.original_total))}
        </table>
      </td>
    </tr>

    <!-- Payment / refund notice -->
    {payment_notice_html}

    <!-- Stay details -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#374151;
                   text-transform:uppercase;letter-spacing:0.07em;">
          Full Stay Details
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border:1px solid #f3f4f6;
                      border-radius:10px;overflow:hidden;">
          {_tr("Room",      f"#{booking.room.room_number} — {booking.room.get_room_type_display()}")}
          {_tr("Check-in",  f"{mod.new_check_in} &nbsp;·&nbsp; from {checkin_time}",   shade=True)}
          {_tr("Check-out", f"{mod.new_check_out} &nbsp;·&nbsp; by {checkout_time}")}
          {_tr("Duration",  f"{mod.new_nights} night{'s' if mod.new_nights != 1 else ''}", shade=True)}
          {_tr("Guests",    str(booking.guests_count))}
        </table>
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

    msg = EmailMultiAlternatives(
        subject    = subject,
        body       = text_body,
        from_email = from_email,
        to         = [booking.email],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send(fail_silently=False)

    logger.info(
        "Modification email sent → %s | ref=%s | type=%s",
        booking.email, booking.reference_number, mod.modification_type,
    )


# ─── Shared helpers (mirrors payments/signals.py) ─────────────────────────────

def _fmt_php(amount) -> str:
    try:
        return f"PHP {float(amount):,.2f}"
    except Exception:
        return f"PHP {amount}"


def _fmt_time(t) -> str:
    if not t:
        return "Standard time"
    try:
        from datetime import datetime
        return datetime.combine(datetime.today(), t).strftime("%I:%M %p").lstrip("0")
    except Exception:
        return str(t)


def _tr(label: str, value: str, shade: bool = False, bold: bool = False) -> str:
    bg  = "background:#f9fafb;" if shade else ""
    wgt = "font-weight:700;color:#111827;" if bold else "color:#374151;"
    return (
        f'<tr style="{bg}border-bottom:1px solid #f3f4f6;">'
        f'<td style="color:#9ca3af;font-size:13px;padding:9px 12px;">{label}</td>'
        f'<td style="{wgt}font-size:14px;padding:9px 12px;text-align:right;">{value}</td>'
        f'</tr>'
    )