"""
staff/views.py

All Staff Management API views for the Cebu Mini Hotel System.
Refactored to enforce strict RBAC per role definitions:

  admin        — Full access.
  manager      — Operational oversight. Cannot control staff accounts.
  receptionist — Reservation management + own shifts + own activity log.
  front_desk   — Check-in / check-out / walk-ins. Own shifts.
  housekeeping — Own assigned cleaning tasks + own shifts.
  maintenance  — Own assigned maintenance tasks + own shifts.
  security     — Incident logs + own shifts.

All permission checks use effective_role (respects temp_role overrides).
"""

import csv
import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status, filters
from rest_framework.response import Response
from rest_framework.views import APIView

from bookings.models import Booking, BookingStatus
from rooms.models import Room, RoomStatus

from .filters import (
    StaffProfileFilter,
    CleaningTaskFilter,
    MaintenanceTaskFilter,
    StaffActivityLogFilter,
)
from .models import (
    StaffProfile,
    StaffRole,
    StaffOnlineStatus,
    StaffActivityLog,
    Shift,
    CleaningTask,
    CleaningStatus,
    MaintenanceTask,
    MaintenanceStatus,
    IncidentLog,
)
from .permissions import (
    IsStaff,
    IsAdminStaff,
    IsAdminOrManager,
    CanManageReservations,
    CanHandleCheckInOut,
    CanManageHousekeeping,
    CanAccessCleaningTasks,
    CanManageMaintenance,
    CanAccessMaintenanceTasks,
    CanAccessIncidents,
    CanCreateIncidents,
    CanViewReports,
    IsAssignedStaffOrAdmin,
)
from .serializers import (
    StaffProfileListSerializer,
    StaffProfileDetailSerializer,
    StaffCreateSerializer,
    StaffUpdateSerializer,
    StaffRoleChangeSerializer,
    StaffTempRoleSerializer,
    StaffDeactivateSerializer,
    StaffActivityLogSerializer,
    ShiftSerializer,
    ShiftCreateSerializer,
    CleaningTaskSerializer,
    CleaningTaskStatusSerializer,
    MaintenanceTaskSerializer,
    MaintenanceTaskStatusSerializer,
    IncidentLogSerializer,
)
from .services import ReportService

User = get_user_model()
logger = logging.getLogger(__name__)


# ─── Utilities ────────────────────────────────────────────────────────────────

def _log_action(request, action_type: str, description: str, **kwargs):
    """Create a StaffActivityLog entry from any view."""
    profile = getattr(request.user, "staff_profile", None)
    ip = (
        request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
        or request.META.get("REMOTE_ADDR")
    )
    StaffActivityLog.objects.create(
        staff=profile,
        action_type=action_type,
        description=description,
        ip_address=ip or None,
        **kwargs,
    )


def _get_profile_or_404(pk):
    try:
        return StaffProfile.objects.select_related("user").get(pk=pk)
    except StaffProfile.DoesNotExist:
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# ── STAFF MEMBER MANAGEMENT
# ── Admin only: create, delete, promote, deactivate, assign temp roles.
# ── Manager:    read-only view of list and profiles.
# ═══════════════════════════════════════════════════════════════════════════════

class StaffListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/staff/members/  — List all staff (Admin + Manager, read-only for Manager)
    POST /api/staff/members/  — Create a new staff account (Admin only)
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = StaffProfileFilter
    search_fields   = ["user__email", "user__first_name", "user__last_name", "employee_id"]
    ordering_fields = ["created_at", "user__email", "role", "online_status"]
    ordering        = ["-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminStaff()]       # Admin only — Manager cannot create staff
        return [IsAdminOrManager()]       # Admin + Manager can view list

    def get_queryset(self):
        return StaffProfile.objects.select_related("user").all()

    def get_serializer_class(self):
        if self.request.method == "POST":
            return StaffCreateSerializer
        return StaffProfileListSerializer

    def create(self, request, *args, **kwargs):
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        _log_action(
            request, "create_staff",
            f"Created staff account for {profile.user.email} with role {profile.role}",
            target_user_id=profile.user_id,
        )
        return Response(
            StaffProfileDetailSerializer(profile).data,
            status=status.HTTP_201_CREATED,
        )


class StaffDetailView(APIView):
    """
    GET    /api/staff/members/<pk>/  — Full profile (Admin + Manager)
    PATCH  /api/staff/members/<pk>/  — Update basic fields (Admin only)
    DELETE /api/staff/members/<pk>/  — Hard-delete account (Admin only)
    """

    def get_permissions(self):
        if self.request.method in ("PATCH", "DELETE"):
            return [IsAdminStaff()]
        return [IsAdminOrManager()]

    def get(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(StaffProfileDetailSerializer(profile).data)

    def patch(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = StaffUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _log_action(request, "update_staff",
                    f"Updated profile for {profile.user.email}",
                    target_user_id=profile.user_id)
        return Response(StaffProfileDetailSerializer(profile).data)

    def delete(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        if profile.user == request.user:
            return Response({"error": "You cannot delete your own account."},
                            status=status.HTTP_400_BAD_REQUEST)
        email = profile.user.email
        profile.user.delete()   # CASCADE deletes the StaffProfile
        _log_action(request, "delete_staff", f"Deleted staff account: {email}")
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffRoleChangeView(APIView):
    """
    POST /api/staff/members/<pk>/promote/
    Admin only. Cannot change own role.
    Manager cannot promote or demote anyone.
    """
    permission_classes = [IsAdminStaff]

    def post(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        if profile.user == request.user:
            return Response({"error": "You cannot change your own role."},
                            status=status.HTTP_400_BAD_REQUEST)

        old_role = profile.role
        serializer = StaffRoleChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(profile)

        _log_action(
            request, "role_change",
            f"Changed role for {profile.user.email}: {old_role} → {profile.role}",
            target_user_id=profile.user_id,
            metadata={"old_role": old_role, "new_role": profile.role,
                      "note": serializer.validated_data.get("note", "")},
        )
        return Response(StaffProfileDetailSerializer(profile).data)


class StaffTempRoleView(APIView):
    """
    POST   /api/staff/members/<pk>/temp-role/  — Assign temporary role override.
    DELETE /api/staff/members/<pk>/temp-role/  — Remove temp role.
    Admin only. Manager cannot assign temp roles.
    """
    permission_classes = [IsAdminStaff]

    def post(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = StaffTempRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(profile)
        _log_action(
            request, "assign_temp_role",
            f"Assigned temp role {profile.temp_role} to {profile.user.email} "
            f"until {profile.temp_role_expires_at}",
            target_user_id=profile.user_id,
        )
        return Response(StaffProfileDetailSerializer(profile).data)

    def delete(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        profile.temp_role            = None
        profile.temp_role_expires_at = None
        profile.save(update_fields=["temp_role", "temp_role_expires_at", "updated_at"])
        _log_action(request, "remove_temp_role",
                    f"Removed temp role from {profile.user.email}",
                    target_user_id=profile.user_id)
        return Response(StaffProfileDetailSerializer(profile).data)


class StaffDeactivateView(APIView):
    """
    POST /api/staff/members/<pk>/deactivate/
    Admin only. Manager cannot deactivate staff.
    """
    permission_classes = [IsAdminStaff]

    def post(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        if profile.user == request.user:
            return Response({"error": "You cannot deactivate your own account."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not profile.is_active:
            return Response({"error": "Staff account is already deactivated."},
                            status=status.HTTP_400_BAD_REQUEST)
        serializer = StaffDeactivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(profile, deactivated_by=request.user)
        _log_action(
            request, "deactivate_staff",
            f"Deactivated staff account: {profile.user.email}. "
            f"Reason: {serializer.validated_data.get('reason', 'Not specified')}",
            target_user_id=profile.user_id,
        )
        return Response({"detail": "Staff account deactivated."})


class StaffReactivateView(APIView):
    """
    POST /api/staff/members/<pk>/reactivate/
    Admin only. Manager cannot reactivate staff.
    """
    permission_classes = [IsAdminStaff]

    def post(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        if profile.is_active:
            return Response({"error": "Staff account is already active."},
                            status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            profile.is_active      = True
            profile.deactivated_at = None
            profile.deactivated_by = None
            profile.save(update_fields=["is_active", "deactivated_at", "deactivated_by", "updated_at"])
            profile.user.is_active = True
            profile.user.save(update_fields=["is_active"])
        _log_action(request, "reactivate_staff",
                    f"Reactivated staff account: {profile.user.email}",
                    target_user_id=profile.user_id)
        return Response({"detail": "Staff account reactivated."})


# ═══════════════════════════════════════════════════════════════════════════════
# ── MONITORING & PRESENCE
# ═══════════════════════════════════════════════════════════════════════════════

class StaffMonitoringView(generics.ListAPIView):
    """
    GET /api/staff/monitoring/
    Real-time staff overview. Admin + Manager only.
    """
    serializer_class   = StaffProfileListSerializer
    permission_classes = [IsAdminOrManager]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class    = StaffProfileFilter
    search_fields      = ["user__email", "user__first_name", "user__last_name"]

    def get_queryset(self):
        return StaffProfile.objects.select_related("user").filter(is_active=True)

    def list(self, request, *args, **kwargs):
        profiles = list(self.filter_queryset(self.get_queryset()))

        # Clear expired temp roles in bulk
        now = timezone.now()
        to_clear = [
            p for p in profiles
            if p.temp_role and p.temp_role_expires_at and now >= p.temp_role_expires_at
        ]
        for p in to_clear:
            p.temp_role            = None
            p.temp_role_expires_at = None
            p.save(update_fields=["temp_role", "temp_role_expires_at", "updated_at"])

        by_role = {}
        for role_key, role_label in StaffRole.choices:
            members = [p for p in profiles if p.effective_role == role_key]
            by_role[role_key] = {
                "label":   role_label,
                "count":   len(members),
                "online":  sum(1 for m in members if m.online_status == StaffOnlineStatus.ONLINE),
                "members": StaffProfileListSerializer(members, many=True).data,
            }

        return Response({
            "total_active": len(profiles),
            "total_online": sum(1 for p in profiles if p.online_status == StaffOnlineStatus.ONLINE),
            "by_role":      by_role,
        })


class StaffPresenceUpdateView(APIView):
    """
    POST /api/staff/presence/
    Self-service heartbeat. Any active staff member can update their own status.
    Body: { "status": "online|idle|offline", "current_task": "..." }
    """
    permission_classes = [IsStaff]

    def post(self, request):
        profile = getattr(request.user, "staff_profile", None)
        if not profile:
            return Response({"error": "No staff profile found."}, status=status.HTTP_400_BAD_REQUEST)

        new_status   = request.data.get("status", "online")
        current_task = request.data.get("current_task", profile.current_task)

        if new_status not in StaffOnlineStatus.values:
            return Response({"error": f"Invalid status '{new_status}'."},
                            status=status.HTTP_400_BAD_REQUEST)

        profile.online_status = new_status
        profile.last_seen_at  = timezone.now()
        profile.current_task  = current_task
        profile.save(update_fields=["online_status", "last_seen_at", "current_task", "updated_at"])

        return Response({
            "status":       profile.online_status,
            "current_task": profile.current_task,
            "last_seen_at": profile.last_seen_at,
        })


# ═══════════════════════════════════════════════════════════════════════════════
# ── SHIFTS
# ── Admin + Manager: create, edit, delete, view all.
# ── All staff:       view own shifts only (/staff/my-shifts/).
# ═══════════════════════════════════════════════════════════════════════════════

class ShiftListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/staff/shifts/  — List all shifts (Admin + Manager)
    POST /api/staff/shifts/  — Schedule a shift (Admin + Manager)
    """
    permission_classes = [IsAdminOrManager]
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields    = ["start_time", "end_time", "status"]
    ordering           = ["-start_time"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ShiftCreateSerializer
        return ShiftSerializer

    def get_queryset(self):
        qs = Shift.objects.select_related("staff__user")
        staff_id = self.request.query_params.get("staff_id")
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        shift_status = self.request.query_params.get("status")
        if shift_status:
            qs = qs.filter(status=shift_status)
        return qs

    def perform_create(self, serializer):
        shift = serializer.save(created_by=self.request.user)
        _log_action(self.request, "create_shift",
                    f"Scheduled shift '{shift.label}' for {shift.staff}")


class ShiftDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET / PATCH / DELETE /api/staff/shifts/<pk>/
    Admin + Manager only.
    """
    permission_classes = [IsAdminOrManager]
    serializer_class   = ShiftSerializer
    queryset           = Shift.objects.select_related("staff__user")


class MyShiftView(generics.ListAPIView):
    """
    GET /api/staff/my-shifts/
    Any active staff member views their own assigned shifts.
    Receptionists, Front Desk, Housekeeping, Maintenance, Security all use this.
    """
    serializer_class   = ShiftSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        profile = getattr(self.request.user, "staff_profile", None)
        if not profile:
            return Shift.objects.none()
        return Shift.objects.select_related("staff__user").filter(staff=profile).order_by("-start_time")


# ═══════════════════════════════════════════════════════════════════════════════
# ── ACTIVITY LOGS
# ── Admin + Manager: full audit trail.
# ── All staff:       own activity log only.
# ═══════════════════════════════════════════════════════════════════════════════

class StaffActivityLogListView(generics.ListAPIView):
    """
    GET /api/staff/activity-logs/
    Full audit trail. Admin + Manager only.
    """
    serializer_class   = StaffActivityLogSerializer
    permission_classes = [IsAdminOrManager]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = StaffActivityLogFilter
    search_fields      = ["description", "action_type"]
    ordering_fields    = ["created_at", "action_type"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        return StaffActivityLog.objects.select_related("staff__user").all()


class MyActivityLogView(generics.ListAPIView):
    """
    GET /api/staff/activity-logs/me/
    Any staff member views their own activity log.
    Available to all roles including receptionist, security, etc.
    """
    serializer_class   = StaffActivityLogSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        profile = getattr(self.request.user, "staff_profile", None)
        if not profile:
            return StaffActivityLog.objects.none()
        return profile.activity_logs.all()[:100]


# ═══════════════════════════════════════════════════════════════════════════════
# ── CLEANING TASKS
# ── Admin + Manager:  create, assign, view all, update any.
# ── Housekeeping:     view own assigned tasks only, update status on own tasks.
# ── All other roles:  no access.
# ═══════════════════════════════════════════════════════════════════════════════

class CleaningTaskListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/staff/cleaning/  — Admin/Manager: all tasks. Housekeeping: own tasks.
    POST /api/staff/cleaning/  — Admin/Manager only. Housekeeping cannot create tasks.
    """
    serializer_class = CleaningTaskSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class  = CleaningTaskFilter
    ordering_fields  = ["priority", "created_at", "scheduled_at"]
    ordering         = ["priority", "-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanManageHousekeeping()]      # Admin + Manager only
        return [CanAccessCleaningTasks()]         # Admin + Manager + Housekeeping

    def get_queryset(self):
        qs = CleaningTask.objects.select_related("room", "assigned_to__user")
        profile = getattr(self.request.user, "staff_profile", None)
        # Housekeeping staff see only their own assigned tasks
        if profile and profile.effective_role == StaffRole.HOUSEKEEPING:
            return qs.filter(assigned_to=profile)
        # Admin and Manager see all tasks
        return qs

    def perform_create(self, serializer):
        task = serializer.save(created_by=self.request.user)
        _log_action(
            self.request, "create_cleaning_task",
            f"Created cleaning task for Room {task.room.room_number}",
            room_id=task.room_id,
        )


class CleaningTaskDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/staff/cleaning/<pk>/  — Admin/Manager/Housekeeping (own task).
    PATCH /api/staff/cleaning/<pk>/  — Admin/Manager only (field updates).
                                       Housekeeping uses /status/ endpoint instead.
    """
    serializer_class   = CleaningTaskSerializer
    permission_classes = [CanAccessCleaningTasks, IsAssignedStaffOrAdmin]
    queryset           = CleaningTask.objects.select_related("room", "assigned_to__user")


class CleaningTaskStatusView(APIView):
    """
    PATCH /api/staff/cleaning/<pk>/status/
    Status transition with validation.
    Housekeeping: own tasks only (dirty→cleaning→clean or cleaning→dirty).
    Admin/Manager: any task.
    """
    permission_classes = [CanAccessCleaningTasks]

    def patch(self, request, pk):
        try:
            task = CleaningTask.objects.select_related("room", "assigned_to").get(pk=pk)
        except CleaningTask.DoesNotExist:
            return Response({"error": "Cleaning task not found."}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, "staff_profile", None)
        # Housekeeping can only update tasks assigned to them
        if profile and profile.effective_role == StaffRole.HOUSEKEEPING:
            if task.assigned_to != profile:
                return Response(
                    {"error": "You can only update tasks assigned to you."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = CleaningTaskStatusSerializer(
            data=request.data, context={"task": task}
        )
        serializer.is_valid(raise_exception=True)
        task = serializer.save(task, actor=request.user)

        _log_action(
            request, "update_cleaning_status",
            f"Cleaning task {pk} → {task.status} (Room {task.room.room_number})",
            room_id=task.room_id,
        )
        return Response(CleaningTaskSerializer(task).data)


# ═══════════════════════════════════════════════════════════════════════════════
# ── MAINTENANCE TASKS
# ── Admin + Manager:  create, assign, view all, update any.
# ── Maintenance:      view own assigned tasks only, update status on own tasks.
# ── All other roles:  no access.
# ═══════════════════════════════════════════════════════════════════════════════

class MaintenanceTaskListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/staff/maintenance/  — Admin/Manager: all. Maintenance: own only.
    POST /api/staff/maintenance/  — Admin/Manager only.
    """
    serializer_class = MaintenanceTaskSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class  = MaintenanceTaskFilter
    search_fields    = ["title", "description"]
    ordering_fields  = ["priority", "created_at"]
    ordering         = ["priority", "-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanManageMaintenance()]           # Admin + Manager only
        return [CanAccessMaintenanceTasks()]          # Admin + Manager + Maintenance

    def get_queryset(self):
        qs = MaintenanceTask.objects.select_related("room", "assigned_to__user")
        profile = getattr(self.request.user, "staff_profile", None)
        # Maintenance staff see only their own assigned tasks
        if profile and profile.effective_role == StaffRole.MAINTENANCE:
            return qs.filter(assigned_to=profile)
        return qs

    def perform_create(self, serializer):
        task = serializer.save(created_by=self.request.user)
        _log_action(
            self.request, "create_maintenance_task",
            f"Created maintenance task '{task.title}' for Room {task.room.room_number}",
            room_id=task.room_id,
        )


class MaintenanceTaskDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/staff/maintenance/<pk>/  — Admin/Manager/Maintenance (own task).
    PATCH /api/staff/maintenance/<pk>/  — Admin/Manager only.
    """
    serializer_class   = MaintenanceTaskSerializer
    permission_classes = [CanAccessMaintenanceTasks, IsAssignedStaffOrAdmin]
    queryset           = MaintenanceTask.objects.select_related("room", "assigned_to__user")


class MaintenanceTaskStatusView(APIView):
    """
    PATCH /api/staff/maintenance/<pk>/status/
    Maintenance: own tasks only (pending→in_progress→completed or cancelled).
    Admin/Manager: any task.
    """
    permission_classes = [CanAccessMaintenanceTasks]

    def patch(self, request, pk):
        try:
            task = MaintenanceTask.objects.select_related("room", "assigned_to").get(pk=pk)
        except MaintenanceTask.DoesNotExist:
            return Response({"error": "Maintenance task not found."}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, "staff_profile", None)
        # Maintenance staff can only update tasks assigned to them
        if profile and profile.effective_role == StaffRole.MAINTENANCE:
            if task.assigned_to != profile:
                return Response(
                    {"error": "You can only update tasks assigned to you."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = MaintenanceTaskStatusSerializer(
            data=request.data, context={"task": task}
        )
        serializer.is_valid(raise_exception=True)
        task = serializer.save(task, actor=request.user)

        _log_action(
            request, "update_maintenance_status",
            f"Maintenance task {pk} '{task.title}' → {task.status}",
            room_id=task.room_id,
        )
        return Response(MaintenanceTaskSerializer(task).data)


# ═══════════════════════════════════════════════════════════════════════════════
# ── INCIDENT LOGS
# ── Admin:    full access (view + create + edit).
# ── Manager:  view and monitor only (cannot create).
# ── Security: create + view + edit/resolve their own logs.
# ── All other roles: no access.
# ═══════════════════════════════════════════════════════════════════════════════

class IncidentLogListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/staff/incidents/  — Admin, Manager, Security.
    POST /api/staff/incidents/  — Admin and Security only. Manager cannot create.
    """
    serializer_class = IncidentLogSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields  = ["created_at", "severity", "incident_type"]
    ordering         = ["-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanCreateIncidents()]      # Admin + Security only
        return [CanAccessIncidents()]          # Admin + Manager + Security

    def get_queryset(self):
        return IncidentLog.objects.select_related("logged_by__user")

    def perform_create(self, serializer):
        profile = getattr(self.request.user, "staff_profile", None)
        incident = serializer.save(logged_by=profile)
        _log_action(
            self.request, "log_incident",
            f"Logged incident: {incident.get_incident_type_display()} at {incident.location}",
        )


class IncidentLogDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/staff/incidents/<pk>/          — Admin, Manager, Security.
    PATCH /api/staff/incidents/<pk>/          — Admin + Security only.
                                                Manager cannot edit incidents.
    """
    serializer_class = IncidentLogSerializer
    queryset         = IncidentLog.objects.select_related("logged_by__user")

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            return [CanCreateIncidents()]      # Admin + Security can edit
        return [CanAccessIncidents()]          # Admin + Manager + Security can view

    def perform_update(self, serializer):
        incident = serializer.save()
        # Auto-set resolved_at when marking resolved
        if incident.resolved and not incident.resolved_at:
            incident.resolved_at = timezone.now()
            incident.save(update_fields=["resolved_at"])


# ═══════════════════════════════════════════════════════════════════════════════
# ── DASHBOARD OVERVIEW
# ── Admin + Manager only.
# ═══════════════════════════════════════════════════════════════════════════════

class AdminDashboardView(APIView):
    """
    GET /api/staff/dashboard/
    Real-time hotel operational overview. Admin + Manager only.
    """
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        now   = timezone.now()
        today = now.date()

        rooms = Room.objects.all()
        room_summary = {
            "total":       rooms.count(),
            "available":   rooms.filter(status=RoomStatus.AVAILABLE, is_active=True).count(),
            "occupied":    rooms.filter(status=RoomStatus.OCCUPIED).count(),
            "cleaning":    rooms.filter(status=RoomStatus.CLEANING).count(),
            "maintenance": rooms.filter(status=RoomStatus.MAINTENANCE).count(),
        }

        bookings_today = Booking.objects.filter(created_at__date=today)
        booking_summary = {
            "pending_payment":   Booking.objects.filter(status=BookingStatus.PENDING_PAYMENT).count(),
            "confirmed":         Booking.objects.filter(status=BookingStatus.CONFIRMED).count(),
            "checked_in":        Booking.objects.filter(status=BookingStatus.CHECKED_IN).count(),
            "checked_out_today": Booking.objects.filter(
                status=BookingStatus.CHECKED_OUT, updated_at__date=today).count(),
            "created_today":     bookings_today.count(),
        }

        task_summary = {
            "cleaning_dirty":          CleaningTask.objects.filter(status=CleaningStatus.DIRTY).count(),
            "cleaning_in_progress":    CleaningTask.objects.filter(status=CleaningStatus.CLEANING).count(),
            "maintenance_pending":     MaintenanceTask.objects.filter(status=MaintenanceStatus.PENDING).count(),
            "maintenance_in_progress": MaintenanceTask.objects.filter(status=MaintenanceStatus.IN_PROGRESS).count(),
        }

        staff_summary = {
            "total":   StaffProfile.objects.filter(is_active=True).count(),
            "online":  StaffProfile.objects.filter(is_active=True, online_status=StaffOnlineStatus.ONLINE).count(),
            "idle":    StaffProfile.objects.filter(is_active=True, online_status=StaffOnlineStatus.IDLE).count(),
            "offline": StaffProfile.objects.filter(is_active=True, online_status=StaffOnlineStatus.OFFLINE).count(),
        }

        revenue_today = (
            Booking.objects.filter(payment_status="paid", confirmed_at__date=today)
            .aggregate(total=Sum("total_price"))["total"] or 0
        )

        recent_logs    = StaffActivityLog.objects.select_related("staff__user").all()[:15]
        recent_activity = StaffActivityLogSerializer(recent_logs, many=True).data

        return Response({
            "rooms":           room_summary,
            "bookings":        booking_summary,
            "tasks":           task_summary,
            "staff":           staff_summary,
            "revenue_today":   float(revenue_today),
            "recent_activity": recent_activity,
            "generated_at":    now,
        })


# ═══════════════════════════════════════════════════════════════════════════════
# ── REPORTS & ANALYTICS
# ── Admin + Manager only.
# ═══════════════════════════════════════════════════════════════════════════════

class ReportView(APIView):
    """
    GET /api/staff/reports/
    ?type=bookings|revenue|occupancy|guests|staff
    &period=daily|weekly|monthly|yearly
    &start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    &export=csv|json

    Admin + Manager only. All other roles return 403.
    """
    permission_classes = [CanViewReports]

    def get(self, request):
        report_type = request.query_params.get("type", "bookings")
        period      = request.query_params.get("period", "monthly")
        start_str   = request.query_params.get("start_date")
        end_str     = request.query_params.get("end_date")
        export_fmt  = request.query_params.get("export", "json")

        try:
            start_date, end_date = ReportService.resolve_period(period, start_str, end_str)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        generators = {
            "bookings":  ReportService.booking_report,
            "revenue":   ReportService.revenue_report,
            "occupancy": ReportService.occupancy_report,
            "guests":    ReportService.guest_report,
            "staff":     ReportService.staff_performance_report,
        }

        if report_type not in generators:
            return Response(
                {"error": f"Unknown report type '{report_type}'. "
                          f"Valid types: {list(generators.keys())}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = generators[report_type](start_date, end_date)

        if export_fmt == "csv":
            return _export_csv(data, filename=f"{report_type}_{period}.csv")

        return Response({
            "report_type":  report_type,
            "period":       period,
            "start_date":   start_date,
            "end_date":     end_date,
            "generated_at": timezone.now(),
            "data":         data,
        })


def _export_csv(data: dict, filename: str) -> HttpResponse:
    """Convert a report dict to a CSV download response."""
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    rows = data.get("rows", [])
    if not rows:
        return response
    writer = csv.DictWriter(response, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return response