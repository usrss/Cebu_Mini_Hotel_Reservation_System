"""
staff/filters.py

django-filter FilterSet classes for Staff Management endpoints.
"""

import django_filters
from .models import StaffProfile, StaffRole, StaffOnlineStatus, StaffActivityLog, CleaningTask, CleaningStatus, MaintenanceTask, MaintenanceStatus


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