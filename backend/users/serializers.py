"""
Serializers for user authentication
Handles email, Google, and Facebook authentication with 2FA
Includes forgot password and account settings (profile, email, password change)
"""
from rest_framework import serializers
from django.conf import settings
from django.core.mail import send_mail
from django.contrib.auth.hashers import make_password
from .models import VerificationCode, CustomUser, SocialAuthToken
import random
import re
import requests
from django.utils import timezone


# ─── Password Validation ───────────────────────────────────────────────────────

def validate_password_strength(password):
    """
    Enforce strong password rules:
    - Minimum 8 characters
    - At least 1 uppercase letter
    - At least 1 number
    - At least 1 special character
    """
    errors = []
    if len(password) < 8:
        errors.append('Password must be at least 8 characters.')
    if not re.search(r'[A-Z]', password):
        errors.append('Password must contain at least 1 uppercase letter.')
    if not re.search(r'[0-9]', password):
        errors.append('Password must contain at least 1 number.')
    if not re.search(r'[!@#$%^&*()\-_=+\[\]{};:\'",.<>/?\\|`~]', password):
        errors.append('Password must contain at least 1 special character.')
    return errors


# ─── User Serializer ───────────────────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for user data responses.
    Includes staff_profile when the user is a staff member.
    The staff_profile.effective_role field is what the frontend uses
    for all role-based permission checks (respects temp_role overrides).
    """

    full_name     = serializers.CharField(source='get_full_name', read_only=True)
    staff_profile = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = [
            'id',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'phone',
            'auth_provider',
            'is_active',
            'is_verified',
            'is_staff',
            'date_joined',
            'last_login',
            'staff_profile',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login', 'is_staff']

    def get_staff_profile(self, obj):
        """
        Returns the nested staff profile dict if the user has one.
        Uses the OneToOne reverse accessor defined in staff/models.py:
            StaffProfile.user = OneToOneField(..., related_name='staff_profile')

        effective_role is a @property on StaffProfile that returns
        temp_role if it is currently active, otherwise falls back to role.
        This is the value ProtectedRoute and useStaffRole read.
        """
        try:
            profile = obj.staff_profile
            return {
                'id':             profile.id,
                'role':           profile.role,
                'effective_role': profile.effective_role,
                'online_status':  profile.online_status,
                'employee_id':    profile.employee_id or '',
                'is_active':      profile.is_active,
            }
        except Exception:
            # User has no StaffProfile (regular guest) — return None
            return None


# ─── Registration ──────────────────────────────────────────────────────────────

class RegisterRequestSerializer(serializers.Serializer):
    """Request verification code for registration"""

    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        required=False,
        style={'input_type': 'password'}
    )
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    auth_provider = serializers.ChoiceField(
        choices=['email', 'google', 'facebook'],
        default='email'
    )
    access_token = serializers.CharField(required=False, write_only=True)
    social_id = serializers.CharField(required=False, write_only=True)

    def validate_email(self, value):
        if CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "This email is already registered. Please login instead."
            )
        return value.lower()

    def validate(self, attrs):
        auth_provider = attrs.get('auth_provider', 'email')

        if auth_provider == 'email':
            password = attrs.get('password')
            if not password:
                raise serializers.ValidationError({'password': 'Password is required for email registration'})
            password_errors = validate_password_strength(password)
            if password_errors:
                raise serializers.ValidationError({'password': password_errors})

        elif auth_provider in ['google', 'facebook']:
            if not attrs.get('access_token'):
                raise serializers.ValidationError({
                    'access_token': f'Access token is required for {auth_provider} registration'
                })

        return attrs

    def _verify_google_token(self, access_token):
        try:
            response = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    'email': data.get('email'),
                    'social_id': data.get('sub'),
                    'first_name': data.get('given_name', ''),
                    'last_name': data.get('family_name', ''),
                }
            return None
        except Exception:
            return None

    def _verify_facebook_token(self, access_token):
        try:
            response = requests.get(
                'https://graph.facebook.com/me',
                params={'fields': 'id,email,first_name,last_name', 'access_token': access_token},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    'email': data.get('email'),
                    'social_id': data.get('id'),
                    'first_name': data.get('first_name', ''),
                    'last_name': data.get('last_name', ''),
                }
            return None
        except Exception:
            return None

    def create(self, validated_data):
        auth_provider = validated_data.get('auth_provider', 'email')
        email = validated_data['email']

        social_data = None
        if auth_provider == 'google':
            social_data = self._verify_google_token(validated_data['access_token'])
            if not social_data:
                raise serializers.ValidationError('Invalid Google token')
            if social_data['email'].lower() != email.lower():
                raise serializers.ValidationError('Email mismatch with Google account')

        elif auth_provider == 'facebook':
            social_data = self._verify_facebook_token(validated_data['access_token'])
            if not social_data:
                raise serializers.ValidationError('Invalid Facebook token')
            if social_data['email'].lower() != email.lower():
                raise serializers.ValidationError('Email mismatch with Facebook account')

        VerificationCode.objects.filter(
            email=email,
            purpose=VerificationCode.PURPOSE_REGISTRATION
        ).delete()

        code = str(random.randint(100000, 999999))

        verification_data = {
            'email': email,
            'code': code,
            'purpose': VerificationCode.PURPOSE_REGISTRATION,
            'auth_provider': auth_provider,
        }

        if auth_provider == 'email' and validated_data.get('password'):
            verification_data['password'] = make_password(validated_data['password'])

        if social_data:
            verification_data['first_name'] = social_data.get('first_name', '')
            verification_data['last_name'] = social_data.get('last_name', '')
            verification_data['social_id'] = social_data.get('social_id', '')
        else:
            verification_data['first_name'] = validated_data.get('first_name', '')
            verification_data['last_name'] = validated_data.get('last_name', '')

        verification = VerificationCode.objects.create(**verification_data)
        self._send_verification_email(email, code, auth_provider)
        return verification

    def _send_verification_email(self, email, code, provider):
        provider_name = provider.capitalize() if provider != 'email' else 'Email'
        send_mail(
            subject='Cebu Mini Hotel - Verify Your Registration',
            message=f'''
Welcome to Cebu Mini Hotel!

Your verification code is: {code}

This code will expire in 5 minutes.

You are registering with {provider_name}.

If you did not request this code, please ignore this email.

Best regards,
Cebu Mini Hotel Team
            '''.strip(),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )


class RegisterVerifySerializer(serializers.Serializer):
    """Verify code and create user account"""

    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        email = attrs['email'].lower()
        code = attrs['code']

        try:
            verification = VerificationCode.objects.get(
                email=email,
                code=code,
                purpose=VerificationCode.PURPOSE_REGISTRATION
            )
        except VerificationCode.DoesNotExist:
            raise serializers.ValidationError({'code': 'Invalid verification code or email'})

        if not verification.is_valid():
            if verification.is_expired():
                verification.delete()
                raise serializers.ValidationError({'code': 'Verification code has expired. Please request a new one.'})
            elif verification.attempts >= 5:
                verification.delete()
                raise serializers.ValidationError({'code': 'Too many failed attempts. Please request a new code.'})
            elif verification.is_used:
                raise serializers.ValidationError({'code': 'This code has already been used.'})

        verification.increment_attempts()
        attrs['verification'] = verification
        return attrs

    def create(self, validated_data):
        verification = validated_data['verification']

        if CustomUser.objects.filter(email=verification.email).exists():
            verification.delete()
            raise serializers.ValidationError('This email is already registered.')

        user = CustomUser.objects.create(
            email=verification.email,
            first_name=verification.first_name,
            last_name=verification.last_name,
            auth_provider=verification.auth_provider,
            social_id=verification.social_id,
            is_verified=True,
            is_active=True
        )

        if verification.password:
            user.password = verification.password
            user.save(update_fields=['password'])

        verification.is_used = True
        verification.save(update_fields=['is_used'])
        verification.delete()

        return user


# ─── Login ─────────────────────────────────────────────────────────────────────

class LoginSerializer(serializers.Serializer):
    """Login with email/password or social auth"""

    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        required=False,
        style={'input_type': 'password'}
    )
    auth_provider = serializers.ChoiceField(
        choices=['email', 'google', 'facebook'],
        default='email'
    )
    access_token = serializers.CharField(required=False, write_only=True)

    def validate(self, attrs):
        email = attrs.get('email', '').lower()
        password = attrs.get('password')
        auth_provider = attrs.get('auth_provider', 'email')

        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            raise serializers.ValidationError({'email': 'No account found with this email.'})

        if auth_provider == 'email':
            if not password:
                raise serializers.ValidationError({'password': 'Password is required'})
            if not user.check_password(password):
                raise serializers.ValidationError({'password': 'Incorrect password'})

        if not user.is_active:
            raise serializers.ValidationError('This account has been deactivated.')

        attrs['user'] = user
        return attrs


# ─── Resend Code ───────────────────────────────────────────────────────────────

class ResendCodeSerializer(serializers.Serializer):
    """Resend verification code"""

    email = serializers.EmailField()
    purpose = serializers.ChoiceField(
        choices=['registration', 'login', 'password_reset'],
        default='registration'
    )

    def create(self, validated_data):
        email = validated_data['email'].lower()
        purpose = validated_data['purpose']

        VerificationCode.objects.filter(email=email, purpose=purpose).delete()
        code = str(random.randint(100000, 999999))

        verification = VerificationCode.objects.create(
            email=email,
            code=code,
            purpose=purpose
        )

        send_mail(
            subject='Cebu Mini Hotel - New Verification Code',
            message=f'''
Your new verification code is: {code}

This code will expire in 5 minutes.

If you did not request this code, please ignore this email.

Best regards,
Cebu Mini Hotel Team
            '''.strip(),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )

        return verification


# ─── Forgot Password ───────────────────────────────────────────────────────────

class ForgotPasswordRequestSerializer(serializers.Serializer):
    """Step 1: Send 6-digit reset code to email"""

    email = serializers.EmailField()

    def validate_email(self, value):
        value = value.lower()
        if not CustomUser.objects.filter(email=value).exists():
            # Generic message to avoid email enumeration
            raise serializers.ValidationError(
                "If this email is registered, you will receive a reset code."
            )
        return value

    def create(self, validated_data):
        email = validated_data['email']

        VerificationCode.objects.filter(
            email=email,
            purpose=VerificationCode.PURPOSE_PASSWORD_RESET
        ).delete()

        code = str(random.randint(100000, 999999))

        verification = VerificationCode.objects.create(
            email=email,
            code=code,
            purpose=VerificationCode.PURPOSE_PASSWORD_RESET
        )

        send_mail(
            subject='Cebu Mini Hotel - Password Reset Code',
            message=f'''
You requested a password reset for your Cebu Mini Hotel account.

Your password reset code is: {code}

This code will expire in 5 minutes.

If you did not request a password reset, please ignore this email.
Your password will not be changed.

Best regards,
Cebu Mini Hotel Team
            '''.strip(),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )

        return verification


class ForgotPasswordVerifySerializer(serializers.Serializer):
    """Step 2: Verify the 6-digit reset code"""

    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        email = attrs['email'].lower()
        code = attrs['code']

        try:
            verification = VerificationCode.objects.get(
                email=email,
                code=code,
                purpose=VerificationCode.PURPOSE_PASSWORD_RESET
            )
        except VerificationCode.DoesNotExist:
            raise serializers.ValidationError({'code': 'Invalid or expired reset code.'})

        if not verification.is_valid():
            if verification.is_expired():
                verification.delete()
                raise serializers.ValidationError({'code': 'Reset code has expired. Please request a new one.'})
            elif verification.attempts >= 5:
                verification.delete()
                raise serializers.ValidationError({'code': 'Too many failed attempts. Please request a new code.'})

        verification.increment_attempts()
        attrs['verification'] = verification
        return attrs


class ForgotPasswordResetSerializer(serializers.Serializer):
    """Step 3: Set the new password"""

    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    new_password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate_new_password(self, value):
        errors = validate_password_strength(value)
        if errors:
            raise serializers.ValidationError(errors)
        return value

    def validate(self, attrs):
        email = attrs['email'].lower()
        code = attrs['code']

        try:
            verification = VerificationCode.objects.get(
                email=email,
                code=code,
                purpose=VerificationCode.PURPOSE_PASSWORD_RESET
            )
        except VerificationCode.DoesNotExist:
            raise serializers.ValidationError({'code': 'Invalid or expired reset code.'})

        if not verification.is_valid():
            raise serializers.ValidationError({'code': 'Reset code is no longer valid. Please start over.'})

        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            raise serializers.ValidationError('User not found.')

        attrs['verification'] = verification
        attrs['user'] = user
        return attrs

    def create(self, validated_data):
        user = validated_data['user']
        verification = validated_data['verification']

        user.set_password(validated_data['new_password'])
        user.save(update_fields=['password'])

        verification.delete()
        return user


# ─── Account Settings ──────────────────────────────────────────────────────────

class UpdateProfileSerializer(serializers.ModelSerializer):
    """
    Update basic profile: first_name, last_name, phone
    PATCH /api/auth/profile/
    """

    class Meta:
        model = CustomUser
        fields = ['first_name', 'last_name', 'phone']

    def update(self, instance, validated_data):
        instance.first_name = validated_data.get('first_name', instance.first_name)
        instance.last_name = validated_data.get('last_name', instance.last_name)
        instance.phone = validated_data.get('phone', instance.phone)
        instance.save(update_fields=['first_name', 'last_name', 'phone'])
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    """
    Change password for email-authenticated users.
    POST /api/auth/change-password/
    """
    current_password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    new_password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    confirm_password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate_new_password(self, value):
        errors = validate_password_strength(value)
        if errors:
            raise serializers.ValidationError(errors)
        return value

    def validate(self, attrs):
        user = self.context['request'].user

        if user.auth_provider != CustomUser.AUTH_PROVIDER_EMAIL:
            raise serializers.ValidationError(
                'Password change is only available for email accounts.'
            )

        if not user.check_password(attrs['current_password']):
            raise serializers.ValidationError({'current_password': 'Current password is incorrect.'})

        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'New passwords do not match.'})

        if user.check_password(attrs['new_password']):
            raise serializers.ValidationError({'new_password': 'New password must be different from current password.'})

        return attrs

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class UpdateEmailRequestSerializer(serializers.Serializer):
    """
    Step 1: Request email change — sends verification code to NEW email.
    POST /api/auth/change-email/request/
    """
    new_email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate(self, attrs):
        user = self.context['request'].user
        new_email = attrs['new_email'].lower()

        if not user.check_password(attrs['password']):
            raise serializers.ValidationError({'password': 'Password is incorrect.'})

        if CustomUser.objects.filter(email=new_email).exclude(pk=user.pk).exists():
            raise serializers.ValidationError({'new_email': 'This email is already in use by another account.'})

        if new_email == user.email:
            raise serializers.ValidationError({'new_email': 'New email must be different from your current email.'})

        attrs['new_email'] = new_email
        return attrs

    def create(self, validated_data):
        user = self.context['request'].user
        new_email = validated_data['new_email']

        VerificationCode.objects.filter(
            email=new_email,
            purpose=VerificationCode.PURPOSE_EMAIL_CHANGE
        ).delete()

        code = str(random.randint(100000, 999999))

        # Store old email in first_name field for reference
        verification = VerificationCode.objects.create(
            email=new_email,
            code=code,
            purpose=VerificationCode.PURPOSE_EMAIL_CHANGE,
            first_name=user.email,
        )

        send_mail(
            subject='Cebu Mini Hotel - Verify Your New Email',
            message=f'''
Hello,

You requested to change your email address for your Cebu Mini Hotel account.

Your verification code is: {code}

This code will expire in 5 minutes.

If you did not request this change, please ignore this email.

Best regards,
Cebu Mini Hotel Team
            '''.strip(),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[new_email],
            fail_silently=False,
        )

        return verification


class UpdateEmailVerifySerializer(serializers.Serializer):
    """
    Step 2: Confirm code and update email.
    POST /api/auth/change-email/verify/
    """
    new_email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        new_email = attrs['new_email'].lower()
        code = attrs['code']

        try:
            verification = VerificationCode.objects.get(
                email=new_email,
                code=code,
                purpose=VerificationCode.PURPOSE_EMAIL_CHANGE
            )
        except VerificationCode.DoesNotExist:
            raise serializers.ValidationError({'code': 'Invalid verification code.'})

        if not verification.is_valid():
            if verification.is_expired():
                verification.delete()
                raise serializers.ValidationError({'code': 'Code has expired. Please request a new one.'})
            elif verification.attempts >= 5:
                verification.delete()
                raise serializers.ValidationError({'code': 'Too many failed attempts. Please request a new code.'})

        verification.increment_attempts()
        attrs['verification'] = verification
        return attrs

    def save(self):
        user = self.context['request'].user
        verification = self.validated_data['verification']

        user.email = verification.email
        user.save(update_fields=['email'])

        verification.delete()
        return user