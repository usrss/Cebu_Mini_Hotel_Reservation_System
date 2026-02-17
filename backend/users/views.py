"""
Views for user authentication
Handles registration, verification, login with JWT tokens
Includes forgot password and account settings
"""
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from django.utils import timezone

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


# ─── Registration ──────────────────────────────────────────────────────────────

class RegisterRequestView(generics.CreateAPIView):
    """
    Request verification code for registration
    POST /api/auth/register/request/
    """
    serializer_class = RegisterRequestSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verification = serializer.save()

        return Response({
            'message': 'Verification code sent to your email',
            'email': verification.email,
            'expires_in_seconds': 300
        }, status=status.HTTP_200_OK)


class RegisterVerifyView(generics.CreateAPIView):
    """
    Verify code and complete registration
    POST /api/auth/register/verify/
    """
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
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'is_first_login': True
        }, status=status.HTTP_201_CREATED)


# ─── Login / Logout ────────────────────────────────────────────────────────────

class LoginView(APIView):
    """
    Login with email/password or social auth
    POST /api/auth/login/
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Login successful',
            'user': UserSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    Logout (blacklist refresh token)
    POST /api/auth/logout/
    """
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)

            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)


# ─── Token ─────────────────────────────────────────────────────────────────────

class CustomTokenRefreshView(TokenRefreshView):
    """
    Refresh access token
    POST /api/auth/token/refresh/
    """
    pass


# ─── Utilities ─────────────────────────────────────────────────────────────────

class ResendCodeView(generics.CreateAPIView):
    """
    Resend verification code
    POST /api/auth/resend-code/
    """
    serializer_class = ResendCodeSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response({
            'message': 'New verification code sent to your email'
        }, status=status.HTTP_200_OK)


# ─── User Profile ──────────────────────────────────────────────────────────────

class CurrentUserView(APIView):
    """
    Get current authenticated user
    GET /api/auth/me/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ─── Forgot Password ───────────────────────────────────────────────────────────

class ForgotPasswordRequestView(generics.CreateAPIView):
    """
    Step 1: Send 6-digit reset code to email
    POST /api/auth/forgot-password/
    Body: { "email": "user@example.com" }
    """
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
    """
    Step 2: Verify the 6-digit reset code
    POST /api/auth/forgot-password/verify/
    Body: { "email": "user@example.com", "code": "123456" }
    """
    serializer_class = ForgotPasswordVerifySerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        return Response({
            'message': 'Code verified. You may now reset your password.'
        }, status=status.HTTP_200_OK)


class ForgotPasswordResetView(generics.CreateAPIView):
    """
    Step 3: Set new password
    POST /api/auth/forgot-password/reset/
    Body: { "email": "user@example.com", "code": "123456", "new_password": "newpass123" }
    """
    serializer_class = ForgotPasswordResetSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response({
            'message': 'Password reset successful. You can now sign in with your new password.'
        }, status=status.HTTP_200_OK)


# ─── Account Settings ──────────────────────────────────────────────────────────

class UpdateProfileView(APIView):
    """
    Edit name and phone.
    PATCH /api/auth/profile/
    Body: { "first_name": "...", "last_name": "...", "phone": "..." }
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        serializer = UpdateProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response({
            'message': 'Profile updated successfully.',
            'user': UserSerializer(user).data
        }, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    """
    Change password (email accounts only).
    POST /api/auth/change-password/
    Body: { "current_password": "...", "new_password": "...", "confirm_password": "..." }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Blacklist all existing tokens to force re-login
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            tokens = OutstandingToken.objects.filter(user=request.user)
            for token in tokens:
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            pass

        return Response({
            'message': 'Password changed successfully. Please log in again.'
        }, status=status.HTTP_200_OK)


class UpdateEmailRequestView(APIView):
    """
    Step 1: Request email change.
    POST /api/auth/change-email/request/
    Body: { "new_email": "...", "password": "..." }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = UpdateEmailRequestSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        verification = serializer.save()

        return Response({
            'message': f'Verification code sent to {verification.email}.',
            'expires_in_seconds': 300
        }, status=status.HTTP_200_OK)


class UpdateEmailVerifyView(APIView):
    """
    Step 2: Verify code and update email.
    POST /api/auth/change-email/verify/
    Body: { "new_email": "...", "code": "..." }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = UpdateEmailVerifySerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response({
            'message': 'Email updated successfully.',
            'user': UserSerializer(user).data
        }, status=status.HTTP_200_OK)


class LogoutAllSessionsView(APIView):
    """
    Logout from all devices by blacklisting all tokens.
    POST /api/auth/logout-all/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            tokens = OutstandingToken.objects.filter(user=request.user)
            count = 0
            for token in tokens:
                _, created = BlacklistedToken.objects.get_or_create(token=token)
                if created:
                    count += 1

            return Response({
                'message': f'Logged out from all {count} active session(s).'
            }, status=status.HTTP_200_OK)
        except Exception:
            return Response({
                'message': 'Logged out from all sessions.'
            }, status=status.HTTP_200_OK)