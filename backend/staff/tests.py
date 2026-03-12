"""
staff/tests.py

Unit test placeholders for all Staff Management APIs.
Run with: python manage.py test staff

All test classes inherit from rest_framework.test.APITestCase.
Fixtures / setUp methods create the minimum data needed.

TODO: Fill in assertion bodies as the project matures.
"""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    StaffProfile,
    StaffRole,
    CleaningTask,
    CleaningStatus,
    MaintenanceTask,
    MaintenanceStatus,
    Shift,
)

User = get_user_model()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_user(email, password="TestPass123", **kwargs):
    return User.objects.create_user(email=email, password=password, is_staff=True, **kwargs)


def make_staff(email, role=StaffRole.RECEPTIONIST, **kwargs):
    user    = make_user(email)
    profile = StaffProfile.objects.create(user=user, role=role, **kwargs)
    return user, profile


# ═══════════════════════════════════════════════════════════════════════════════
# ── Staff Member Management ───────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class StaffCreateTests(APITestCase):
    """POST /api/staff/members/ — Admin creates staff."""

    def setUp(self):
        self.admin_user, self.admin_profile = make_staff("admin@hotel.com", StaffRole.ADMIN)
        self.client.force_authenticate(user=self.admin_user)
        self.url = "/api/staff/members/"

    def test_admin_can_create_staff(self):
        payload = {
            "email":    "newstaff@hotel.com",
            "password": "SecurePass1!",
            "role":     StaffRole.HOUSEKEEPING,
        }
        response = self.client.post(self.url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], StaffRole.HOUSEKEEPING)

    def test_duplicate_email_rejected(self):
        make_staff("existing@hotel.com")
        payload = {"email": "existing@hotel.com", "password": "Pass1234!", "role": StaffRole.FRONT_DESK}
        response = self.client.post(self.url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_manager_cannot_create_staff(self):
        mgr_user, _ = make_staff("mgr@hotel.com", StaffRole.MANAGER)
        self.client.force_authenticate(user=mgr_user)
        payload = {"email": "new@hotel.com", "password": "Pass1234!", "role": StaffRole.FRONT_DESK}
        response = self.client.post(self.url, payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class StaffRoleChangeTests(APITestCase):
    """POST /api/staff/members/<pk>/promote/"""

    def setUp(self):
        self.admin_user, self.admin_profile = make_staff("admin2@hotel.com", StaffRole.ADMIN)
        self.target_user, self.target       = make_staff("target@hotel.com", StaffRole.RECEPTIONIST)
        self.client.force_authenticate(user=self.admin_user)

    def test_promote_staff(self):
        url      = f"/api/staff/members/{self.target.pk}/promote/"
        response = self.client.post(url, {"role": StaffRole.MANAGER})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertEqual(self.target.role, StaffRole.MANAGER)

    def test_admin_cannot_change_own_role(self):
        url      = f"/api/staff/members/{self.admin_profile.pk}/promote/"
        response = self.client.post(url, {"role": StaffRole.MANAGER})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class StaffTempRoleTests(APITestCase):
    """POST/DELETE /api/staff/members/<pk>/temp-role/"""

    def setUp(self):
        self.admin_user, _ = make_staff("admin3@hotel.com", StaffRole.ADMIN)
        self.target_user, self.target = make_staff("staff3@hotel.com", StaffRole.HOUSEKEEPING)
        self.client.force_authenticate(user=self.admin_user)
        self.url = f"/api/staff/members/{self.target.pk}/temp-role/"

    def test_assign_temp_role(self):
        future   = (timezone.now() + timezone.timedelta(hours=8)).isoformat()
        response = self.client.post(self.url, {"temp_role": StaffRole.RECEPTIONIST, "expires_at": future})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_expires_at_in_past_rejected(self):
        past     = (timezone.now() - timezone.timedelta(hours=1)).isoformat()
        response = self.client.post(self.url, {"temp_role": StaffRole.RECEPTIONIST, "expires_at": past})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_remove_temp_role(self):
        self.target.temp_role           = StaffRole.RECEPTIONIST
        self.target.temp_role_expires_at = timezone.now() + timezone.timedelta(hours=4)
        self.target.save()
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertIsNone(self.target.temp_role)


class StaffDeactivateTests(APITestCase):
    """POST /api/staff/members/<pk>/deactivate/"""

    def setUp(self):
        self.admin_user, _ = make_staff("admin4@hotel.com", StaffRole.ADMIN)
        self.target_user, self.target = make_staff("target4@hotel.com", StaffRole.FRONT_DESK)
        self.client.force_authenticate(user=self.admin_user)

    def test_deactivate_staff(self):
        url      = f"/api/staff/members/{self.target.pk}/deactivate/"
        response = self.client.post(url, {"reason": "Contract ended."})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)


# ═══════════════════════════════════════════════════════════════════════════════
# ── Staff Monitoring ──────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class StaffMonitoringTests(APITestCase):
    """GET /api/staff/monitoring/"""

    def setUp(self):
        self.admin_user, _ = make_staff("admin5@hotel.com", StaffRole.ADMIN)
        make_staff("hk1@hotel.com", StaffRole.HOUSEKEEPING)
        make_staff("hk2@hotel.com", StaffRole.HOUSEKEEPING)
        self.client.force_authenticate(user=self.admin_user)

    def test_monitoring_returns_all_staff(self):
        response = self.client.get("/api/staff/monitoring/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("by_role", response.data)
        self.assertIn("total_active", response.data)

    def test_guest_cannot_access_monitoring(self):
        guest = User.objects.create_user(email="guest@example.com", password="Pass1234")
        self.client.force_authenticate(user=guest)
        response = self.client.get("/api/staff/monitoring/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class StaffPresenceTests(APITestCase):
    """POST /api/staff/presence/"""

    def setUp(self):
        self.user, self.profile = make_staff("rec@hotel.com", StaffRole.RECEPTIONIST)
        self.client.force_authenticate(user=self.user)

    def test_update_presence_to_idle(self):
        response = self.client.post("/api/staff/presence/", {"status": "idle", "current_task": "On break"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "idle")

    def test_invalid_status_rejected(self):
        response = self.client.post("/api/staff/presence/", {"status": "busy"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ═══════════════════════════════════════════════════════════════════════════════
# ── Cleaning Tasks ────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class CleaningTaskTests(APITestCase):
    """Cleaning task CRUD and status transitions."""

    def setUp(self):
        from rooms.models import Room, RoomType, RoomStatus
        self.admin_user, _ = make_staff("admin6@hotel.com", StaffRole.ADMIN)
        self.hk_user, self.hk_profile = make_staff("hk@hotel.com", StaffRole.HOUSEKEEPING)
        self.room = Room.objects.create(
            room_number="101", room_type=RoomType.STANDARD,
            price_per_night=1200, capacity=2, status=RoomStatus.CLEANING,
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_admin_creates_cleaning_task(self):
        response = self.client.post("/api/staff/cleaning/", {
            "room": self.room.pk,
            "assigned_to": self.hk_profile.pk,
            "priority": 1,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_cleaning_status_transition_dirty_to_cleaning(self):
        task = CleaningTask.objects.create(
            room=self.room, assigned_to=self.hk_profile, status=CleaningStatus.DIRTY
        )
        self.client.force_authenticate(user=self.hk_user)
        url      = f"/api/staff/cleaning/{task.pk}/status/"
        response = self.client.patch(url, {"status": CleaningStatus.CLEANING}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status, CleaningStatus.CLEANING)

    def test_invalid_cleaning_transition_clean_to_dirty(self):
        task = CleaningTask.objects.create(
            room=self.room, assigned_to=self.hk_profile, status=CleaningStatus.CLEAN
        )
        url      = f"/api/staff/cleaning/{task.pk}/status/"
        response = self.client.patch(url, {"status": CleaningStatus.DIRTY}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_housekeeping_cannot_see_other_tasks(self):
        _, other_hk = make_staff("hk2b@hotel.com", StaffRole.HOUSEKEEPING)
        CleaningTask.objects.create(room=self.room, assigned_to=other_hk, status=CleaningStatus.DIRTY)
        self.client.force_authenticate(user=self.hk_user)
        response = self.client.get("/api/staff/cleaning/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)  # own tasks only — list response, no pagination


# ═══════════════════════════════════════════════════════════════════════════════
# ── Maintenance Tasks ─────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class MaintenanceTaskTests(APITestCase):
    """Maintenance task CRUD and status transitions."""

    def setUp(self):
        from rooms.models import Room, RoomType, RoomStatus
        self.admin_user, _ = make_staff("admin7@hotel.com", StaffRole.ADMIN)
        self.mt_user, self.mt_profile = make_staff("mt@hotel.com", StaffRole.MAINTENANCE)
        self.room = Room.objects.create(
            room_number="202", room_type=RoomType.DELUXE,
            price_per_night=2000, capacity=2, status=RoomStatus.AVAILABLE,
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_create_maintenance_task(self):
        response = self.client.post("/api/staff/maintenance/", {
            "room":        self.room.pk,
            "assigned_to": self.mt_profile.pk,
            "title":       "Broken AC",
            "description": "The AC unit stopped working.",
            "priority":    1,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_status_transition_pending_to_in_progress(self):
        task = MaintenanceTask.objects.create(
            room=self.room, assigned_to=self.mt_profile,
            title="Fix sink", description="Leaking sink", status=MaintenanceStatus.PENDING,
        )
        self.client.force_authenticate(user=self.mt_user)
        url      = f"/api/staff/maintenance/{task.pk}/status/"
        response = self.client.patch(url, {"status": MaintenanceStatus.IN_PROGRESS}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invalid_transition_completed_to_in_progress(self):
        task = MaintenanceTask.objects.create(
            room=self.room, assigned_to=self.mt_profile,
            title="Old task", description="Done already", status=MaintenanceStatus.COMPLETED,
        )
        url      = f"/api/staff/maintenance/{task.pk}/status/"
        response = self.client.patch(url, {"status": MaintenanceStatus.IN_PROGRESS}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ═══════════════════════════════════════════════════════════════════════════════
# ── Reports ───────────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class ReportTests(APITestCase):
    """GET /api/staff/reports/?type=..."""

    def setUp(self):
        self.admin_user, _ = make_staff("admin8@hotel.com", StaffRole.ADMIN)
        self.client.force_authenticate(user=self.admin_user)

    def test_booking_report_daily(self):
        response = self.client.get("/api/staff/reports/?type=bookings&period=daily")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("data", response.data)

    def test_revenue_report_monthly(self):
        response = self.client.get("/api/staff/reports/?type=revenue&period=monthly")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_occupancy_report(self):
        response = self.client.get("/api/staff/reports/?type=occupancy&period=weekly")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_guest_report(self):
        response = self.client.get("/api/staff/reports/?type=guests&period=monthly")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_staff_performance_report(self):
        response = self.client.get("/api/staff/reports/?type=staff&period=monthly")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unknown_report_type_rejected(self):
        response = self.client.get("/api/staff/reports/?type=unknown")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_receptionist_cannot_access_reports(self):
        rec_user, _ = make_staff("rec2@hotel.com", StaffRole.RECEPTIONIST)
        self.client.force_authenticate(user=rec_user)
        response = self.client.get("/api/staff/reports/?type=bookings&period=daily")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_csv_export(self):
        response = self.client.get("/api/staff/reports/?type=bookings&period=daily&export=csv")
        # Either CSV download or empty (no bookings) — not a 4xx/5xx
        self.assertIn(response.status_code, [status.HTTP_200_OK])


# ═══════════════════════════════════════════════════════════════════════════════
# ── Dashboard ─────────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class DashboardTests(APITestCase):
    """GET /api/staff/dashboard/"""

    def setUp(self):
        self.admin_user, _ = make_staff("admin9@hotel.com", StaffRole.ADMIN)
        self.client.force_authenticate(user=self.admin_user)

    def test_dashboard_returns_expected_keys(self):
        response = self.client.get("/api/staff/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in ["rooms", "bookings", "tasks", "staff", "revenue_today", "recent_activity"]:
            self.assertIn(key, response.data)

    def test_receptionist_cannot_access_dashboard(self):
        rec_user, _ = make_staff("rec3@hotel.com", StaffRole.RECEPTIONIST)
        self.client.force_authenticate(user=rec_user)
        response = self.client.get("/api/staff/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)