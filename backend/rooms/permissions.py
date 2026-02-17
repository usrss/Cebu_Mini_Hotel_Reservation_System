from rest_framework.permissions import BasePermission


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