"""
staff/activation_views.py

Staff account activation API views.

These are SEPARATE from staff/views.py so you can just import and add
the two URL patterns to your existing staff/urls.py without touching
the existing views at all.

Endpoints added:
  POST /api/staff/activate/<uidb64>/<token>/   — validate token + set password → activate
  GET  /api/staff/activate/<uidb64>/<token>/   — validate token only (used by frontend
                                                  to pre-check before showing the form)

Flow:
  1. Admin creates staff (StaffCreateSerializer → user.is_active = False,
     unusable password, activation email sent automatically).
  2. Staff clicks link in email → frontend shows a "Set Password" form.
  3. Frontend calls GET to check the token is still valid.
  4. Staff submits password → frontend calls POST with { password, confirm_password }.
  5. View sets the password, sets user.is_active = True, invalidates the token.
  6. Staff can now log in via the normal JWT endpoint.
"""

import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StaffProfile
from .tokens import staff_activation_token

User = get_user_model()
logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _resolve_user(uidb64: str):
    """
    Decode uidb64 and return the matching User, or None on any error.
    Only returns the user if they have a staff_profile (safety check).
    """
    try:
        uid  = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.select_related("staff_profile").get(pk=uid)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return None

    # Make sure this is actually a staff account
    if not hasattr(user, "staff_profile"):
        return None

    return user


# ═══════════════════════════════════════════════════════════════════════════════
# GET  /api/staff/activate/<uidb64>/<token>/
# POST /api/staff/activate/<uidb64>/<token>/
# ═══════════════════════════════════════════════════════════════════════════════

class StaffActivateView(APIView):
    """
    Handles both the token-validation pre-check (GET) and
    the actual password-set + activation (POST).

    No authentication required — the signed token IS the credential.
    """
    permission_classes = [AllowAny]

    # ── GET: validate token ────────────────────────────────────────────────────
    def get(self, request, uidb64, token):
        """
        Used by the frontend "Set Password" page on load to verify the link
        is still valid before rendering the form.

        Returns 200 { valid: true, email, full_name } or 400 { valid: false }.
        """
        user = _resolve_user(uidb64)

        if not user or not staff_activation_token.check_token(user, token):
            return Response(
                {"valid": False, "detail": "Activation link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.is_active:
            return Response(
                {"valid": False, "detail": "This account has already been activated. Please log in."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            "valid":      True,
            "email":      user.email,
            "full_name":  user.get_full_name(),
            "role":       getattr(user.staff_profile, "role", None),
        })

    # ── POST: set password + activate ─────────────────────────────────────────
    def post(self, request, uidb64, token):
        """
        Body: { "password": "...", "confirm_password": "..." }

        On success:
          - Password is set
          - user.is_active = True
          - staff_profile.is_active = True  (in case it was False)
          - Token is invalidated (password hash changed)
          - Returns 200 { detail, email }
        """
        user = _resolve_user(uidb64)

        if not user or not staff_activation_token.check_token(user, token):
            return Response(
                {"detail": "Activation link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.is_active:
            return Response(
                {"detail": "This account has already been activated. Please log in."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Validate input ─────────────────────────────────────────────────────
        password         = request.data.get("password", "").strip()
        confirm_password = request.data.get("confirm_password", "").strip()

        if not password:
            return Response(
                {"detail": "Password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if password != confirm_password:
            return Response(
                {"detail": "Passwords do not match."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Run Django's built-in password validators
        try:
            validate_password(password, user=user)
        except DjangoValidationError as exc:
            return Response(
                {"detail": " ".join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Atomically activate the account ───────────────────────────────────
        with transaction.atomic():
            user.set_password(password)
            user.is_active = True
            user.save(update_fields=["password", "is_active"])

            # Also ensure the StaffProfile is marked active
            profile = user.staff_profile
            if not profile.is_active:
                profile.is_active = True
                profile.save(update_fields=["is_active", "updated_at"])

        logger.info(
            "Staff account activated: %s (pk=%s, role=%s)",
            user.email, user.pk, getattr(profile, "role", "—"),
        )

        return Response({
            "detail": "Account activated successfully. You can now log in.",
            "email":  user.email,
        })