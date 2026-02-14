"""
Serializers for user authentication
Handles email, Google, and Facebook authentication with 2FA
"""
from rest_framework import serializers
from django.conf import settings
from django.core.mail import send_mail
from django.contrib.auth.hashers import make_password
from .models import VerificationCode, CustomUser, SocialAuthToken
import random
import requests
from datetime import timedelta
from django.utils import timezone


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user data responses"""

    full_name = serializers.CharField(source='get_full_name', read_only=True)

    class Meta:
        model = CustomUser
        fields = [
            'id',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'auth_provider',
            'is_active',
            'is_verified',
            'is_staff',
            'date_joined',
            'last_login'
        ]
        read_only_fields = ['id', 'date_joined', 'last_login', 'is_staff']


class RegisterRequestSerializer(serializers.Serializer):
    """Request verification code for registration"""

    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        required=False,
        min_length=8,
        style={'input_type': 'password'}
    )
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    auth_provider = serializers.ChoiceField(
        choices=['email', 'google', 'facebook'],
        default='email'
    )

    # For social auth
    access_token = serializers.CharField(required=False, write_only=True)
    social_id = serializers.CharField(required=False, write_only=True)

    def validate_email(self, value):
        """Check if email is already registered"""
        if CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "This email is already registered. Please login instead."
            )
        return value.lower()

    def validate(self, attrs):
        """Validate based on auth provider"""
        auth_provider = attrs.get('auth_provider', 'email')

        if auth_provider == 'email':
            if not attrs.get('password'):
                raise serializers.ValidationError({
                    'password': 'Password is required for email registration'
                })
        elif auth_provider in ['google', 'facebook']:
            if not attrs.get('access_token'):
                raise serializers.ValidationError({
                    'access_token': f'Access token is required for {auth_provider} registration'
                })

        return attrs

    def _verify_google_token(self, access_token):
        """Verify Google OAuth token"""
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
        except Exception as e:
            return None

    def _verify_facebook_token(self, access_token):
        """Verify Facebook OAuth token"""
        try:
            response = requests.get(
                'https://graph.facebook.com/me',
                params={
                    'fields': 'id,email,first_name,last_name',
                    'access_token': access_token
                },
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
        except Exception as e:
            return None

    def create(self, validated_data):
        """Generate and send verification code"""
        auth_provider = validated_data.get('auth_provider', 'email')
        email = validated_data['email']

        # Verify social auth tokens if applicable
        social_data = None
        if auth_provider == 'google':
            social_data = self._verify_google_token(validated_data['access_token'])
            if not social_data:
                raise serializers.ValidationError('Invalid Google token')

            # Verify email matches
            if social_data['email'].lower() != email.lower():
                raise serializers.ValidationError('Email mismatch with Google account')

        elif auth_provider == 'facebook':
            social_data = self._verify_facebook_token(validated_data['access_token'])
            if not social_data:
                raise serializers.ValidationError('Invalid Facebook token')

            # Verify email matches
            if social_data['email'].lower() != email.lower():
                raise serializers.ValidationError('Email mismatch with Facebook account')

        # Delete previous verification codes for this email
        VerificationCode.objects.filter(
            email=email,
            purpose=VerificationCode.PURPOSE_REGISTRATION
        ).delete()

        # Generate 6-digit code
        code = str(random.randint(100000, 999999))

        # Prepare verification code data
        verification_data = {
            'email': email,
            'code': code,
            'purpose': VerificationCode.PURPOSE_REGISTRATION,
            'auth_provider': auth_provider,
        }

        # Add password if email registration
        if auth_provider == 'email' and validated_data.get('password'):
            verification_data['password'] = make_password(validated_data['password'])

        # Add names from social auth or request
        if social_data:
            verification_data['first_name'] = social_data.get('first_name', '')
            verification_data['last_name'] = social_data.get('last_name', '')
            verification_data['social_id'] = social_data.get('social_id', '')
        else:
            verification_data['first_name'] = validated_data.get('first_name', '')
            verification_data['last_name'] = validated_data.get('last_name', '')

        # Create verification code
        verification = VerificationCode.objects.create(**verification_data)

        # Send verification code via email
        self._send_verification_email(email, code, auth_provider)

        return verification

    def _send_verification_email(self, email, code, provider):
        """Send verification code email"""
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
        """Validate verification code"""
        email = attrs['email'].lower()
        code = attrs['code']

        try:
            verification = VerificationCode.objects.get(
                email=email,
                code=code,
                purpose=VerificationCode.PURPOSE_REGISTRATION
            )
        except VerificationCode.DoesNotExist:
            raise serializers.ValidationError({
                'code': 'Invalid verification code or email'
            })

        # Check if code is valid
        if not verification.is_valid():
            if verification.is_expired():
                verification.delete()
                raise serializers.ValidationError({
                    'code': 'Verification code has expired. Please request a new one.'
                })
            elif verification.attempts >= 5:
                verification.delete()
                raise serializers.ValidationError({
                    'code': 'Too many failed attempts. Please request a new code.'
                })
            elif verification.is_used:
                raise serializers.ValidationError({
                    'code': 'This code has already been used.'
                })

        # Increment attempts
        verification.increment_attempts()

        attrs['verification'] = verification
        return attrs

    def create(self, validated_data):
        """Create user account after successful verification"""
        verification = validated_data['verification']

        # Double-check user doesn't exist
        if CustomUser.objects.filter(email=verification.email).exists():
            verification.delete()
            raise serializers.ValidationError('This email is already registered.')

        # Create user
        user = CustomUser.objects.create(
            email=verification.email,
            first_name=verification.first_name,
            last_name=verification.last_name,
            auth_provider=verification.auth_provider,
            social_id=verification.social_id,
            is_verified=True,
            is_active=True
        )

        # Set password if email registration
        if verification.password:
            user.password = verification.password
            user.save(update_fields=['password'])

        # Mark code as used and delete
        verification.is_used = True
        verification.save(update_fields=['is_used'])
        verification.delete()

        return user


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
        """Validate login credentials"""
        email = attrs.get('email', '').lower()
        password = attrs.get('password')
        auth_provider = attrs.get('auth_provider', 'email')

        # Check if user exists
        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            raise serializers.ValidationError({
                'email': 'No account found with this email.'
            })

        # Validate based on auth provider
        if auth_provider == 'email':
            if not password:
                raise serializers.ValidationError({
                    'password': 'Password is required'
                })

            if not user.check_password(password):
                raise serializers.ValidationError({
                    'password': 'Incorrect password'
                })

        # Check if account is active
        if not user.is_active:
            raise serializers.ValidationError('This account has been deactivated.')

        attrs['user'] = user
        return attrs


class ResendCodeSerializer(serializers.Serializer):
    """Resend verification code"""

    email = serializers.EmailField()
    purpose = serializers.ChoiceField(
        choices=['registration', 'login', 'password_reset'],
        default='registration'
    )

    def create(self, validated_data):
        """Regenerate and send new code"""
        email = validated_data['email'].lower()
        purpose = validated_data['purpose']

        # Delete old codes
        VerificationCode.objects.filter(email=email, purpose=purpose).delete()

        # Generate new code
        code = str(random.randint(100000, 999999))

        verification = VerificationCode.objects.create(
            email=email,
            code=code,
            purpose=purpose
        )

        # Send email
        send_mail(
            subject=f'Cebu Mini Hotel - New Verification Code',
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
