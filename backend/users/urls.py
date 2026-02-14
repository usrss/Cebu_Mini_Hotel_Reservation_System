"""
URL configuration for authentication endpoints
"""
from django.urls import path
from .views import (
    RegisterRequestView,
    RegisterVerifyView,
    LoginView,
    LogoutView,
    ResendCodeView,
    CurrentUserView,
    UpdateProfileView,
    CustomTokenRefreshView
)

app_name = 'authentication'

urlpatterns = [
    # Registration
    path('register/request/', RegisterRequestView.as_view(), name='register-request'),
    path('register/verify/', RegisterVerifyView.as_view(), name='register-verify'),

    # Login & Logout
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),

    # Token Management
    path('token/refresh/', CustomTokenRefreshView.as_view(), name='token-refresh'),

    # User Profile
    path('me/', CurrentUserView.as_view(), name='current-user'),
    path('profile/', UpdateProfileView.as_view(), name='update-profile'),

    # Utilities
    path('resend-code/', ResendCodeView.as_view(), name='resend-code'),
]
