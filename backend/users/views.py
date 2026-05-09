"""
Views for user authentication
Handles registration, verification, login with JWT tokens
Includes forgot password, account settings, and adaptive CAPTCHA.
"""

import hmac, hashlib, time, json, base64, secrets
import requests as http_requests

from rest_framework import generics, status, serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
import random

from .serializers import (
    RegisterRequestSerializer,
    RegisterVerifySerializer,
    LoginSerializer,
    UserSerializer,
    ResendCodeSerializer,
    ForgotPasswordRequestSerializer,
    ForgotPasswordVerifySerializer,
    ForgotPasswordResetSerializer,
    UpdateProfileSerializer,
    ChangePasswordSerializer,
    UpdateEmailRequestSerializer,
    UpdateEmailVerifySerializer,
)
from .models import CustomUser


# ─── Adaptive CAPTCHA helpers ──────────────────────────────────────────────────

CAPTCHA_SECRET = getattr(settings, 'CAPTCHA_SECRET', 'change-me-in-production')

# Cache key templates
# FIX: fail key now scoped to email so shared-IP deployments (Render, Vercel)
# don't let one user's failures lock out everyone else on the same server IP.
_FAIL_KEY = lambda ip, email='': f'login_fail:{ip}:{email.lower()}'
_RATE_KEY = lambda ip: f'login_rate:{ip}'   # requests per 10 seconds


def _get_client_ip(request) -> str:
    """Extract real client IP, respecting common proxy headers."""
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '0.0.0.0')


def _captcha_needed(ip: str, email: str = '') -> bool:
    """
    Returns True (show challenge) under any of:
      1. ≥ 3 failed login attempts for this email in the last 10 minutes
      2. > 10 login requests from this IP in the last 10 seconds (rapid retry)
         — threshold raised from 3 to 10 so shared-IP servers don't false-trigger
    """
    fail_count = cache.get(_FAIL_KEY(ip, email), 0)
    rate_count = cache.get(_RATE_KEY(ip), 0)
    return fail_count >= 3 or rate_count > 10


def _record_failure(ip: str, email: str = ''):
    """Increment per-email failure counter (10-minute window)."""
    key = _FAIL_KEY(ip, email)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=600)   # 10 minutes


def _record_request(ip: str):
    """Increment rapid-retry counter (10-second window)."""
    key = _RATE_KEY(ip)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=10)    # 10 seconds


def _clear_counters(ip: str, email: str = ''):
    """Reset counters on successful login."""
    cache.delete(_FAIL_KEY(ip, email))
    cache.delete(_RATE_KEY(ip))


