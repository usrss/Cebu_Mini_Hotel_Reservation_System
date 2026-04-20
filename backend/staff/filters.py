"""
staff/filters.py

django-filter FilterSet classes for Staff Management endpoints.
"""

import django_filters
from .models import StaffProfile, StaffRole, StaffOnlineStatus, StaffActivityLog, CleaningTask, CleaningStatus, \
    MaintenanceTask, MaintenanceStatus, IncidentLog
from .models import MaintenanceRequest



class StaffProfileFilter(django_filters.FilterSet):
    role          = django_filters.ChoiceFilter(choices=StaffRole.choices)
    online_status = django_filters.ChoiceFilter(choices=StaffOnlineStatus.choices)
    is_active     = django_filters.BooleanFilter()

    class Meta:
        model  = StaffProfile
        fields = ["role", "online_status", "is_active"]


class CleaningTaskFilter(django_filters.FilterSet):
    status   = django_filters.ChoiceFilter(choices=CleaningStatus.choices)
    room     = django_filters.NumberFilter(field_name="room__id")
    priority = django_filters.NumberFilter()

    class Meta:
        model  = CleaningTask
        fields = ["status", "room", "priority"]


class MaintenanceTaskFilter(django_filters.FilterSet):
    status   = django_filters.ChoiceFilter(choices=MaintenanceStatus.choices)
    room     = django_filters.NumberFilter(field_name="room__id")
    priority = django_filters.NumberFilter()

    class Meta:
        model  = MaintenanceTask
        fields = ["status", "room", "priority"]


class StaffActivityLogFilter(django_filters.FilterSet):
    staff       = django_filters.NumberFilter(field_name="staff__id")
    action_type = django_filters.CharFilter(lookup_expr="icontains")
    date_from   = django_filters.DateFilter(field_name="created_at__date", lookup_expr="gte")
    date_to     = django_filters.DateFilter(field_name="created_at__date", lookup_expr="lte")

    class Meta:
        model  = StaffActivityLog
        fields = ["staff", "action_type", "date_from", "date_to"]





class MaintenanceRequestFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=MaintenanceRequest.RequestStatus.choices)
    reported_by = django_filters.NumberFilter(field_name="reported_by__id")
    room = django_filters.NumberFilter(field_name="room__id")
    date_from = django_filters.DateFilter(field_name="created_at__date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="created_at__date", lookup_expr="lte")

    class Meta:
        model = MaintenanceRequest
        fields = ["status", "reported_by", "room", "date_from", "date_to"]


# ── Update existing IncidentLogFilter to add logged_by filter ─────────────────
# Replace the existing IncidentLogFilter with this version:

class IncidentLogFilter(django_filters.FilterSet):
    incident_type = django_filters.ChoiceFilter(choices=IncidentLog.IncidentType.choices)
    severity = django_filters.ChoiceFilter(choices=IncidentLog.Severity.choices)
    status = django_filters.ChoiceFilter(choices=IncidentLog.IncidentStatus.choices)
    resolved = django_filters.BooleanFilter()

    # NEW: filter by who logged the incident (used by FD/HK "my incidents" view)
    logged_by = django_filters.NumberFilter(field_name="logged_by__id")

    date_from = django_filters.DateFilter(field_name="created_at__date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="created_at__date", lookup_expr="lte")

    class Meta:
        model = IncidentLog
        fields = ["incident_type", "severity", "status", "resolved",
                  "logged_by", "date_from", "date_to"]


