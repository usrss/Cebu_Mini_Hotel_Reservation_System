from rest_framework.permissions import BasePermission


class IsOwnerOrStaff(BasePermission):
    """
    Grants access if the requesting user owns the booking OR is staff/admin.
    Used for booking detail/cancel endpoints.
    """
    message = "You do not have permission to access this booking."

    def has_object_permission(self, request, view, obj):
        if request.user and (request.user.is_staff or request.user.is_superuser):
            return True
        return obj.user == request.user