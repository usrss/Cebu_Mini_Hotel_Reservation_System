from rest_framework import serializers
from django.conf import settings
from django.core.mail import send_mail
from .models import RegistrationCode, CustomUser
import random

# User serializer for responses
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ['id', 'email', 'is_active', 'is_staff']

# Request verification code
class RegisterRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, required=False)  # optional for Google

    def create(self, validated_data):
        # Delete previous temporary codes
        RegistrationCode.objects.filter(email=validated_data["email"]).delete()

        # Generate 6-digit code
        code = str(random.randint(100000, 999999))

        reg = RegistrationCode.objects.create(
            email=validated_data["email"],
            password=validated_data.get("password", ""),
            code=code
        )

        # Send code via email
        send_mail(
            subject="Your Cebu Mini Hotel Verification Code",
            message=f"Your verification code is: {code} (expires in 5 mins)",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[validated_data["email"]],
            fail_silently=False,
        )

        return reg

# Verify code and create user
class RegisterVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        try:
            reg = RegistrationCode.objects.get(email=attrs["email"], code=attrs["code"])
        except RegistrationCode.DoesNotExist:
            raise serializers.ValidationError("Invalid email or code.")

        if reg.is_expired():
            reg.delete()
            raise serializers.ValidationError("Code expired. Please request a new one.")

        attrs["reg"] = reg
        return attrs

    def create(self, validated_data):
        reg = validated_data["reg"]

        if CustomUser.objects.filter(email=reg.email).exists():
            raise serializers.ValidationError("This email is already registered.")

        # Create user
        user = CustomUser.objects.create_user(
            email=reg.email,
            password=reg.password or CustomUser.objects.make_random_password()
        )

        reg.delete()  # delete temp code
        return user
