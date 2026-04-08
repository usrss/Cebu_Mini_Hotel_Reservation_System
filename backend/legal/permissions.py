from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdminOrManager(BasePermission):
    """
    Allow access only to Admin users or users with a 'manager' role.
    Adjust the role check to match your User model's role/group field.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Django superuser / staff
        if request.user.is_staff or request.user.is_superuser:
            return True
        # Role-based check — adapt 'role' to your actual field name
        user_role = getattr(request.user, "role", None)
        if user_role and str(user_role).lower() in ("admin", "manager"):
            return True
        # Group-based check
        return request.user.groups.filter(name__in=["Admin", "Manager"]).exists()


class IsAdminOrManagerOrReadOnly(BasePermission):
    """
    Read-only access for everyone; write access only for Admin/Manager.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return IsAdminOrManager().has_permission(request, view)
