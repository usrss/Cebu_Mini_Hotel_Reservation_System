"""
Unit tests for authentication system
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from .models import VerificationCode
from django.core import mail

User = get_user_model()


class UserModelTests(TestCase):
    """Test CustomUser model"""

    def test_create_user(self):
        """Test creating a user with email"""
        user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.assertEqual(user.email, 'test@example.com')
        self.assertTrue(user.check_password('testpass123'))
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_superuser(self):
        """Test creating a superuser"""
        admin_user = User.objects.create_superuser(
            email='admin@example.com',
            password='admin123'
        )
        self.assertEqual(admin_user.email, 'admin@example.com')
        self.assertTrue(admin_user.is_active)
        self.assertTrue(admin_user.is_staff)
        self.assertTrue(admin_user.is_superuser)

    def test_user_email_normalization(self):
        """Test email normalization"""
        user = User.objects.create_user(
            email='TEST@EXAMPLE.COM',
            password='test123'
        )
        self.assertEqual(user.email, 'TEST@example.com')


class RegistrationTests(APITestCase):
    """Test user registration flow"""

    def setUp(self):
        self.client = APIClient()
        self.register_request_url = reverse('authentication:register-request')
        self.register_verify_url = reverse('authentication:register-verify')

    def test_register_request_email_auth(self):
        """Test registration request with email"""
        data = {
            'email': 'newuser@example.com',
            'password': 'securepass123',
            'first_name': 'John',
            'last_name': 'Doe',
            'auth_provider': 'email'
        }
        response = self.client.post(self.register_request_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)

        # Check that verification code was created
        self.assertTrue(
            VerificationCode.objects.filter(email='newuser@example.com').exists()
        )

        # Check that email was sent
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('verification code', mail.outbox[0].subject.lower())

    def test_register_request_duplicate_email(self):
        """Test registration with already registered email"""
        # Create existing user
        User.objects.create_user(
            email='existing@example.com',
            password='pass123'
        )

        data = {
            'email': 'existing@example.com',
            'password': 'newpass123',
            'auth_provider': 'email'
        }
        response = self.client.post(self.register_request_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_verify_success(self):
        """Test successful registration verification"""
        # Create verification code
        verification = VerificationCode.objects.create(
            email='test@example.com',
            code='123456',
            purpose=VerificationCode.PURPOSE_REGISTRATION,
            password='hashed_password',
            first_name='John',
            last_name='Doe'
        )

        data = {
            'email': 'test@example.com',
            'code': '123456'
        }
        response = self.client.post(self.register_verify_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        self.assertIn('tokens', response.data)

        # Check user was created
        self.assertTrue(User.objects.filter(email='test@example.com').exists())

        # Check verification code was deleted
        self.assertFalse(
            VerificationCode.objects.filter(email='test@example.com').exists()
        )

    def test_register_verify_invalid_code(self):
        """Test verification with invalid code"""
        data = {
            'email': 'test@example.com',
            'code': '999999'
        }
        response = self.client.post(self.register_verify_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_verify_expired_code(self):
        """Test verification with expired code"""
        from django.utils import timezone
        from datetime import timedelta

        # Create expired verification code
        verification = VerificationCode.objects.create(
            email='test@example.com',
            code='123456',
            purpose=VerificationCode.PURPOSE_REGISTRATION,
            expires_at=timezone.now() - timedelta(minutes=10)
        )

        data = {
            'email': 'test@example.com',
            'code': '123456'
        }
        response = self.client.post(self.register_verify_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTests(APITestCase):
    """Test user login flow"""

    def setUp(self):
        self.client = APIClient()
        self.login_url = reverse('authentication:login')

        # Create test user
        self.user = User.objects.create_user(
            email='testuser@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            is_verified=True
        )

    def test_login_success(self):
        """Test successful login"""
        data = {
            'email': 'testuser@example.com',
            'password': 'testpass123',
            'auth_provider': 'email'
        }
        response = self.client.post(self.login_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('tokens', response.data)
        self.assertIn('user', response.data)
        self.assertIn('access', response.data['tokens'])
        self.assertIn('refresh', response.data['tokens'])

    def test_login_wrong_password(self):
        """Test login with wrong password"""
        data = {
            'email': 'testuser@example.com',
            'password': 'wrongpassword',
            'auth_provider': 'email'
        }
        response = self.client.post(self.login_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_nonexistent_user(self):
        """Test login with non-existent user"""
        data = {
            'email': 'nonexistent@example.com',
            'password': 'testpass123',
            'auth_provider': 'email'
        }
        response = self.client.post(self.login_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AuthenticatedEndpointTests(APITestCase):
    """Test authenticated endpoints"""

    def setUp(self):
        self.client = APIClient()

        # Create and authenticate user
        self.user = User.objects.create_user(
            email='testuser@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )

        # Get tokens
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(self.user)
        self.access_token = str(refresh.access_token)

        # Set authentication header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_get_current_user(self):
        """Test getting current user info"""
        url = reverse('authentication:current-user')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'testuser@example.com')

    def test_update_profile(self):
        """Test updating user profile"""
        url = reverse('authentication:update-profile')
        data = {
            'first_name': 'Updated',
            'last_name': 'Name'
        }
        response = self.client.patch(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['first_name'], 'Updated')

        # Verify in database
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Updated')

    def test_unauthenticated_access(self):
        """Test accessing protected endpoint without authentication"""
        self.client.credentials()  # Remove credentials
        url = reverse('authentication:current-user')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class VerificationCodeModelTests(TestCase):
    """Test VerificationCode model"""

    def test_code_expiration(self):
        """Test verification code expiration"""
        from django.utils import timezone
        from datetime import timedelta

        # Create code that expires in past
        code = VerificationCode.objects.create(
            email='test@example.com',
            code='123456',
            purpose=VerificationCode.PURPOSE_REGISTRATION,
            expires_at=timezone.now() - timedelta(minutes=1)
        )

        self.assertTrue(code.is_expired())

    def test_code_validity(self):
        """Test verification code validity"""
        code = VerificationCode.objects.create(
            email='test@example.com',
            code='123456',
            purpose=VerificationCode.PURPOSE_REGISTRATION
        )

        self.assertTrue(code.is_valid())

        # Test after max attempts
        code.attempts = 5
        code.save()
        self.assertFalse(code.is_valid())
