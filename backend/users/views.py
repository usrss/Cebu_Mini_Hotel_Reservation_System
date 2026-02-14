"""
Views for user authentication
Handles registration, verification, login with JWT tokens
"""
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.utils import timezone
from django.contrib.auth import authenticate

from .serializers import (
    RegisterRequestSerializer,
    RegisterVerifySerializer,
    LoginSerializer,
    UserSerializer,
    ResendCodeSerializer
)
from .models import CustomUser


class RegisterRequestView(generics.CreateAPIView):
    """
    Request verification code for registration

    POST /api/auth/register/request/
    Body: {
        "email": "user@example.com",
        "password": "securepassword123",  // optional for social auth
        "first_name": "John",  // optional
        "last_name": "Doe",  // optional
        "auth_provider": "email",  // email, google, facebook
        "access_token": "..."  // required for social auth
    }
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
    Body: {
        "email": "user@example.com",
        "code": "123456"
    }

    Returns: User data + JWT tokens
    """
    serializer_class = RegisterVerifySerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Update last login
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        # Generate JWT tokens
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


class LoginView(APIView):
    """
    Login with email/password or social auth

    POST /api/auth/login/
    Body: {
        "email": "user@example.com",
        "password": "securepassword123",
        "auth_provider": "email"  // email, google, facebook
    }

    Returns: User data + JWT tokens
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']

        # Update last login
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Login successful',
            'user': UserSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_200_OK)


class ResendCodeView(generics.CreateAPIView):
    """
    Resend verification code

    POST /api/auth/resend-code/
    Body: {
        "email": "user@example.com",
        "purpose": "registration"  // registration, login, password_reset
    }
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


# backend/users/views.py

class LogoutView(APIView):
    """
    Logout (blacklist refresh token)

    POST /api/auth/logout/
    Body: {
        "refresh": "refresh_token_here"
    }
    """
    permission_classes = [AllowAny]  # Change from IsAuthenticated to AllowAny

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                # Even if no token, return success (user is logging out anyway)
                return Response({
                    'message': 'Logout successful'
                }, status=status.HTTP_200_OK)

            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response({
                'message': 'Logout successful'
            }, status=status.HTTP_200_OK)
        except Exception as e:
            # Even on error, return success (user wants to logout)
            return Response({
                'message': 'Logout successful'
            }, status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    """
    Get current authenticated user

    GET /api/auth/me/
    Headers: Authorization: Bearer <access_token>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UpdateProfileView(generics.UpdateAPIView):
    """
    Update user profile

    PATCH /api/auth/profile/
    Headers: Authorization: Bearer <access_token>
    Body: {
        "first_name": "John",
        "last_name": "Doe"
    }
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        return Response({
            'message': 'Profile updated successfully',
            'user': serializer.data
        }, status=status.HTTP_200_OK)


class CustomTokenRefreshView(TokenRefreshView):
    """
    Refresh access token

    POST /api/auth/token/refresh/
    Body: {
        "refresh": "refresh_token_here"
    }
    """
    pass
