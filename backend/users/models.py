"""
User authentication models for Cebu Mini Hotel
Supports email, Google, and Facebook authentication with 2FA
"""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone
from datetime import timedelta
# users/models.py

class CustomUserManager(BaseUserManager):
    """Manager for custom user model"""

    def create_user(self, email, password=None, **extra_fields):
        """Create and save a regular user"""
        if not email:
            raise ValueError("Email address is required")

        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Create and save a superuser"""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")

        return self.create_user(email, password, **extra_fields)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    """Custom user model with email as username"""

    AUTH_PROVIDER_EMAIL = 'email'
    AUTH_PROVIDER_GOOGLE = 'google'
    AUTH_PROVIDER_FACEBOOK = 'facebook'

    AUTH_PROVIDER_CHOICES = [
        (AUTH_PROVIDER_EMAIL, 'Email'),
        (AUTH_PROVIDER_GOOGLE, 'Google'),
        (AUTH_PROVIDER_FACEBOOK, 'Facebook'),
    ]

    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, blank=True, default='')

    # Authentication provider tracking
    auth_provider = models.CharField(
        max_length=50,
        choices=AUTH_PROVIDER_CHOICES,
        default=AUTH_PROVIDER_EMAIL
    )
    social_id = models.CharField(max_length=255, blank=True, null=True)

    # Account status
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)

    # Timestamps
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'auth_user'
        verbose_name = 'user'
        verbose_name_plural = 'users'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['auth_provider', 'social_id']),
        ]

    def __str__(self):
        return self.email

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.email

    def get_short_name(self):
        return self.first_name or self.email


class VerificationCode(models.Model):
    """
    Temporary verification codes for 2FA
    Used for registration, login, password reset, and email change
    """

    PURPOSE_REGISTRATION = 'registration'
    PURPOSE_LOGIN = 'login'
    PURPOSE_PASSWORD_RESET = 'password_reset'
    PURPOSE_EMAIL_CHANGE = 'email_change'

    PURPOSE_CHOICES = [
        (PURPOSE_REGISTRATION, 'Registration'),
        (PURPOSE_LOGIN, 'Login'),
        (PURPOSE_PASSWORD_RESET, 'Password Reset'),
        (PURPOSE_EMAIL_CHANGE, 'Email Change'),
    ]

    email = models.EmailField(db_index=True)
    code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)

    # Optional fields for registration / email change
    password = models.CharField(max_length=128, blank=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    auth_provider = models.CharField(max_length=50, default='email')
    social_id = models.CharField(max_length=255, blank=True, null=True)

    # Tracking
    attempts = models.IntegerField(default=0)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = 'verification_codes'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', 'code', 'purpose']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"{self.email} - {self.purpose} - {self.code}"

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=5)
        super().save(*args, **kwargs)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def is_valid(self):
        return not self.is_expired() and not self.is_used and self.attempts < 5

    def increment_attempts(self):
        self.attempts += 1
        self.save(update_fields=['attempts'])


class SocialAuthToken(models.Model):
    """Store social authentication tokens for future API calls"""

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='social_tokens')
    provider = models.CharField(max_length=50)
    access_token = models.TextField()
    refresh_token = models.TextField(blank=True, null=True)
    token_type = models.CharField(max_length=50, default='Bearer')
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'social_auth_tokens'
        unique_together = ['user', 'provider']
        indexes = [
            models.Index(fields=['user', 'provider']),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.provider}"

    def is_expired(self):
        if not self.expires_at:
            return False
        return timezone.now() > self.expires_at