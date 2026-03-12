"""
staff/admin.py

Django admin registration for all Staff Management models.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    StaffProfile,
    StaffSession,
    StaffActivityLog,
    Shift,
    CleaningTask,
    MaintenanceTask,
    IncidentLog,
)


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display  = [
        "user_email", "full_name", "role", "effective_role_display",
        "online_status", "is_active", "employee_id", "created_at",
    ]
    list_filter   = ["role", "online_status", "is_active"]
    search_fields = ["user__email", "user__first_name", "user__last_name", "employee_id"]
    readonly_fields = ["effective_role_display", "created_at", "updated_at",
                       "deactivated_at", "last_seen_at"]

    @admin.display(description="Email")
    def user_email(self, obj):
        return obj.user.email

    @admin.display(description="Full Name")
    def full_name(self, obj):
        return obj.user.get_full_name() or "—"

    @admin.display(description="Effective Role")
    def effective_role_display(self, obj):
        return obj.get_effective_role_display() if hasattr(obj, "get_effective_role_display") else obj.effective_role


@admin.register(StaffActivityLog)
class StaffActivityLogAdmin(admin.ModelAdmin):
    list_display  = ["created_at", "staff", "action_type", "description_short", "ip_address"]
    list_filter   = ["action_type", "created_at"]
    search_fields = ["description", "action_type"]
    readonly_fields = ["staff", "action_type", "description", "ip_address",
                       "booking_id", "room_id", "target_user_id", "metadata", "created_at"]

    @admin.display(description="Description")
    def description_short(self, obj):
        return (obj.description[:80] + "…") if len(obj.description) > 80 else obj.description

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ["staff", "label", "start_time", "end_time", "duration_hours", "status"]
    list_filter  = ["status"]
    search_fields = ["staff__user__email", "label"]


@admin.register(CleaningTask)
class CleaningTaskAdmin(admin.ModelAdmin):
    list_display  = ["room", "assigned_to", "status", "priority", "created_at", "completed_at"]
    list_filter   = ["status", "priority"]
    search_fields = ["room__room_number"]


@admin.register(MaintenanceTask)
class MaintenanceTaskAdmin(admin.ModelAdmin):
    list_display  = ["title", "room", "assigned_to", "status", "priority", "created_at", "completed_at"]
    list_filter   = ["status", "priority"]
    search_fields = ["title", "room__room_number"]


@admin.register(IncidentLog)
class IncidentLogAdmin(admin.ModelAdmin):
    list_display  = ["incident_type", "severity", "location", "logged_by", "resolved", "created_at"]
    list_filter   = ["incident_type", "severity", "resolved"]
    search_fields = ["description", "location"]


@admin.register(StaffSession)
class StaffSessionAdmin(admin.ModelAdmin):
    list_display  = ["staff", "ip_address", "logged_in_at", "last_activity", "is_active"]
    list_filter   = ["is_active"]
    readonly_fields = ["staff", "session_key", "ip_address", "user_agent",
                       "logged_in_at", "last_activity", "logged_out_at"]