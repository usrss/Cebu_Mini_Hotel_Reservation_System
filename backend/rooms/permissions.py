# rooms/permissions.py
from rest_framework.permissions import BasePermission
from staff.models import StaffRole


class IsAdminRoomManager(BasePermission):
    """
    Only Admin-role staff can create, edit, delete rooms or upload images.
    Per spec: "Room Management: add, edit, remove rooms = Admin only."
    """
    message = "Only hotel administrators can manage rooms."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        profile = getattr(request.user, "staff_profile", None)
        if not profile or not profile.is_active:
            return False
        return profile.effective_role == StaffRole.ADMIN


class IsAdminOrManagerRoom(BasePermission):
    """
    Admin or Manager can view room admin data and update room status.
    Per spec: "Room Management: Admin full, Manager read-only."
    """
    message = "Only administrators and managers can access room management."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        profile = getattr(request.user, "staff_profile", None)
        if not profile or not profile.is_active:
            return False
        return profile.effective_role in (StaffRole.ADMIN, StaffRole.MANAGER)


class IsStaffOrAdmin(BasePermission):
    """
    Grants access to staff members and superusers.
    Used for all admin/management endpoints in the rooms module.
    """
    message = "Access restricted to hotel staff and administrators."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_staff or request.user.is_superuser)
        )