def _make_captcha_token(question: str, answer: int) -> str:
    """
    Create a tamper-proof HMAC token so we can verify the answer server-side
    without storing anything in the database or session.
    """
    expires = int(time.time()) + 300    # 5-minute window
    payload = json.dumps({'q': question, 'a': answer, 'exp': expires})
    sig = hmac.new(
        CAPTCHA_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    raw = json.dumps({'p': payload, 's': sig})
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _verify_captcha_token(token: str, submitted_answer: str) -> tuple[bool, bool]:
    """
    Verifies a captcha token + submitted answer.
    Returns (token_valid: bool, answer_correct: bool)
    """
    if not token:
        return False, False
    try:
        raw  = base64.urlsafe_b64decode(token.encode()).decode()
        data = json.loads(raw)
        payload = data['p']
        sig     = data['s']

        expected_sig = hmac.new(
            CAPTCHA_SECRET.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(sig, expected_sig):
            return False, False     # tampered

        inner = json.loads(payload)
        if time.time() > inner['exp']:
            return False, False     # expired

        return True, (str(inner['a']) == str(submitted_answer).strip())
    except Exception:
        return False, False


def _generate_puzzle() -> dict:
    """Generate a simple integer arithmetic puzzle."""
    ops = [
        lambda a, b: (f"{a} + {b}", a + b),
        lambda a, b: (f"{a} × {b}", a * b),
        lambda a, b: (f"{max(a,b)} − {min(a,b)}", max(a, b) - min(a, b)),
    ]
    a = random.randint(2, 12)
    b = random.randint(2, 9)
    op = random.choice(ops)
    question, answer = op(a, b)
    token = _make_captcha_token(question, answer)
    return {'question': question, 'token': token}


# ─── Captcha endpoint ──────────────────────────────────────────────────────────

class CaptchaView(APIView):
    """
    GET /api/auth/captcha/
    Returns a fresh math puzzle: { question: "8 × 3", token: "<hmac-token>" }
    The token encodes the correct answer — no DB/session needed.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(_generate_puzzle(), status=status.HTTP_200_OK)


# ─── Registration ──────────────────────────────────────────────────────────────

# users/views.py — RegisterRequestView

class RegisterRequestView(generics.CreateAPIView):
    serializer_class = RegisterRequestSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        # ── Google OAuth — skip email verification entirely ──────────────────
        if request.data.get('auth_provider') == 'google':
            access_token = request.data.get('access_token')
            if not access_token:
                return Response(
                    {'detail': 'Google access token is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Verify token with Google
            google_resp = http_requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=10,
            )
            if google_resp.status_code != 200:
                return Response(
                    {'detail': 'Invalid Google token.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            google_data = google_resp.json()
            email       = google_data.get('email', '').lower()
            first_name  = google_data.get('given_name', '')
            last_name   = google_data.get('family_name', '')

            # Get or create user — Google users are pre-verified
            user, created = CustomUser.objects.get_or_create(
                email=email,
                defaults={
                    'first_name': first_name,
                    'last_name':  last_name,
                    'auth_provider': 'google',
                    'is_active': True,
                    'is_verified': True,
                }
            )

            # If user exists but used email registration before, link Google
            if not created and user.auth_provider != 'google':
                user.auth_provider = 'google'
                user.save(update_fields=['auth_provider'])

            user.last_login = timezone.now()
            user.save(update_fields=['last_login'])

            refresh = RefreshToken.for_user(user)
            return Response({
                'message': 'Google sign-in successful.',
                'user':    UserSerializer(user).data,
                'tokens':  {
                    'refresh': str(refresh),
                    'access':  str(refresh.access_token),
                },
                'is_first_login': created,
            }, status=status.HTTP_200_OK)

        # ── Email registration — original flow ───────────────────────────────
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            verification = serializer.save()
        except Exception as e:
            print(f"[RegisterRequestView] Email send failed: {e}")
            return Response(
                {'detail': 'Failed to send verification email. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            'message':            'Verification code sent to your email',
            'email':              verification.email,
            'expires_in_seconds': 300,
        }, status=status.HTTP_200_OK)


class RegisterVerifyView(generics.CreateAPIView):
    serializer_class = RegisterVerifySerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        refresh = RefreshToken.for_user(user)
        return Response({
            'message': 'Registration successful! Welcome to Cebu Mini Hotel.',
            'user': UserSerializer(user).data,
            'tokens': {'refresh': str(refresh), 'access': str(refresh.access_token)},
            'is_first_login': True
        }, status=status.HTTP_201_CREATED)


# ─── Login ─────────────────────────────────────────────────────────────────────

class LoginView(APIView):
    """
    POST /api/auth/login/

    Adaptive protection layers (no third-party service needed):
    ─────────────────────────────────────────────────────────────
    Layer 1 — IP request-rate tracking (10-second window, Django cache).
              > 10 requests in 10 s  →  captcha_required: true

    Layer 2 — Per-email failure tracking (10-minute window, Django cache).
              ≥ 3 failures for same email  →  captcha_required: true

    Layer 3 — HMAC-signed math puzzle verification (when captcha is shown).
              Wrong answer          →  captcha_required: true, captcha_wrong: true
              Expired / tampered    →  captcha_required: true

    Clean login resets both counters.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        ip    = _get_client_ip(request)
        email = request.data.get('email', '').lower()   # FIX: extract email early

        _record_request(ip)   # always count the incoming request

        needs_captcha = _captcha_needed(ip, email)      # FIX: pass email

        # ── Validate CAPTCHA when required ────────────────────────────────────
        if needs_captcha:
            token  = request.data.get('captcha_token', '')
            answer = request.data.get('captcha_answer', '')

            if not token:
                return Response({
                    'captcha_required': True,
                    'detail': 'Too many attempts. Please solve the security challenge.',
                }, status=status.HTTP_401_UNAUTHORIZED)

            token_valid, answer_correct = _verify_captcha_token(token, answer)

            if not token_valid:
                return Response({
                    'captcha_required': True,
                    'detail': 'Security challenge expired. Please try again.',
                }, status=status.HTTP_401_UNAUTHORIZED)

            if not answer_correct:
                return Response({
                    'captcha_required': True,
                    'captcha_wrong': True,
                    'detail': 'Incorrect answer. Please try again.',
                }, status=status.HTTP_401_UNAUTHORIZED)
        # ─────────────────────────────────────────────────────────────────────

        serializer = LoginSerializer(data=request.data)

        if not serializer.is_valid():
            _record_failure(ip, email)                  # FIX: pass email

            if _captcha_needed(ip, email):              # FIX: pass email
                errors = serializer.errors
                detail = (
                    list(errors.get('email', []) or
                         errors.get('password', []) or
                         errors.get('non_field_errors', []) or ['Invalid credentials'])[0]
                )
                return Response({
                    'captcha_required': True,
                    'detail': str(detail),
                }, status=status.HTTP_401_UNAUTHORIZED)

            raise serializers.ValidationError(serializer.errors)

        user = serializer.validated_data['user']
        _clear_counters(ip, email)                      # FIX: pass email

        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Login successful',
            'user': UserSerializer(user).data,
            'tokens': {'refresh': str(refresh), 'access': str(refresh.access_token)},
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                RefreshToken(refresh_token).blacklist()
        except Exception:
            pass
        return Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)


# ─── Token ─────────────────────────────────────────────────────────────────────

class CustomTokenRefreshView(TokenRefreshView):
    pass


# ─── Utilities ─────────────────────────────────────────────────────────────────

class ResendCodeView(generics.CreateAPIView):
    serializer_class = ResendCodeSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'message': 'New verification code sent to your email'}, status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


