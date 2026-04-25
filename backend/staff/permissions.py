"""
staff/permissions.py

Role-based permission classes for the Cebu Mini Hotel Staff module.

Design principles:
  - Every permission class reads `profile.effective_role` via _get_effective_role(),
    which respects temporary role overrides (temp_role / temp_role_expires_at).
  - All classes fail gracefully when the user has no StaffProfile (guest users).
  - Strict least-privilege RBAC — no cross-department access.
  - Admin role is never modified and retains full access everywhere.

Role responsibilities:
  admin        — Full access. Never restricted. Monitors, audits, manages accounts.
  manager      — Operational oversight. Assigns tasks, reviews requests, manages
                 incidents. Cannot control staff accounts.
  receptionist — Reservation management only.
  front_desk   — Check-in / check-out / walk-ins / payments.
  housekeeping — Own assigned cleaning tasks only.
  maintenance  — Own assigned maintenance tasks only.
  security     — Own assigned incidents only (assigned by manager).
"""

from rest_framework.permissions import BasePermission
from .models import StaffRole


# ─── Core helper ──────────────────────────────────────────────────────────────

def _get_effective_role(user) -> str | None:
    """
    Return the effective_role string for a user, or None if:
      - not authenticated
      - no StaffProfile
      - StaffProfile is inactive
    Always reads effective_role (never role directly) so temp_role overrides work.
    """
    if not user or not user.is_authenticated:
        return None
    profile = getattr(user, "staff_profile", None)
    if profile is None or not profile.is_active:
        return None
    return profile.effective_role          # @property — respects temp_role


def _has_role(user, *roles) -> bool:
    """Return True if user's effective_role is in the given roles."""
    return _get_effective_role(user) in roles


# ─── Any staff ────────────────────────────────────────────────────────────────

class IsStaff(BasePermission):
    """
    Grants access to any authenticated user with an active StaffProfile.
    Used for self-service endpoints (presence heartbeat, own shifts, own logs).
    """
    message = "Only hotel staff members can access this resource."

    def has_permission(self, request, view):
        return _get_effective_role(request.user) is not None


# ─── Admin only ───────────────────────────────────────────────────────────────

class IsAdminStaff(BasePermission):
    """
    Admin (Super Admin) only.
    Used for: create/delete/promote/deactivate staff, assign temp roles,
              assign admin role, system-level actions.
    """
    message = "Only Admin users can perform this action."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN)


# ─── Admin + Manager ──────────────────────────────────────────────────────────

class IsAdminOrManager(BasePermission):
    """
    Admin or Manager.
    Used for: view staff list/profiles, manage shifts, manage tasks,
              view incident logs, view reports, view activity logs,
              view monitoring dashboard.
    """
    message = "Only Admin or Manager users can perform this action."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


# ─── Reservation management ───────────────────────────────────────────────────

class CanManageReservations(BasePermission):
    """
    Roles allowed to create, modify, cancel, and view reservations:
      Admin, Manager, Receptionist.
    """
    message = "Only Admin, Manager, or Receptionist users can manage reservations."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.RECEPTIONIST,
        )


# ─── Check-in / check-out ─────────────────────────────────────────────────────

class CanHandleCheckInOut(BasePermission):
    """
    Roles allowed to perform guest check-in and check-out:
      Admin, Manager, Front Desk.
    """
    message = "Only Admin, Manager, or Front Desk staff can handle guest check-in or check-out."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.FRONT_DESK,
        )


# ─── Housekeeping tasks ───────────────────────────────────────────────────────

class CanManageHousekeeping(BasePermission):
    """
    Roles that can CREATE and ASSIGN cleaning tasks:
      Admin, Manager only.
    """
    message = "Only Admin or Manager users can create and assign cleaning tasks."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


class CanAccessCleaningTasks(BasePermission):
    """
    Roles that can VIEW or UPDATE cleaning tasks:
      Admin, Manager — see all tasks.
      Housekeeping   — see only their own assigned tasks (enforced in get_queryset).
    """
    message = "Only Admin, Manager, or Housekeeping staff can access cleaning tasks."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.HOUSEKEEPING,
        )


# ─── Maintenance tasks ────────────────────────────────────────────────────────

class CanManageMaintenance(BasePermission):
    """
    Roles that can CREATE and ASSIGN maintenance tasks:
      Admin, Manager only.
    """
    message = "Only Admin or Manager users can create and assign maintenance tasks."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


class CanAccessMaintenanceTasks(BasePermission):
    """
    Roles that can VIEW or UPDATE maintenance tasks:
      Admin, Manager  — see all tasks.
      Maintenance     — see only their own assigned tasks (enforced in get_queryset).
    """
    message = "Only Admin, Manager, or Maintenance staff can access maintenance tasks."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.MAINTENANCE,
        )


# ─── Incident logs ────────────────────────────────────────────────────────────

