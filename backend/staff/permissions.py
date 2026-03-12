"""
staff/permissions.py

Role-based permission classes for the Cebu Mini Hotel Staff module.

Design principle:
  - Every permission class reads `request.user.staff_profile.effective_role`
    (which respects temporary role overrides).
  - All classes fail gracefully if the user has no StaffProfile (e.g. guest users).
  - Classes are composable — use them in combination via DRF's permission list.
"""

from rest_framework.permissions import BasePermission

from .models import StaffRole


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_effective_role(user) -> str | None:
    """Return the effective role string for a user, or None if not staff."""
    if not user or not user.is_authenticated:
        return None
    profile = getattr(user, "staff_profile", None)
    if profile is None or not profile.is_active:
        return None
    return profile.effective_role


def _has_role(user, *roles) -> bool:
    return _get_effective_role(user) in roles


# ─── Base ─────────────────────────────────────────────────────────────────────

class IsStaff(BasePermission):
    """
    Grants access to any user with an active StaffProfile.
    Equivalent to 'is any kind of hotel staff'.
    """
    message = "Only hotel staff members can access this resource."

    def has_permission(self, request, view):
        return _get_effective_role(request.user) is not None


class IsAdminStaff(BasePermission):
    """Admin (Super Admin) only."""
    message = "Only Admin users can perform this action."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN)


class IsAdminOrManager(BasePermission):
    """Admin or Manager."""
    message = "Only Admin or Manager users can perform this action."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


class IsAdminOrManagerOrReceptionist(BasePermission):
    """Admin, Manager, or Receptionist."""
    message = "Only Admin, Manager, or Receptionist users can perform this action."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.RECEPTIONIST,
        )


class CanHandleCheckInOut(BasePermission):
    """
    Roles allowed to perform guest check-in / check-out:
    Admin, Manager, Receptionist, Front Desk.
    """
    message = "You do not have permission to handle guest check-in or check-out."

    def has_permission(self, request, view):
        return _has_role(
            request.user,
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.RECEPTIONIST,
            StaffRole.FRONT_DESK,
        )


class CanManageHousekeeping(BasePermission):
    """Roles that can create/assign/view cleaning tasks: Admin, Manager."""
    message = "You do not have permission to manage housekeeping tasks."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


class IsHousekeepingStaff(BasePermission):
    """Housekeeping staff can update their own assigned tasks."""
    message = "Only Housekeeping staff can access this resource."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.HOUSEKEEPING,
                         StaffRole.ADMIN, StaffRole.MANAGER)


class CanManageMaintenance(BasePermission):
    """Roles that can create/assign maintenance tasks: Admin, Manager."""
    message = "You do not have permission to manage maintenance tasks."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


class IsMaintenanceStaff(BasePermission):
    """Maintenance staff can update their own assigned tasks."""
    message = "Only Maintenance staff can access this resource."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.MAINTENANCE,
                         StaffRole.ADMIN, StaffRole.MANAGER)


class IsSecurityStaff(BasePermission):
    """Security staff (or Admin) can log incidents."""
    message = "Only Security staff can access this resource."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.SECURITY, StaffRole.ADMIN)


class CanViewReports(BasePermission):
    """Only Admin and Manager can access analytics and reports."""
    message = "Only Admin or Manager users can access reports."

    def has_permission(self, request, view):
        return _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER)


# ─── Object-level ─────────────────────────────────────────────────────────────

class IsAssignedStaffOrAdmin(BasePermission):
    """
    Object-level permission:
    - Admin / Manager: always allowed.
    - Other staff: only if they are the `assigned_to` on the task object.
    """
    message = "You can only modify tasks assigned to you."

    def has_object_permission(self, request, view, obj):
        if _has_role(request.user, StaffRole.ADMIN, StaffRole.MANAGER):
            return True
        profile = getattr(request.user, "staff_profile", None)
        if profile is None:
            return False
        assigned = getattr(obj, "assigned_to", None)
        return assigned is not None and assigned.pk == profile.pk