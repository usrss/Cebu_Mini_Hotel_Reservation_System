"""
staff/emails.py

Email utilities for the staff invitation / activation workflow.

Sends a one-time activation email to a newly created staff member so they can
set their own password without the admin ever knowing it.

Requires the following Django settings:
  FRONTEND_URL  — base URL of your React / frontend app
                  e.g. "https://app.cebuminihotel.com"
                  Falls back to "http://localhost:5173" in development.

  EMAIL_BACKEND — e.g. "django.core.mail.backends.smtp.EmailBackend"
  DEFAULT_FROM_EMAIL — sender address

Usage (called from StaffCreateSerializer.create):
    from staff.emails import send_staff_activation_email
    send_staff_activation_email(request, user)
"""

import logging

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .tokens import staff_activation_token

logger = logging.getLogger(__name__)


def _build_activation_url(user: object) -> str:
    """
    Build the frontend activation URL.

    Format:
        <FRONTEND_URL>/staff/activate/<uidb64>/<token>/

    The frontend page at this URL calls:
        POST /api/staff/activate/<uidb64>/<token>/
    with { password, confirm_password } in the body.
    """
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
    uid   = urlsafe_base64_encode(force_bytes(user.pk))
    token = staff_activation_token.make_token(user)
    return f"{frontend_url}/staff/activate/{uid}/{token}/"


def send_staff_activation_email(user: object, role_display: str = "") -> bool:
    """
    Send an activation email to a newly created (inactive) staff account.

    Args:
        user          : The CustomUser instance (is_active=False, unusable password)
        role_display  : Human-readable role label, e.g. "Front Desk"

    Returns:
        True on success, False on failure (error is logged, not re-raised so the
        account creation itself still succeeds).
    """
    activation_url = _build_activation_url(user)
    display_name   = user.get_full_name() or user.email
    hotel_name     = getattr(settings, "HOTEL_NAME", "Cebu Mini Hotel")

    subject = f"Activate Your Staff Account — {hotel_name}"

    # ── Plain-text body ────────────────────────────────────────────────────────
    plain_body = f"""Hello {display_name},

Your staff account at {hotel_name} has been created{f" with the role: {role_display}" if role_display else ""}.

To get started, please activate your account and set your password by clicking the link below:

{activation_url}

This link will expire in {_token_expiry_days()} days. If you did not expect this email,
please contact your administrator.

— {hotel_name} System
"""

    # ── HTML body ──────────────────────────────────────────────────────────────
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body      {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f0f; color: #e5e5e5; margin: 0; padding: 0; }}
    .wrapper  {{ max-width: 560px; margin: 40px auto; background: #1a1a1a; border-radius: 12px;
                 border: 1px solid #333; overflow: hidden; }}
    .header   {{ background: #1a1a1a; border-bottom: 1px solid #333; padding: 32px 40px 24px; }}
    .brand    {{ font-size: 11px; letter-spacing: 3px; color: #C9A84C; text-transform: uppercase;
                 font-weight: 700; margin-bottom: 8px; }}
    h1        {{ margin: 0; font-size: 22px; font-weight: 700; color: #f5f5f5; }}
    .body     {{ padding: 32px 40px; }}
    p         {{ line-height: 1.7; color: #aaa; font-size: 14px; margin: 0 0 16px; }}
    .name     {{ color: #f5f5f5; font-weight: 600; }}
    .role-tag {{ display: inline-block; background: rgba(201,168,76,.15); color: #C9A84C;
                 border: 1px solid rgba(201,168,76,.3); border-radius: 6px;
                 padding: 3px 10px; font-size: 12px; font-weight: 600;
                 letter-spacing: .5px; margin-bottom: 24px; }}
    .btn      {{ display: inline-block; background: #C9A84C; color: #0f0f0f !important;
                 text-decoration: none; padding: 14px 32px; border-radius: 8px;
                 font-weight: 700; font-size: 14px; letter-spacing: .5px; margin: 8px 0 24px; }}
    .note     {{ font-size: 12px; color: #666; margin-top: 24px; padding-top: 20px;
                 border-top: 1px solid #2a2a2a; }}
    .footer   {{ padding: 20px 40px; background: #141414; border-top: 1px solid #222;
                 font-size: 11px; color: #555; text-align: center; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="brand">{hotel_name}</div>
      <h1>You've been invited to join the team</h1>
    </div>
    <div class="body">
      <p>Hello, <span class="name">{display_name}</span></p>
      {"<span class='role-tag'>" + role_display + "</span>" if role_display else ""}
      <p>
        Your staff account has been created. Click the button below to activate
        your account and set your password.
      </p>
      <a href="{activation_url}" class="btn">Activate My Account</a>
      <p class="note">
        This link expires in <strong>{_token_expiry_days()} days</strong>.<br />
        If you were not expecting this email, please ignore it or contact your administrator.
      </p>
    </div>
    <div class="footer">{hotel_name} &mdash; Staff Portal</div>
  </div>
</body>
</html>
"""

    try:
        send_mail(
            subject       = subject,
            message       = plain_body,
            from_email    = settings.DEFAULT_FROM_EMAIL,
            recipient_list= [user.email],
            html_message  = html_body,
            fail_silently = False,
        )
        logger.info("Activation email sent to %s", user.email)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to send activation email to %s: %s", user.email, exc)
        return False


def _token_expiry_days() -> int:
    """Return PASSWORD_RESET_TIMEOUT in whole days (default Django value = 3 days)."""
    timeout_seconds = getattr(settings, "PASSWORD_RESET_TIMEOUT", 259200)  # 3 days
    return max(1, timeout_seconds // 86400)