class CanAccessIncidents(BasePermission):
    """
    Roles that can view incident logs:
      Admin, Manager, Security.
    """
    message = "Only Admin, Manager, or Security staff can access incident logs."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.SECURITY,
        )


class CanCreateIncidents(BasePermission):
    """
    Roles that can LOG (create) new incidents:
      Admin, Security only.
    Manager can VIEW and MANAGE incidents but NOT create them directly.
    Front Desk / Housekeeping use CanReportIncident instead.
    """
    message = "Only Admin or Security staff can log new incidents."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.SECURITY)


class CanManageIncidents(BasePermission):
    """
    NEW — Roles that can UPDATE (review, assign, change status) existing incidents:
      Admin, Manager.

    This is separate from CanCreateIncidents intentionally:
      - Manager can review/assign/update status on ANY incident.
      - Manager cannot CREATE incidents directly (that's security's job).
      - Used by IncidentLogDetailView for PATCH requests instead of
        CanCreateIncidents, so manager is not blocked by that class's message.

    Security can also edit their OWN incidents — enforced by
    IsIncidentOwnerOrAdmin at the object level.
    """
    message = "Only Admin or Manager can review and manage incidents."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.SECURITY,   # security can still edit own — object-level enforces ownership
        )


# ─── Reports & analytics ──────────────────────────────────────────────────────

class CanViewReports(BasePermission):
    """Only Admin and Manager can access analytics reports and dashboards."""
    message = "Only Admin or Manager users can access reports and analytics."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


# ─── Object-level permission ──────────────────────────────────────────────────

class IsAssignedStaffOrAdmin(BasePermission):
    """
    Object-level permission used on task detail/update endpoints.
    - Admin / Manager: always allowed on any task.
    - Housekeeping / Maintenance: only if they are the assigned_to on the task.
    """
    message = "You can only modify tasks that are assigned to you."

    def has_object_permission(self, request, view, obj):
        if _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER):
            return True
        profile = getattr(request.user, "staff_profile", None)
        if profile is None:
            return False
        assigned = getattr(obj, "assigned_to", None)
        return assigned is not None and assigned.pk == profile.pk


class CanSubmitMaintenanceRequest(BasePermission):
    """
    Roles that can CREATE MaintenanceRequests:
      Front Desk, Housekeeping, Admin, Manager.
    """
    message = "Only Front Desk or Housekeeping staff can submit maintenance requests."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.FRONT_DESK,
            StaffRole.HOUSEKEEPING,
        )


class CanViewMaintenanceRequests(BasePermission):
    """
    Roles that can VIEW MaintenanceRequests:
      Admin, Manager — see ALL.
      Front Desk, Housekeeping — see ONLY their own (filtered in get_queryset).
    """
    message = "Only Admin, Manager, Front Desk, or Housekeeping staff can view maintenance requests."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.FRONT_DESK,
            StaffRole.HOUSEKEEPING,
        )


class CanManageMaintenanceRequests(BasePermission):
    """
    Roles that can REVIEW and CONVERT MaintenanceRequests:
      Admin, Manager only.
    """
    message = "Only Admin or Manager can review and convert maintenance requests."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


# ─── Incident reporting ───────────────────────────────────────────────────────

class CanReportIncident(BasePermission):
    """
    Roles that can CREATE incident reports:
      Admin, Security, Front Desk, Housekeeping.
    Manager: view/manage only — cannot create.
    """
    message = "Only Admin, Security, Front Desk, or Housekeeping staff can report incidents."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.SECURITY,
            StaffRole.FRONT_DESK,
            StaffRole.HOUSEKEEPING,
        )


class CanViewOwnIncidents(BasePermission):
    """
    Allows viewing incidents. Scoping (own vs all) is enforced in get_queryset:
      - Admin / Manager: all incidents.
      - Security: only incidents assigned to them (assigned_to=profile).
      - Front Desk / Housekeeping: only incidents they logged (logged_by=profile).
    """
    message = "You do not have permission to view incidents."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.SECURITY,
            StaffRole.FRONT_DESK,
            StaffRole.HOUSEKEEPING,
        )


class IsIncidentOwnerOrAdmin(BasePermission):
    """
    Object-level permission for incident edit/update.
    - Admin / Manager: always allowed on any incident.
    - Security: only if they are logged_by OR assigned_to on the incident.
    - Front Desk / Housekeeping: never allowed to edit (blocked at view level).
    """
    message = "You can only edit incidents that you created or are assigned to."

    def has_object_permission(self, request, view, obj):
        if _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER):
            return True
        profile = getattr(request.user, "staff_profile", None)
        if profile is None:
            return False
        # Security can edit if they logged it OR are assigned to it
        is_logger   = obj.logged_by is not None and obj.logged_by.pk == profile.pk
        is_assignee = obj.assigned_to is not None and obj.assigned_to.pk == profile.pk
        return is_logger or is_assignee