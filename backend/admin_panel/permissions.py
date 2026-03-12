"""
admin_panel/permissions.py

Role-aware DRF permission classes for the Admin Panel.

All classes read staff_profile.effective_role which handles temp role expiry
automatically via the StaffProfile.effective_role property.

Usage in views:
    permission_classes = [IsAuthenticated, IsAdminRole]
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    permission_classes = [IsAuthenticated, CanManagePayments]
    permission_classes = [IsAuthenticated, CanManageReviews]
    permission_classes = [IsAuthenticated, CanViewGuestProfiles]
    permission_classes = [IsAuthenticated, CanModifyGuestAccounts]
"""

from rest_framework.permissions import BasePermission
from staff.models import StaffRole


def _get_role(request):
    """Return the caller's effective role string, or None if not active staff."""
    profile = getattr(request.user, "staff_profile", None)
    if not profile or not profile.is_active:
        return None
    return profile.effective_role


class IsAdminRole(BasePermission):
    """Super-admin only."""
    message = "Only hotel administrators can perform this action."

    def has_permission(self, request, view):
        return _get_role(request) == StaffRole.ADMIN


class IsAdminOrManager(BasePermission):
    """Admin or Manager."""
    message = "Only administrators and managers can perform this action."

    def has_permission(self, request, view):
        return _get_role(request) in (StaffRole.ADMIN, StaffRole.MANAGER)


class CanManagePayments(BasePermission):
    """
    Payment management access:
      - Admin     : full access (confirm, refund, view all)
      - Manager   : view + approve refunds
      - Front Desk: collect payments, view transactions
    Receptionist is excluded per spec.
    """
    message = "You do not have permission to manage payments."

    def has_permission(self, request, view):
        return _get_role(request) in (
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.FRONT_DESK,
        )


class CanManageReviews(BasePermission):
    """Admin or Manager can moderate reviews."""
    message = "Only administrators and managers can manage reviews."

    def has_permission(self, request, view):
        return _get_role(request) in (StaffRole.ADMIN, StaffRole.MANAGER)


class CanViewGuestProfiles(BasePermission):
    """
    Guest profile visibility per spec:
      - Admin / Manager          : full read + write
      - Receptionist / Front Desk: read-only (block endpoints use CanModifyGuestAccounts)
    """
    message = "You do not have permission to view guest profiles."

    def has_permission(self, request, view):
        return _get_role(request) in (
            StaffRole.ADMIN,
            StaffRole.MANAGER,
            StaffRole.RECEPTIONIST,
            StaffRole.FRONT_DESK,
        )


class CanModifyGuestAccounts(BasePermission):
    """Only Admin or Manager can block or suspend guest accounts."""
    message = "Only administrators and managers can modify guest accounts."

    def has_permission(self, request, view):
        return _get_role(request) in (StaffRole.ADMIN, StaffRole.MANAGER)