# ─── Forgot Password ───────────────────────────────────────────────────────────

class ForgotPasswordRequestView(generics.CreateAPIView):
    serializer_class = ForgotPasswordRequestSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            'message': 'If this email is registered, a reset code has been sent.',
            'expires_in_seconds': 300
        }, status=status.HTTP_200_OK)


class ForgotPasswordVerifyView(generics.CreateAPIView):
    serializer_class = ForgotPasswordVerifySerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({'message': 'Code verified. You may now reset your password.'}, status=status.HTTP_200_OK)


class ForgotPasswordResetView(generics.CreateAPIView):
    serializer_class = ForgotPasswordResetSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'message': 'Password reset successful. You can now sign in with your new password.'}, status=status.HTTP_200_OK)


# ─── Account Settings ──────────────────────────────────────────────────────────

class UpdateProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        serializer = UpdateProfileSerializer(request.user, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response({'message': 'Profile updated successfully.', 'user': UserSerializer(user).data}, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            for token in OutstandingToken.objects.filter(user=request.user):
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            pass
        return Response({'message': 'Password changed successfully. Please log in again.'}, status=status.HTTP_200_OK)


class UpdateEmailRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = UpdateEmailRequestSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        verification = serializer.save()
        return Response({
            'message': f'Verification code sent to {verification.email}.',
            'expires_in_seconds': 300
        }, status=status.HTTP_200_OK)


class UpdateEmailVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = UpdateEmailVerifySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response({'message': 'Email updated successfully.', 'user': UserSerializer(user).data}, status=status.HTTP_200_OK)


class LogoutAllSessionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            tokens = OutstandingToken.objects.filter(user=request.user)
            count = sum(1 for t in tokens if BlacklistedToken.objects.get_or_create(token=t)[1])
            return Response({'message': f'Logged out from all {count} active session(s).'}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'message': 'Logged out from all sessions.'}, status=status.HTTP_200_OK)