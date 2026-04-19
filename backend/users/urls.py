"""
URL configuration for authentication endpoints
"""
from django.urls import path
from .views import (
    # Registration
    RegisterRequestView,
    RegisterVerifyView,
    # Login / Logout
    LoginView,
    LogoutView,
    LogoutAllSessionsView,
    # Token
    CustomTokenRefreshView,
    # User
    CurrentUserView,
    # Utilities
    ResendCodeView,
    # Forgot Password
    ForgotPasswordRequestView,
    ForgotPasswordVerifyView,
    ForgotPasswordResetView,
    # Account Settings
    UpdateProfileView,
    ChangePasswordView,
    UpdateEmailRequestView,
    UpdateEmailVerifyView,
    # Adaptive CAPTCHA
    CaptchaView,
)

app_name = 'authentication'

urlpatterns = [
    # Registration
    path('register/request/', RegisterRequestView.as_view(), name='register-request'),
    path('register/verify/',  RegisterVerifyView.as_view(),  name='register-verify'),

    # Login & Logout
    path('login/',      LoginView.as_view(),           name='login'),
    path('logout/',     LogoutView.as_view(),           name='logout'),
    path('logout-all/', LogoutAllSessionsView.as_view(), name='logout-all'),

    # Token Management
    path('token/refresh/', CustomTokenRefreshView.as_view(), name='token-refresh'),

    # Current User
    path('me/', CurrentUserView.as_view(), name='current-user'),

    # Utilities
    path('resend-code/', ResendCodeView.as_view(), name='resend-code'),

    # Forgot Password (3-step flow)
    path('forgot-password/',         ForgotPasswordRequestView.as_view(), name='forgot-password-request'),
    path('forgot-password/verify/',  ForgotPasswordVerifyView.as_view(),  name='forgot-password-verify'),
    path('forgot-password/reset/',   ForgotPasswordResetView.as_view(),   name='forgot-password-reset'),

    # Account Settings
    path('profile/',              UpdateProfileView.as_view(),      name='update-profile'),
    path('change-password/',      ChangePasswordView.as_view(),     name='change-password'),
    path('change-email/request/', UpdateEmailRequestView.as_view(), name='change-email-request'),
    path('change-email/verify/',  UpdateEmailVerifyView.as_view(),  name='change-email-verify'),

    # Adaptive CAPTCHA puzzle generator
    path('captcha/', CaptchaView.as_view(), name='captcha'),
]