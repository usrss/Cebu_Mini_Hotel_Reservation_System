from rest_framework.permissions import BasePermission
from staff.models import StaffRole

# ─── Utility function ───────────────────────────────
def _get_booking_role(user):
    """Return effective role string, or None if not an active staff member."""
    profile = getattr(user, "staff_profile", None)
    if not profile or not profile.is_active:
        return None
    return profile.effective_role

# ─── Permissions ────────────────────────────────────
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


class CanViewAllBookings(BasePermission):
    """
    Admin, Manager, Receptionist, Front Desk can list / view all bookings.
    """
    message = "You do not have permission to view all bookings."

    def has_permission(self, request, view):
        return _get_booking_role(request.user) in (
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.RECEPTIONIST,
            StaffRole.FRONT_DESK,
        )


class CanConfirmCancelBookings(BasePermission):
    """
    Admin, Manager, Receptionist can confirm, cancel, or update booking status.
    """
    message = "You do not have permission to modify booking status."

    def has_permission(self, request, view):
        return _get_booking_role(request.user) in (
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.RECEPTIONIST,
        )


class CanHandleCheckInOut(BasePermission):
    """
    Admin, Manager, Receptionist, Front Desk can perform check-in and check-out.
    """
    message = "You do not have permission to perform check-in or check-out."

    def has_permission(self, request, view):
        return _get_booking_role(request.user) in (
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.RECEPTIONIST,
            StaffRole.FRONT_DESK,
        )


class IsAdminOnlyBooking(BasePermission):
    """
    Admin only — for sensitive system operations like batch-expiring bookings.
    """
    message = "Only hotel administrators can perform this action."

    def has_permission(self, request, view):
        return _get_booking_role(request.user) == StaffRole.ADMIN