"""
admin_panel/tests.py

Test coverage for:
  1. Guest Management   — list, detail, block/unblock, booking history
  2. Payment Management — list, detail, confirm, refund, revenue summary
  3. Review Management  — list, detail, visibility toggle, stats

All tests use Django's TestCase + DRF's APIClient.
Fixtures are created inline — no external fixtures required.

Run:
    python manage.py test admin_panel
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bookings.models import Booking, BookingStatus
from payments.models import Payment, PaymentMethod, PaymentProvider, PaymentStatus, Refund
from rooms.models import Room, RoomReview, RoomStatus, RoomType
from staff.models import StaffProfile, StaffRole

User = get_user_model()


# ─── Base test case ────────────────────────────────────────────────────────────

class AdminPanelTestBase(TestCase):
    """
    Creates the common fixtures used by all test classes:
      - admin_user      : StaffProfile(role=ADMIN),  is_staff=True
      - manager_user    : StaffProfile(role=MANAGER), is_staff=True
      - receptionist    : StaffProfile(role=RECEPTIONIST), is_staff=True
      - front_desk      : StaffProfile(role=FRONT_DESK), is_staff=True
      - housekeeping    : StaffProfile(role=HOUSEKEEPING), is_staff=True
      - guest_user      : regular guest, is_staff=False
      - guest_user2     : second guest for isolation tests
      - room            : a standard room
      - booking         : guest_user's CONFIRMED booking on room
      - payment         : PAID payment for booking
    """

    def setUp(self):
        self.client = APIClient()

        # ── Staff users ────────────────────────────────────────────────────────
        self.admin_user = self._make_staff("admin@hotel.com", StaffRole.ADMIN)
        self.manager_user = self._make_staff("manager@hotel.com", StaffRole.MANAGER)
        self.receptionist = self._make_staff("receptionist@hotel.com", StaffRole.RECEPTIONIST)
        self.front_desk = self._make_staff("frontdesk@hotel.com", StaffRole.FRONT_DESK)
        self.housekeeping = self._make_staff("housekeeping@hotel.com", StaffRole.HOUSEKEEPING)

        # ── Guest users ────────────────────────────────────────────────────────
        self.guest_user = User.objects.create_user(
            email="guest@example.com",
            password="GuestPass1!",
            first_name="John",
            last_name="Doe",
        )
        self.guest_user2 = User.objects.create_user(
            email="guest2@example.com",
            password="GuestPass1!",
            first_name="Jane",
            last_name="Smith",
        )

        # ── Room ───────────────────────────────────────────────────────────────
        self.room = Room.objects.create(
            room_number="101",
            room_type=RoomType.STANDARD,
            price_per_night=Decimal("1500.00"),
            status=RoomStatus.AVAILABLE,
            capacity=2,
            max_adults=2,
            max_children=0,
        )

        # ── Booking ────────────────────────────────────────────────────────────
        self.booking = Booking.objects.create(
            user=self.guest_user,
            room=self.room,
            check_in=timezone.now().date() + timezone.timedelta(days=5),
            check_out=timezone.now().date() + timezone.timedelta(days=7),
            nights=2,
            guests_count=2,
            status=BookingStatus.CONFIRMED,
            total_price=Decimal("3000.00"),
            room_price_snapshot=Decimal("1500.00"),
            subtotal=Decimal("3000.00"),
            full_name="John Doe",
            email="guest@example.com",
            phone="09171234567",
            reference_number="CMH-2026-000001",
        )

        # ── Payment ────────────────────────────────────────────────────────────
        self.payment = Payment.objects.create(
            booking=self.booking,
            user=self.guest_user,
            amount=Decimal("3000.00"),
            status=PaymentStatus.PAID,
            provider=PaymentProvider.MANUAL,
            payment_method=PaymentMethod.CASH,
            paid_at=timezone.now(),
            receipt_number="RCP-2026-ABCDEF",
        )

        # ── Review ─────────────────────────────────────────────────────────────
        self.review = RoomReview.objects.create(
            room=self.room,
            booking=self.booking,
            guest=self.guest_user,
            rating=5,
            review_text="Excellent stay!",
            is_visible=True,
            is_verified=True,
        )

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _make_staff(self, email, role):
        user = User.objects.create_user(
            email=email,
            password="StaffPass1!",
            is_staff=True,
        )
        StaffProfile.objects.create(user=user, role=role, is_active=True)
        return user

    def _auth(self, user):
        """Attach a JWT access token for the given user."""
        token = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

    def _unauth(self):
        self.client.credentials()


# ═══════════════════════════════════════════════════════════════════════════════
# 1. GUEST MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class GuestListViewTests(AdminPanelTestBase):

    URL = "/api/admin/guests/"

    def test_admin_can_list_guests(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.data.get("results", r.data) if isinstance(r.data, dict) else r.data
        emails = [g["email"] for g in data]
        self.assertIn("guest@example.com", emails)

    def test_manager_can_list_guests(self):
        self._auth(self.manager_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_receptionist_can_list_guests(self):
        self._auth(self.receptionist)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_front_desk_can_list_guests(self):
        self._auth(self.front_desk)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_housekeeping_cannot_list_guests(self):
        self._auth(self.housekeeping)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_list_guests(self):
        self._unauth()
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_staff_users_excluded_from_guest_list(self):
        """Staff members must never appear in the guest list."""
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.data.get("results", r.data) if isinstance(r.data, dict) else r.data
        emails = [g["email"] for g in data]
        self.assertNotIn("admin@hotel.com", emails)
        self.assertNotIn("manager@hotel.com", emails)

    def test_search_by_email(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL, {"search": "guest@example"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.data.get("results", r.data) if isinstance(r.data, dict) else r.data
        self.assertTrue(len(data) >= 1)


class GuestDetailViewTests(AdminPanelTestBase):

    def _url(self, pk):
        return f"/api/admin/guests/{pk}/"

    def test_admin_can_view_guest_detail(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(self.guest_user.pk))
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["email"], "guest@example.com")

    def test_detail_includes_booking_count(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(self.guest_user.pk))
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIn("booking_count", r.data)
        self.assertEqual(r.data["booking_count"], 1)

    def test_housekeeping_cannot_view_detail(self):
        self._auth(self.housekeeping)
        r = self.client.get(self._url(self.guest_user.pk))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_404_for_nonexistent_guest(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(99999))
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_view_staff_via_guest_detail(self):
        """Staff accounts must not be accessible via the guest detail endpoint."""
        self._auth(self.admin_user)
        r = self.client.get(self._url(self.manager_user.pk))
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)


class GuestBlockViewTests(AdminPanelTestBase):

    def _url(self, pk):
        return f"/api/admin/guests/{pk}/block/"

    def test_admin_can_block_guest(self):
        self._auth(self.admin_user)
        r = self.client.patch(self._url(self.guest_user.pk), {"is_active": False})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.guest_user.refresh_from_db()
        self.assertFalse(self.guest_user.is_active)

    def test_admin_can_unblock_guest(self):
        self.guest_user.is_active = False
        self.guest_user.save()
        self._auth(self.admin_user)
        r = self.client.patch(self._url(self.guest_user.pk), {"is_active": True})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.guest_user.refresh_from_db()
        self.assertTrue(self.guest_user.is_active)

    def test_manager_can_block_guest(self):
        self._auth(self.manager_user)
        r = self.client.patch(self._url(self.guest_user2.pk), {"is_active": False})
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_receptionist_cannot_block_guest(self):
        self._auth(self.receptionist)
        r = self.client.patch(self._url(self.guest_user.pk), {"is_active": False})
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_front_desk_cannot_block_guest(self):
        self._auth(self.front_desk)
        r = self.client.patch(self._url(self.guest_user.pk), {"is_active": False})
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)


class GuestBookingHistoryViewTests(AdminPanelTestBase):

    def _url(self, pk):
        return f"/api/admin/guests/{pk}/bookings/"

    def test_admin_can_view_guest_bookings(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(self.guest_user.pk))
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.data.get("results", r.data) if isinstance(r.data, dict) else r.data
        self.assertEqual(len(data), 1)

    def test_returns_404_for_nonexistent_guest(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(99999))
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_housekeeping_cannot_view_booking_history(self):
        self._auth(self.housekeeping)
        r = self.client.get(self._url(self.guest_user.pk))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. PAYMENT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class PaymentListViewTests(AdminPanelTestBase):

    URL = "/api/admin/payments/"

    def test_admin_can_list_payments(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_manager_can_list_payments(self):
        self._auth(self.manager_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_front_desk_can_list_payments(self):
        self._auth(self.front_desk)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_receptionist_cannot_list_payments(self):
        self._auth(self.receptionist)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_housekeeping_cannot_list_payments(self):
        self._auth(self.housekeeping)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_list_payments(self):
        self._unauth()
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_payment_list_contains_correct_fields(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.data.get("results", r.data) if isinstance(r.data, dict) else r.data
        self.assertTrue(len(data) >= 1)
        payment_data = data[0]
        # Verify correct field names (checkout_session_id NOT session_id)
        self.assertIn("checkout_session_id", payment_data)
        self.assertNotIn("session_id", payment_data)
        # Verify refund fields come from Refund model (not Payment)
        self.assertIn("refunds", payment_data)
        self.assertIn("refund_count", payment_data)
        self.assertIn("total_refunded", payment_data)
        self.assertNotIn("refund_status", payment_data)
        self.assertNotIn("refund_amount", payment_data)
        self.assertNotIn("refunded_at", payment_data)

    def test_filter_by_status(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL, {"status": "paid"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)


class PaymentDetailViewTests(AdminPanelTestBase):

    def _url(self, pk):
        return f"/api/admin/payments/{pk}/"

    def test_admin_can_view_payment_detail(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(self.payment.pk))
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["receipt_number"], "RCP-2026-ABCDEF")

    def test_404_for_nonexistent_payment(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(99999))
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)


class PaymentConfirmViewTests(AdminPanelTestBase):

    def _url(self, pk):
        return f"/api/admin/payments/{pk}/confirm/"

    def setUp(self):
        super().setUp()
        # Create a second booking + pending payment for confirm tests
        self.booking2 = Booking.objects.create(
            user=self.guest_user2,
            room=self.room,
            check_in=timezone.now().date() + timezone.timedelta(days=10),
            check_out=timezone.now().date() + timezone.timedelta(days=12),
            nights=2,
            guests_count=2,
            status=BookingStatus.CONFIRMED,
            total_price=Decimal("3000.00"),
            room_price_snapshot=Decimal("1500.00"),
            subtotal=Decimal("3000.00"),
            full_name="Jane Smith",
            email="guest2@example.com",
            phone="09179876543",
            reference_number="CMH-2026-000002",
        )
        self.pending_payment = Payment.objects.create(
            booking=self.booking2,
            user=self.guest_user2,
            amount=Decimal("3000.00"),
            status=PaymentStatus.PENDING,
            provider=PaymentProvider.MANUAL,
            payment_method=PaymentMethod.CASH,
        )

    def test_admin_can_confirm_pending_payment(self):
        self._auth(self.admin_user)
        r = self.client.post(self._url(self.pending_payment.pk), {"notes": "Cash received"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.pending_payment.refresh_from_db()
        self.assertEqual(self.pending_payment.status, PaymentStatus.PAID)
        self.assertIsNotNone(self.pending_payment.paid_at)

    def test_front_desk_can_confirm_payment(self):
        self._auth(self.front_desk)
        r = self.client.post(self._url(self.pending_payment.pk), {})
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_receptionist_cannot_confirm_payment(self):
        self._auth(self.receptionist)
        r = self.client.post(self._url(self.pending_payment.pk), {})
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_confirm_already_paid_payment(self):
        self._auth(self.admin_user)
        # self.payment is already PAID
        r = self.client.post(self._url(self.payment.pk), {})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)


class PaymentRefundViewTests(AdminPanelTestBase):

    def _url(self, pk):
        return f"/api/admin/payments/{pk}/refund/"

    def test_admin_can_initiate_refund_for_manual_payment(self):
        """Manual/cash payments need no provider call — refund should complete immediately."""
        self._auth(self.admin_user)
        r = self.client.post(self._url(self.payment.pk), {
            "refund_amount": "3000.00",
            "reason": "Guest requested cancellation",
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        # Verify Refund record was created
        self.assertTrue(
            Refund.objects.filter(
                payment=self.payment,
                status=Refund.RefundStatus.COMPLETED,
            ).exists()
        )
        # Verify Payment.status flipped to REFUNDED
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, PaymentStatus.REFUNDED)

    def test_partial_refund_does_not_flip_payment_to_refunded(self):
        self._auth(self.admin_user)
        r = self.client.post(self._url(self.payment.pk), {
            "refund_amount": "1000.00",
            "reason": "Partial refund",
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        # Partial refund — payment is still PAID
        self.assertEqual(self.payment.status, PaymentStatus.PAID)

    def test_manager_can_initiate_refund(self):
        self._auth(self.manager_user)
        r = self.client.post(self._url(self.payment.pk), {"reason": "Test"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_front_desk_cannot_initiate_refund(self):
        """Front Desk can confirm payments but cannot issue refunds."""
        self._auth(self.front_desk)
        r = self.client.post(self._url(self.payment.pk), {})
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_receptionist_cannot_initiate_refund(self):
        self._auth(self.receptionist)
        r = self.client.post(self._url(self.payment.pk), {})
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_refund_unpaid_payment(self):
        pending = Payment.objects.create(
            booking=self.booking,
            amount=Decimal("500.00"),
            status=PaymentStatus.PENDING,
            provider=PaymentProvider.MANUAL,
            payment_method=PaymentMethod.CASH,
        )
        self._auth(self.admin_user)
        r = self.client.post(self._url(pending.pk), {})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_refund_more_than_payment_amount(self):
        self._auth(self.admin_user)
        r = self.client.post(self._url(self.payment.pk), {
            "refund_amount": "9999.00",
        })
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_double_refund_fully_refunded_payment(self):
        # Create a completed refund for the full amount — payment stays PAID
        # so the amount check (not status check) catches the double refund
        Refund.objects.create(
            payment=self.payment,
            amount=self.payment.amount,
            status=Refund.RefundStatus.COMPLETED,
            initiated_by=self.admin_user,
        )
        # Do NOT flip payment.status — let the serializer's remaining-amount
        # check catch it: remaining = 3000 - 3000 = 0 → validation error
        self._auth(self.admin_user)
        r = self.client.post(self._url(self.payment.pk), {})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)


class PaymentRevenueSummaryViewTests(AdminPanelTestBase):

    URL = "/api/admin/payments/revenue/"

    def test_admin_can_view_revenue_summary(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIn("total_revenue", r.data)
        self.assertIn("net_revenue", r.data)
        self.assertIn("trend", r.data)
        self.assertIn("pending_count", r.data)

    def test_manager_can_view_revenue_summary(self):
        self._auth(self.manager_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_front_desk_cannot_view_revenue_summary(self):
        self._auth(self.front_desk)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_period_param_today(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL, {"period": "today"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["period"], "today")

    def test_period_param_year(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL, {"period": "year", "group_by": "month"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_revenue_counts_paid_payment(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL, {"period": "year"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(float(r.data["total_revenue"]), 3000.0)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. REVIEW MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class ReviewListViewTests(AdminPanelTestBase):

    URL = "/api/admin/reviews/"

    def test_admin_can_list_reviews(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_manager_can_list_reviews(self):
        self._auth(self.manager_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_receptionist_cannot_list_reviews(self):
        self._auth(self.receptionist)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_front_desk_cannot_list_reviews(self):
        self._auth(self.front_desk)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_list_reviews(self):
        self._unauth()
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_review_list_contains_correct_fields(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.data.get("results", r.data) if isinstance(r.data, dict) else r.data
        self.assertTrue(len(data) >= 1)
        review_data = data[0]
        self.assertIn("rating", review_data)
        self.assertIn("is_visible", review_data)
        self.assertIn("guest_email", review_data)
        self.assertIn("room_number", review_data)

    def test_filter_by_is_visible(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL, {"is_visible": "true"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_filter_by_rating(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL, {"rating": 5})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.data.get("results", r.data) if isinstance(r.data, dict) else r.data
        for review in data:
            self.assertEqual(review["rating"], 5)


class ReviewDetailViewTests(AdminPanelTestBase):

    def _url(self, pk):
        return f"/api/admin/reviews/{pk}/"

    def test_admin_can_view_review_detail(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(self.review.pk))
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["review_text"], "Excellent stay!")

    def test_404_for_nonexistent_review(self):
        self._auth(self.admin_user)
        r = self.client.get(self._url(99999))
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)


class ReviewVisibilityViewTests(AdminPanelTestBase):

    def _url(self, pk):
        return f"/api/admin/reviews/{pk}/visibility/"

    def test_admin_can_hide_review(self):
        self._auth(self.admin_user)
        r = self.client.patch(self._url(self.review.pk), {
            "is_visible": False,
            "reason": "Spam content",
        }, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.review.refresh_from_db()
        self.assertFalse(self.review.is_visible)

    def test_admin_can_show_hidden_review(self):
        self.review.is_visible = False
        self.review.save()
        self._auth(self.admin_user)
        r = self.client.patch(self._url(self.review.pk), {
            "is_visible": True,
        }, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.review.refresh_from_db()
        self.assertTrue(self.review.is_visible)

    def test_manager_can_hide_review(self):
        self._auth(self.manager_user)
        r = self.client.patch(self._url(self.review.pk), {
            "is_visible": False,
        }, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_receptionist_cannot_toggle_visibility(self):
        self._auth(self.receptionist)
        r = self.client.patch(self._url(self.review.pk), {
            "is_visible": False,
        }, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_404_for_nonexistent_review(self):
        self._auth(self.admin_user)
        r = self.client.patch(self._url(99999), {"is_visible": False}, format="json")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)


class ReviewStatsViewTests(AdminPanelTestBase):

    URL = "/api/admin/reviews/stats/"

    def test_admin_can_view_stats(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIn("avg_rating", r.data)
        self.assertIn("total_reviews", r.data)
        self.assertIn("hidden_count", r.data)
        self.assertIn("rating_breakdown", r.data)
        self.assertIn("top_rooms", r.data)
        self.assertIn("trend", r.data)

    def test_manager_can_view_stats(self):
        self._auth(self.manager_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_front_desk_cannot_view_stats(self):
        self._auth(self.front_desk)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_stats_reflect_actual_reviews(self):
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["total_reviews"], 1)
        self.assertEqual(float(r.data["avg_rating"]), 5.0)
        self.assertEqual(r.data["rating_breakdown"]["5"], 1)
        self.assertEqual(r.data["hidden_count"], 0)

    def test_hidden_reviews_counted_separately(self):
        self.review.is_visible = False
        self.review.save()
        self._auth(self.admin_user)
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        # Hidden review excluded from avg but counted in hidden_count
        self.assertEqual(r.data["hidden_count"], 1)
        self.assertEqual(r.data["total_reviews"], 0)