"""
staff/views.py

All Staff Management API views for the Cebu Mini Hotel System.
Enforces strict RBAC per role definitions:

  admin        — Full access. Monitors, audits, manages staff accounts.
  manager      — Operational oversight. Assigns tasks, reviews incidents.
                 Cannot control staff accounts.
  receptionist — Reservation management + own shifts + own activity log.
  front_desk   — Check-in / check-out / walk-ins. Own shifts.
                 Can report maintenance issues and incidents.
  housekeeping — Own assigned cleaning tasks + own shifts.
                 Can report maintenance issues and incidents.
  maintenance  — Own assigned maintenance tasks + own shifts.
  security     — ONLY incidents assigned to them by manager.
                 Can create new incidents. Can edit own + assigned.

All permission checks use effective_role (respects temp_role overrides).

FIXES applied vs original:
  1. Imports: added CanManageIncidents.
  2. IncidentLogListCreateView.get_queryset: security now scoped to
     assigned_to=profile (was returning all incidents).
  3. IncidentLogDetailView.get_queryset: same security scoping fix.
  4. IncidentLogDetailView.get_permissions: PATCH now uses
     CanManageIncidents (was CanCreateIncidents, which blocked manager).
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
    IncidentLogFilter,
    StaffActivityLogFilter,
    MaintenanceRequestFilter,
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
    MaintenanceRequest,
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
    CanManageIncidents,          # FIX 1: new import — allows manager to PATCH incidents
    CanViewReports,
    IsAssignedStaffOrAdmin,
    IsIncidentOwnerOrAdmin,
    CanSubmitMaintenanceRequest,
    CanViewMaintenanceRequests,
    CanManageMaintenanceRequests,
    CanReportIncident,
    CanViewOwnIncidents,
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
    MaintenanceRequestSerializer,
    MaintenanceRequestCreateSerializer,
    MaintenanceRequestReviewSerializer,
    MaintenanceRequestConvertSerializer,
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
# ═══════════════════════════════════════════════════════════════════════════════

class StaffListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/staff/members/  — List all staff (Admin + Manager)
    POST /api/staff/members/  — Create a new staff account (Admin only)
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = StaffProfileFilter
    search_fields   = ["user__email", "user__first_name", "user__last_name", "employee_id"]
    ordering_fields = ["created_at", "user__email", "role", "online_status"]
    ordering        = ["-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminStaff()]
        return [IsAdminOrManager()]

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
    """GET / PATCH / DELETE /api/staff/members/<pk>/"""

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
        _log_action(request, "update_staff", f"Updated profile for {profile.user.email}",
                    target_user_id=profile.user_id)
        return Response(StaffProfileDetailSerializer(profile).data)

    def delete(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        if profile.user == request.user:
            return Response({"error": "You cannot delete your own account."},
                            status=status.HTTP_400_BAD_REQUEST)

        active_shifts = Shift.objects.filter(
            staff=profile,
            status=Shift.ShiftStatus.IN_SHIFT,
        ).count()
        if active_shifts > 0:
            return Response(
                {
                    "error": "Cannot hard-delete staff with an active shift in progress.",
                    "dependencies": {"active_shifts": active_shifts},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        open_tasks = CleaningTask.objects.filter(
            assigned_to=profile,
            status__in=[CleaningStatus.DIRTY, CleaningStatus.CLEANING],
        ).count()
        pending_assignments = MaintenanceTask.objects.filter(
            assigned_to=profile,
            status__in=[MaintenanceStatus.PENDING, MaintenanceStatus.IN_PROGRESS],
        ).count()

        has_other_deps = (open_tasks > 0) or (pending_assignments > 0)
        force_hard_delete = str(request.data.get("force_hard_delete", "")).lower() in (
            "1", "true", "yes", "on"
        )
        if has_other_deps and not force_hard_delete:
            return Response(
                {
                    "error": "Staff has active dependencies; hard delete requires explicit confirmation.",
                    "dependencies": {
                        "open_tasks": open_tasks,
                        "pending_assignments": pending_assignments,
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )

        email = profile.user.email
        profile.user.delete()
        _log_action(request, "delete_staff", f"Deleted staff account: {email}")
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffRoleChangeView(APIView):
    """POST /api/staff/members/<pk>/promote/"""
    permission_classes = [IsAdminStaff]

    def post(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        if profile.user == request.user:
            return Response({"error": "You cannot change your own role."},
                            status=status.HTTP_400_BAD_REQUEST)
        old_role   = profile.role
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
    """POST/DELETE /api/staff/members/<pk>/temp-role/"""
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
        _log_action(request, "remove_temp_role", f"Removed temp role from {profile.user.email}",
                    target_user_id=profile.user_id)
        return Response(StaffProfileDetailSerializer(profile).data)


class StaffDeactivateView(APIView):
    """POST /api/staff/members/<pk>/deactivate/"""
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
    """POST /api/staff/members/<pk>/reactivate/"""
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


class StaffDependenciesView(APIView):
    """GET /api/staff/members/<pk>/dependencies/"""
    permission_classes = [IsAdminStaff]

    def get(self, request, pk):
        profile = _get_profile_or_404(pk)
        if not profile:
            return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)

        active_shifts = Shift.objects.filter(
            staff=profile,
            status=Shift.ShiftStatus.IN_SHIFT,
        ).count()

        open_tasks = CleaningTask.objects.filter(
            assigned_to=profile,
            status__in=[CleaningStatus.DIRTY, CleaningStatus.CLEANING],
        ).count()

        pending_assignments = MaintenanceTask.objects.filter(
            assigned_to=profile,
            status__in=[MaintenanceStatus.PENDING, MaintenanceStatus.IN_PROGRESS],
        ).count()

        return Response({
            "active_shifts": active_shifts,
            "open_tasks": open_tasks,
            "pending_assignments": pending_assignments,
        })


# ═══════════════════════════════════════════════════════════════════════════════
# ── MONITORING & PRESENCE
# ═══════════════════════════════════════════════════════════════════════════════

class StaffMonitoringView(generics.ListAPIView):
    """GET /api/staff/monitoring/"""
    PRESENCE_STALE_SECONDS = 180  # 3 minutes

    serializer_class   = StaffProfileListSerializer
    permission_classes = [IsAdminOrManager]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class    = StaffProfileFilter
    search_fields      = ["user__email", "user__first_name", "user__last_name"]

    def get_queryset(self):
        return StaffProfile.objects.select_related("user").filter(is_active=True)

    def list(self, request, *args, **kwargs):
        from datetime import timedelta
        profiles     = list(self.filter_queryset(self.get_queryset()))
        now          = timezone.now()
        stale_cutoff = now - timedelta(seconds=self.PRESENCE_STALE_SECONDS)

        stale_pks = []
        for p in profiles:
            if p.temp_role and p.temp_role_expires_at and now >= p.temp_role_expires_at:
                p.temp_role            = None
                p.temp_role_expires_at = None
                p.save(update_fields=["temp_role", "temp_role_expires_at", "updated_at"])

            if p.online_status != StaffOnlineStatus.OFFLINE:
                is_stale = (p.last_seen_at is None or p.last_seen_at < stale_cutoff)
                if is_stale:
                    p.online_status = StaffOnlineStatus.OFFLINE
                    stale_pks.append(p.pk)

        if stale_pks:
            StaffProfile.objects.filter(pk__in=stale_pks).update(
                online_status=StaffOnlineStatus.OFFLINE
            )

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
            "total_active":  len(profiles),
            "total_online":  sum(1 for p in profiles if p.online_status == StaffOnlineStatus.ONLINE),
            "by_role":       by_role,
            "swept_offline": len(stale_pks),
            "generated_at":  now,
        })


class StaffPresenceUpdateView(APIView):
    """POST /api/staff/presence/"""
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
# ═══════════════════════════════════════════════════════════════════════════════

class ShiftListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/staff/shifts/"""
    permission_classes = [IsAdminOrManager]
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields    = ["start_time", "end_time", "status"]
    ordering           = ["-start_time"]

    def get_serializer_class(self):
        return ShiftCreateSerializer if self.request.method == "POST" else ShiftSerializer

    def get_queryset(self):
        qs = Shift.objects.select_related("staff__user")
        if sid := self.request.query_params.get("staff_id"):
            qs = qs.filter(staff_id=sid)
        if s := self.request.query_params.get("status"):
            qs = qs.filter(status=s)
        return qs

    def perform_create(self, serializer):
        shift = serializer.save(created_by=self.request.user)
        _log_action(self.request, "create_shift",
                    f"Scheduled shift '{shift.label}' for {shift.staff}")


class ShiftDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/staff/shifts/<pk>/"""
    permission_classes = [IsAdminOrManager]
    serializer_class   = ShiftSerializer
    queryset           = Shift.objects.select_related("staff__user")

    def destroy(self, request, *args, **kwargs):
        shift = self.get_object()
        if shift.status == Shift.ShiftStatus.IN_SHIFT:
            return Response(
                {"error": "Cannot delete a shift that is currently in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if shift.status == Shift.ShiftStatus.COMPLETED:
            return Response(
                {"error": "Completed shifts cannot be deleted as they are part of attendance records."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if shift.status not in {Shift.ShiftStatus.SCHEDULED, Shift.ShiftStatus.CANCELLED}:
            return Response(
                {"error": "Only scheduled or cancelled shifts can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class MyShiftView(generics.ListAPIView):
    """GET /api/staff/my-shifts/"""
    serializer_class   = ShiftSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        profile = getattr(self.request.user, "staff_profile", None)
        if not profile:
            return Shift.objects.none()
        return Shift.objects.select_related("staff__user").filter(
            staff=profile).order_by("-start_time")


# ═══════════════════════════════════════════════════════════════════════════════
# ── ACTIVITY LOGS
# ═══════════════════════════════════════════════════════════════════════════════

class StaffActivityLogListView(generics.ListAPIView):
    """GET /api/staff/activity-logs/"""
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
    """GET /api/staff/activity-logs/me/"""
    serializer_class   = StaffActivityLogSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        profile = getattr(self.request.user, "staff_profile", None)
        if not profile:
            return StaffActivityLog.objects.none()
        return profile.activity_logs.all()[:100]


# ═══════════════════════════════════════════════════════════════════════════════
# ── CLEANING TASKS
# ═══════════════════════════════════════════════════════════════════════════════

class CleaningTaskListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/staff/cleaning/"""
    serializer_class = CleaningTaskSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class  = CleaningTaskFilter
    ordering_fields  = ["priority", "created_at", "scheduled_at"]
    ordering         = ["priority", "-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanManageHousekeeping()]
        return [CanAccessCleaningTasks()]

    def get_queryset(self):
        qs      = CleaningTask.objects.select_related("room", "assigned_to__user")
        profile = getattr(self.request.user, "staff_profile", None)
        if profile and profile.effective_role == StaffRole.HOUSEKEEPING:
            return qs.filter(assigned_to=profile)
        return qs

    def perform_create(self, serializer):
        task = serializer.save(created_by=self.request.user)
        _log_action(self.request, "create_cleaning_task",
                    f"Created cleaning task for Room {task.room.room_number}",
                    room_id=task.room_id)
        if task.assigned_to:
            try:
                from notifications.service import NotificationService
                NotificationService.notify_cleaning_assigned(
                    task=task, assigned_by=self.request.user)
            except Exception as exc:
                logger.warning("notify_cleaning_assigned failed: %s", exc)


class CleaningTaskDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/staff/cleaning/<pk>/"""
    serializer_class   = CleaningTaskSerializer
    permission_classes = [CanAccessCleaningTasks, IsAssignedStaffOrAdmin]
    queryset           = CleaningTask.objects.select_related("room", "assigned_to__user")


class CleaningTaskStatusView(APIView):
    """PATCH /api/staff/cleaning/<pk>/status/"""
    permission_classes = [CanAccessCleaningTasks]

    def patch(self, request, pk):
        try:
            task = CleaningTask.objects.select_related("room", "assigned_to").get(pk=pk)
        except CleaningTask.DoesNotExist:
            return Response({"error": "Cleaning task not found."}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, "staff_profile", None)
        if profile and profile.effective_role == StaffRole.HOUSEKEEPING:
            if task.assigned_to != profile:
                return Response({"error": "You can only update tasks assigned to you."},
                                status=status.HTTP_403_FORBIDDEN)

        serializer = CleaningTaskStatusSerializer(data=request.data, context={"task": task})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(task, actor=request.user)
        _log_action(request, "update_cleaning_status",
                    f"Cleaning task {pk} → {task.status} (Room {task.room.room_number})",
                    room_id=task.room_id)
        return Response(CleaningTaskSerializer(task).data)


class CleaningTaskAssignView(APIView):
    """PATCH /api/staff/cleaning/<pk>/assign/"""
    permission_classes = [CanManageHousekeeping]

    def patch(self, request, pk):
        try:
            task = CleaningTask.objects.select_related("room", "assigned_to__user").get(pk=pk)
        except CleaningTask.DoesNotExist:
            return Response({"error": "Cleaning task not found."}, status=status.HTTP_404_NOT_FOUND)

        assigned_to_pk = request.data.get("assigned_to")

        if assigned_to_pk is None:
            old              = task.assigned_to
            task.assigned_to = None
            task.save(update_fields=["assigned_to", "updated_at"])
            _log_action(request, "unassign_cleaning_task",
                        f"Unassigned cleaning task {pk} (Room {task.room.room_number})"
                        + (f" from {old}" if old else ""), room_id=task.room_id)
            return Response(CleaningTaskSerializer(task).data)

        try:
            new_assignee = StaffProfile.objects.select_related("user").get(
                pk=assigned_to_pk, is_active=True)
        except StaffProfile.DoesNotExist:
            return Response({"error": "Staff profile not found or inactive."},
                            status=status.HTTP_400_BAD_REQUEST)

        if new_assignee.effective_role != StaffRole.HOUSEKEEPING:
            return Response({"error": "Only Housekeeping staff can be assigned cleaning tasks."},
                            status=status.HTTP_400_BAD_REQUEST)

        old              = task.assigned_to
        task.assigned_to = new_assignee
        task.save(update_fields=["assigned_to", "updated_at"])
        _log_action(request, "assign_cleaning_task",
                    f"Assigned cleaning task {pk} (Room {task.room.room_number}) "
                    f"to {new_assignee.user.email}"
                    + (f" (was {old.user.email})" if old else ""), room_id=task.room_id)

        if old != new_assignee:
            try:
                from notifications.service import NotificationService
                NotificationService.notify_cleaning_assigned(task=task, assigned_by=request.user)
            except Exception as exc:
                logger.warning("notify_cleaning_assigned failed: %s", exc)

        return Response(CleaningTaskSerializer(task).data)


# ═══════════════════════════════════════════════════════════════════════════════
# ── MAINTENANCE TASKS
# ═══════════════════════════════════════════════════════════════════════════════

class MaintenanceTaskListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/staff/maintenance/"""
    serializer_class = MaintenanceTaskSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class  = MaintenanceTaskFilter
    search_fields    = ["title", "description"]
    ordering_fields  = ["priority", "created_at"]
    ordering         = ["priority", "-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanManageMaintenance()]
        return [CanAccessMaintenanceTasks()]

    def get_queryset(self):
        qs      = MaintenanceTask.objects.select_related("room", "assigned_to__user")
        profile = getattr(self.request.user, "staff_profile", None)
        if profile and profile.effective_role == StaffRole.MAINTENANCE:
            return qs.filter(assigned_to=profile)
        return qs

    def perform_create(self, serializer):
        task = serializer.save(created_by=self.request.user)
        _log_action(self.request, "create_maintenance_task",
                    f"Created maintenance task '{task.title}' for Room {task.room.room_number}",
                    room_id=task.room_id)


class MaintenanceTaskDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/staff/maintenance/<pk>/"""
    serializer_class   = MaintenanceTaskSerializer
    permission_classes = [CanAccessMaintenanceTasks, IsAssignedStaffOrAdmin]
    queryset           = MaintenanceTask.objects.select_related("room", "assigned_to__user")


class MaintenanceTaskStatusView(APIView):
    """PATCH /api/staff/maintenance/<pk>/status/"""
    permission_classes = [CanAccessMaintenanceTasks]

    def patch(self, request, pk):
        try:
            task = MaintenanceTask.objects.select_related("room", "assigned_to").get(pk=pk)
        except MaintenanceTask.DoesNotExist:
            return Response({"error": "Maintenance task not found."}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, "staff_profile", None)
        if profile and profile.effective_role == StaffRole.MAINTENANCE:
            if task.assigned_to != profile:
                return Response({"error": "You can only update tasks assigned to you."},
                                status=status.HTTP_403_FORBIDDEN)

        serializer = MaintenanceTaskStatusSerializer(data=request.data, context={"task": task})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(task, actor=request.user)
        _log_action(request, "update_maintenance_status",
                    f"Maintenance task {pk} '{task.title}' → {task.status}",
                    room_id=task.room_id)
        return Response(MaintenanceTaskSerializer(task).data)


class MaintenanceTaskNotesView(APIView):
    """PATCH /api/staff/maintenance/<pk>/notes/"""
    permission_classes = [CanAccessMaintenanceTasks]

    def patch(self, request, pk):
        try:
            task = MaintenanceTask.objects.select_related("assigned_to").get(pk=pk)
        except MaintenanceTask.DoesNotExist:
            return Response({"error": "Maintenance task not found."}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, "staff_profile", None)
        if profile and profile.effective_role == StaffRole.MAINTENANCE:
            if task.assigned_to != profile:
                return Response({"error": "You can only add notes to tasks assigned to you."},
                                status=status.HTTP_403_FORBIDDEN)

        notes_text = request.data.get("staff_notes", "").strip()
        if not notes_text:
            return Response({"error": "staff_notes is required."},
                            status=status.HTTP_400_BAD_REQUEST)

        now        = timezone.now().strftime("%Y-%m-%d %H:%M")
        actor_name = request.user.get_full_name() or request.user.email
        entry      = f"[{now}] {actor_name}: {notes_text}"
        current    = task.staff_notes or ""
        task.staff_notes = f"{current}\n{entry}".strip()
        task.save(update_fields=["staff_notes", "updated_at"])

        _log_action(request, "add_maintenance_notes",
                    f"Added notes to maintenance task {pk} '{task.title}'",
                    room_id=task.room_id)
        return Response(MaintenanceTaskSerializer(task).data)


# ═══════════════════════════════════════════════════════════════════════════════
# ── INCIDENT LOGS
# ──
# ── Admin/Manager:    view all, update/assign any incident.
# ── Security:         view ONLY incidents assigned to them. Can create new
# ──                   incidents. Can edit incidents they logged or are assigned to.
# ── Front Desk / HK:  create, view own only, read-only after submission.
# ═══════════════════════════════════════════════════════════════════════════════

class IncidentLogListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/staff/incidents/
      Admin/Manager:           ALL incidents.
      Security:                ONLY incidents assigned to them (assigned_to=profile).
      Front Desk/Housekeeping: ONLY incidents they logged (logged_by=profile).

    POST /api/staff/incidents/
      Admin, Security, Front Desk, Housekeeping can create.
      Manager: cannot create — they review/assign incidents created by others.
    """
    serializer_class = IncidentLogSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class  = IncidentLogFilter
    search_fields    = ["title", "description", "location"]
    ordering_fields  = ["created_at", "severity", "incident_type", "status"]
    ordering         = ["-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanReportIncident()]
        return [CanViewOwnIncidents()]

    def get_queryset(self):
        qs      = IncidentLog.objects.select_related("logged_by__user", "assigned_to__user")
        profile = getattr(self.request.user, "staff_profile", None)
        role    = profile.effective_role if profile else None

        # Front Desk / Housekeeping — only incidents they submitted
        if role in (StaffRole.FRONT_DESK, StaffRole.HOUSEKEEPING):
            return qs.filter(logged_by=profile)

        # Security — incidents assigned to them OR that they logged themselves
        if role == StaffRole.SECURITY:
            from django.db.models import Q
            return qs.filter(Q(assigned_to=profile) | Q(logged_by=profile))

        # Admin / Manager — all incidents
        return qs

    def perform_create(self, serializer):
        profile  = getattr(self.request.user, "staff_profile", None)
        incident = serializer.save(logged_by=profile, status=IncidentLog.IncidentStatus.REPORTED)
        _log_action(self.request, "log_incident",
                    f"Logged incident: {incident.get_incident_type_display()} "
                    f"at {incident.location or 'unspecified location'}")
        try:
            from notifications.service import NotificationService
            NotificationService.notify_incident_reported(incident=incident)
        except Exception as exc:
            logger.warning("notify_incident_reported failed: %s", exc)


class IncidentLogDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/staff/incidents/<pk>/  — scoped by role (same as list).
    PATCH /api/staff/incidents/<pk>/  — Admin/Manager: any incident.
                                        Security: own (logged_by) or assigned (assigned_to).
                                        FD/HK: blocked entirely.
    """
    serializer_class = IncidentLogSerializer

    def get_queryset(self):
        qs      = IncidentLog.objects.select_related("logged_by__user", "assigned_to__user")
        profile = getattr(self.request.user, "staff_profile", None)
        role    = profile.effective_role if profile else None

        # FIX 3: same scoping as list view
        if role in (StaffRole.FRONT_DESK, StaffRole.HOUSEKEEPING):
            return qs.filter(logged_by=profile)

        if role == StaffRole.SECURITY:
            from django.db.models import Q
            return qs.filter(Q(assigned_to=profile) | Q(logged_by=profile))

        return qs

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            # FIX 4: use CanManageIncidents (admin + manager + security) instead of
            # CanCreateIncidents (admin + security only) — this was blocking manager.
            # IsIncidentOwnerOrAdmin enforces object-level ownership for security.
            return [CanManageIncidents(), IsIncidentOwnerOrAdmin()]
        return [CanViewOwnIncidents()]

    def update(self, request, *args, **kwargs):
        profile = getattr(request.user, "staff_profile", None)
        role    = profile.effective_role if profile else None
        if role in (StaffRole.FRONT_DESK, StaffRole.HOUSEKEEPING):
            return Response(
                {"error": "Front Desk and Housekeeping staff cannot edit incident reports "
                           "after submission. Contact Security or Manager."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        incident = serializer.save()
        if incident.resolved and not incident.resolved_at:
            incident.resolved_at = timezone.now()
            incident.save(update_fields=["resolved_at", "updated_at"])
        try:
            from notifications.service import NotificationService
            if incident.status == IncidentLog.IncidentStatus.RESOLVED:
                NotificationService.notify_incident_resolved(incident=incident)
            else:
                NotificationService.notify_incident_updated(incident=incident)
        except Exception as exc:
            logger.warning("notify_incident_updated/resolved failed: %s", exc)
        _log_action(
            self.request, "update_incident",
            f"Updated incident {incident.pk}: "
            f"{incident.title or incident.get_incident_type_display()} → {incident.status}",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# ── DASHBOARD OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════════

class AdminDashboardView(APIView):
    """GET /api/staff/dashboard/"""
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

        pending_requests = MaintenanceRequest.objects.filter(
            status=MaintenanceRequest.RequestStatus.PENDING).count()

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

        recent_logs     = StaffActivityLog.objects.select_related("staff__user").all()[:15]
        recent_activity = StaffActivityLogSerializer(recent_logs, many=True).data

        return Response({
            "rooms":                        room_summary,
            "bookings":                     booking_summary,
            "tasks":                        task_summary,
            "pending_maintenance_requests": pending_requests,
            "staff":                        staff_summary,
            "revenue_today":                float(revenue_today),
            "recent_activity":              recent_activity,
            "generated_at":                 now,
        })


# ═══════════════════════════════════════════════════════════════════════════════
# ── REPORTS & ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════

class ReportView(APIView):
    """GET /api/staff/reports/"""
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
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    rows = data.get("rows", [])
    if not rows:
        return response
    writer = csv.DictWriter(response, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return response


# ═══════════════════════════════════════════════════════════════════════════════
# ── MAINTENANCE REQUESTS  (reporting layer — FD + HK → Admin/Manager)
# ═══════════════════════════════════════════════════════════════════════════════

class MaintenanceRequestListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/staff/maintenance-requests/
      Admin/Manager: ALL requests.
      Front Desk/Housekeeping: ONLY their own.

    POST /api/staff/maintenance-requests/
      Front Desk, Housekeeping, Admin, Manager.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = MaintenanceRequestFilter
    search_fields   = ["title", "description"]
    ordering_fields = ["created_at", "status"]
    ordering        = ["-created_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanSubmitMaintenanceRequest()]
        return [CanViewMaintenanceRequests()]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return MaintenanceRequestCreateSerializer
        return MaintenanceRequestSerializer

    def get_queryset(self):
        qs      = MaintenanceRequest.objects.select_related("reported_by", "room", "converted_task")
        profile = getattr(self.request.user, "staff_profile", None)
        role    = profile.effective_role if profile else None
        if role in (StaffRole.FRONT_DESK, StaffRole.HOUSEKEEPING):
            return qs.filter(reported_by=self.request.user)
        return qs

    def perform_create(self, serializer):
        req = serializer.save(
            reported_by=self.request.user,
            status=MaintenanceRequest.RequestStatus.PENDING,
        )
        _log_action(self.request, "submit_maintenance_request",
                    f"Submitted maintenance request: '{req.title}'",
                    room_id=req.room_id)
        try:
            from notifications.service import NotificationService
            NotificationService.notify_maintenance_request_created(request_obj=req)
        except Exception as exc:
            logger.warning("notify_maintenance_request_created failed: %s", exc)


class MaintenanceRequestDetailView(generics.RetrieveAPIView):
    """GET /api/staff/maintenance-requests/<pk>/"""
    serializer_class   = MaintenanceRequestSerializer
    permission_classes = [CanViewMaintenanceRequests]

    def get_queryset(self):
        qs      = MaintenanceRequest.objects.select_related("reported_by", "room", "converted_task")
        profile = getattr(self.request.user, "staff_profile", None)
        role    = profile.effective_role if profile else None
        if role in (StaffRole.FRONT_DESK, StaffRole.HOUSEKEEPING):
            return qs.filter(reported_by=self.request.user)
        return qs


class MaintenanceRequestReviewView(APIView):
    """PATCH /api/staff/maintenance-requests/<pk>/review/ — Admin/Manager only."""
    permission_classes = [CanManageMaintenanceRequests]

    def patch(self, request, pk):
        try:
            req = MaintenanceRequest.objects.get(pk=pk)
        except MaintenanceRequest.DoesNotExist:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        if req.status == MaintenanceRequest.RequestStatus.CONVERTED_TO_TASK:
            return Response({"error": "This request has already been converted to a task."},
                            status=status.HTTP_400_BAD_REQUEST)

        serializer = MaintenanceRequestReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        req = serializer.save(req)
        _log_action(request, "review_maintenance_request",
                    f"Reviewed maintenance request '{req.title}' (pk={pk})",
                    room_id=req.room_id)
        return Response(MaintenanceRequestSerializer(req).data)


class MaintenanceRequestConvertView(APIView):
    """POST /api/staff/maintenance-requests/<pk>/convert/ — Admin/Manager only."""
    permission_classes = [CanManageMaintenanceRequests]

    def post(self, request, pk):
        try:
            req = MaintenanceRequest.objects.select_related("room").get(pk=pk)
        except MaintenanceRequest.DoesNotExist:
            return Response({"error": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        if not req.is_convertible:
            return Response({"error": "This request has already been converted to a task."},
                            status=status.HTTP_400_BAD_REQUEST)

        data = {
            "title":       request.data.get("title",       req.title),
            "description": request.data.get("description", req.description),
            "priority":    request.data.get("priority",    2),
            "deadline":    request.data.get("deadline"),
            "assigned_to": request.data.get("assigned_to"),
        }
        serializer = MaintenanceRequestConvertSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        task = serializer.save(request_obj=req, created_by=request.user)

        _log_action(request, "convert_maintenance_request",
                    f"Converted request '{req.title}' (pk={pk}) into task '{task.title}'",
                    room_id=task.room_id)

        if task.assigned_to:
            try:
                from notifications.service import NotificationService
                NotificationService.notify_maintenance_assigned(
                    task=task, assigned_by=request.user)
            except Exception as exc:
                logger.warning("notify_maintenance_assigned failed: %s", exc)

        return Response(MaintenanceTaskSerializer(task).data, status=status.HTTP_201_CREATED)


class IncidentEscalateView(APIView):
    """
    POST /api/staff/incidents/<pk>/escalate/

    Cross-module escalation: create a linked MaintenanceTask from an incident.
    Allowed: Admin + Security (own incidents only).
    """
    permission_classes = [CanCreateIncidents]

    def post(self, request, pk):
        try:
            incident = IncidentLog.objects.get(pk=pk)
        except IncidentLog.DoesNotExist:
            return Response({"error": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(request.user, "staff_profile", None)
        if profile and profile.effective_role == StaffRole.SECURITY:
            if incident.logged_by != profile:
                return Response(
                    {"error": "You can only escalate incidents that you created."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        data     = request.data
        room_obj = None
        if data.get("room"):
            try:
                room_obj = Room.objects.get(pk=data["room"])
            except Room.DoesNotExist:
                pass

        assigned_to = None
        if data.get("assigned_to"):
            try:
                assigned_profile = StaffProfile.objects.get(
                    pk=data["assigned_to"], is_active=True)
                if assigned_profile.effective_role == StaffRole.MAINTENANCE:
                    assigned_to = assigned_profile
            except StaffProfile.DoesNotExist:
                pass

        task = MaintenanceTask.objects.create(
            title       = data.get("title", f"Escalated: {incident.title or incident.get_incident_type_display()}"),
            description = data.get("description", incident.description),
            room        = room_obj,
            priority    = data.get("priority", 2),
            deadline    = data.get("deadline"),
            assigned_to = assigned_to,
            created_by  = request.user,
            reported_by = request.user,
        )

        _log_action(request, "escalate_incident",
                    f"Escalated incident {pk} to maintenance task '{task.title}'")

        if task.assigned_to:
            try:
                from notifications.service import NotificationService
                NotificationService.notify_maintenance_assigned(
                    task=task, assigned_by=request.user)
            except Exception as exc:
                logger.warning("notify_maintenance_assigned failed: %s", exc)

        return Response(MaintenanceTaskSerializer(task).data, status=status.HTTP_201_CREATED)