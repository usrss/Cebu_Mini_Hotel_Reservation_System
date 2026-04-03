"""
reports/serializers.py

Serializers for the custom report generation feature.
"""

from datetime import date

from django.utils import timezone
from rest_framework import serializers

from .models import (
    ExportFormat,
    ReportTemplate,
    ReportType,
    ScheduledReport,
    ScheduleFrequency,
    ReportExecution,
)

# ─── Valid metric choices per report type ─────────────────────────────────────

METRICS_BY_TYPE = {
    ReportType.BOOKINGS: [
        "total", "confirmed", "checked_in", "checked_out",
        "cancelled", "expired", "no_show", "total_revenue",
    ],
    ReportType.REVENUE: [
        "total_revenue", "total_tax", "total_service_fee",
        "net_revenue", "avg_booking_value", "paid_bookings", "total_refunds",
    ],
    ReportType.OCCUPANCY: [
        "total_rooms", "total_days", "total_room_nights",
        "occupied_nights", "occupancy_rate",
    ],
    ReportType.GUESTS: [
        "new_registrations", "repeat_guests",
        "walk_in_bookings", "registered_bookings",
    ],
    ReportType.STAFF: [
        "total_check_ins", "total_cleaning_done", "total_maintenance_done",
    ],
}

GROUP_BY_OPTIONS = ["day", "week", "month", "room_type", "status"]
PERIOD_OPTIONS   = ["daily", "weekly", "monthly", "yearly", "custom"]


# ─── Config validator ─────────────────────────────────────────────────────────

# Fix #1 — Hard cap: no single query may span more than 366 days.
MAX_DATE_RANGE_DAYS = 366

# Fix #3 — group_by options that are valid per report type.
# "day" / "week" / "month" work for all time-series reports.
# "room_type" only makes sense for reports that have room data.
# "status" only makes sense for booking reports.
VALID_GROUP_BY_PER_TYPE = {
    "bookings":  ["day", "week", "month", "room_type", "status"],
    "revenue":   ["day", "week", "month", "room_type"],
    "occupancy": ["room_type"],          # occupancy is already broken down by room_type
    "guests":    ["day", "week", "month"],
    "staff":     ["day", "week", "month"],
}


def validate_report_config(config: dict, report_type: str) -> dict:
    """
    Validates and normalises the config dict.
    Called from both ReportTemplateSerializer and RunReportSerializer.
    Returns cleaned config or raises ValidationError.

    Enforces:
      - Valid period name
      - Custom date range: both dates required, end >= start, max 366 days   [Fix #1]
      - Named periods also capped at MAX_DATE_RANGE_DAYS                     [Fix #1]
      - group_by must be compatible with the selected report_type             [Fix #3]
      - metrics must belong to the selected report_type
    """
    errors = {}
    today  = date.today()

    period = config.get("period", "monthly")
    if period not in PERIOD_OPTIONS:
        errors["period"] = f"Must be one of: {PERIOD_OPTIONS}"

    # ── Fix #1: Date range validation + hard cap ───────────────────────────────
    if period == "custom":
        start_str = config.get("start_date")
        end_str   = config.get("end_date")
        if not start_str or not end_str:
            errors["start_date/end_date"] = "Required when period is 'custom'."
        else:
            try:
                s = date.fromisoformat(start_str)
                e = date.fromisoformat(end_str)
                if e < s:
                    errors["end_date"] = "end_date must be >= start_date."
                elif (e - s).days > MAX_DATE_RANGE_DAYS:
                    errors["date_range"] = (
                        f"Custom date range cannot exceed {MAX_DATE_RANGE_DAYS} days "
                        f"({(e - s).days} days selected). "
                        f"Use scheduled reports for longer periods."
                    )
                elif s > today:
                    errors["start_date"] = "start_date cannot be in the future."
            except ValueError:
                errors["start_date/end_date"] = "Must be YYYY-MM-DD format."
    else:
        # Named periods (daily/weekly/monthly/yearly) have fixed, safe spans.
        # No capping needed — the 366-day limit only applies to custom ranges.
        pass

    # ── Fix #3: group_by compatibility check ───────────────────────────────────
    group_by = config.get("group_by")
    if group_by:
        if group_by not in GROUP_BY_OPTIONS:
            errors["group_by"] = f"Must be one of: {GROUP_BY_OPTIONS}"
        else:
            allowed_for_type = VALID_GROUP_BY_PER_TYPE.get(report_type, GROUP_BY_OPTIONS)
            if group_by not in allowed_for_type:
                errors["group_by"] = (
                    f"'{group_by}' is not a valid grouping for '{report_type}' reports. "
                    f"Valid options: {allowed_for_type}"
                )

    # ── Metric validation ──────────────────────────────────────────────────────
    metrics = config.get("metrics", [])
    valid   = METRICS_BY_TYPE.get(report_type, [])
    bad     = [m for m in metrics if m not in valid]
    if bad:
        errors["metrics"] = (
            f"Invalid metrics for '{report_type}': {bad}. "
            f"Valid options: {valid}"
        )

    if errors:
        raise serializers.ValidationError(errors)

    return config


# ─── ReportTemplate ───────────────────────────────────────────────────────────

class ReportTemplateSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(
        source="created_by.email", read_only=True
    )
    report_type_display = serializers.CharField(
        source="get_report_type_display", read_only=True
    )

    class Meta:
        model  = ReportTemplate
        fields = [
            "id", "name", "description",
            "report_type", "report_type_display",
            "config",
            "is_shared",
            "created_by_email",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by_email"]

    def validate(self, data):
        report_type = data.get("report_type", getattr(self.instance, "report_type", None))
        config      = data.get("config",      getattr(self.instance, "config", {}))

        if report_type and config:
            validate_report_config(config, report_type)

        # Managers cannot create shared templates — only admins can
        request = self.context.get("request")
        if request:
            role = getattr(
                getattr(request.user, "staff_profile", None),
                "effective_role", None
            )
            if data.get("is_shared") and role != "admin":
                raise serializers.ValidationError(
                    {"is_shared": "Only Admins can create shared templates."}
                )

        return data

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class ReportTemplateListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    created_by_email    = serializers.EmailField(source="created_by.email", read_only=True)
    report_type_display = serializers.CharField(source="get_report_type_display", read_only=True)

    class Meta:
        model  = ReportTemplate
        fields = [
            "id", "name", "report_type", "report_type_display",
            "is_shared", "created_by_email", "updated_at",
        ]


# ─── ScheduledReport ─────────────────────────────────────────────────────────

class ScheduledReportSerializer(serializers.ModelSerializer):
    template_name       = serializers.CharField(source="template.name",    read_only=True)
    template_type       = serializers.CharField(source="template.report_type", read_only=True)
    created_by_email    = serializers.EmailField(source="created_by.email", read_only=True)
    frequency_display   = serializers.CharField(source="get_frequency_display", read_only=True)
    export_format_display = serializers.CharField(source="get_export_format_display", read_only=True)

    class Meta:
        model  = ScheduledReport
        fields = [
            "id", "template", "template_name", "template_type",
            "frequency", "frequency_display",
            "export_format", "export_format_display",
            "is_active",
            "next_run", "last_run",
            "created_by_email",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "created_at", "updated_at",
            "created_by_email", "next_run", "last_run",
        ]

    def validate_template(self, template):
        """Ensure the requesting user has access to the template."""
        request = self.context.get("request")
        if not request:
            return template
        user = request.user
        if template.created_by != user and not template.is_shared:
            raise serializers.ValidationError(
                "You do not have access to this template."
            )
        return template

    def create(self, validated_data):
        from datetime import timedelta
        validated_data["created_by"] = self.context["request"].user
        # Set next_run based on frequency
        now  = timezone.now()
        freq = validated_data.get("frequency", ScheduleFrequency.MONTHLY)
        if freq == ScheduleFrequency.DAILY:
            validated_data["next_run"] = now + timedelta(days=1)
        elif freq == ScheduleFrequency.WEEKLY:
            validated_data["next_run"] = now + timedelta(weeks=1)
        else:
            validated_data["next_run"] = now + timedelta(days=30)
        return super().create(validated_data)


# ─── ReportExecution ─────────────────────────────────────────────────────────

class ReportExecutionSerializer(serializers.ModelSerializer):
    triggered_by_email   = serializers.EmailField(
        source="triggered_by.email", read_only=True
    )
    report_type_display  = serializers.CharField(
        source="get_report_type_display", read_only=True
    )
    status_display       = serializers.CharField(
        source="get_status_display", read_only=True
    )
    export_format_display = serializers.CharField(
        source="get_export_format_display", read_only=True
    )
    duration_seconds     = serializers.SerializerMethodField()

    class Meta:
        model  = ReportExecution
        fields = [
            "id",
            "template", "schedule",
            "report_type", "report_type_display",
            "config_snapshot",
            "export_format", "export_format_display",
            "status", "status_display",
            "result_data",
            "error_message",
            "triggered_by_email",
            "is_scheduled",
            "started_at", "completed_at",
            "duration_seconds",
        ]
        read_only_fields = fields  # executions are immutable

    def get_duration_seconds(self, obj):
        if obj.completed_at and obj.started_at:
            return round((obj.completed_at - obj.started_at).total_seconds(), 2)
        return None


class ReportExecutionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for execution history list."""
    triggered_by_email  = serializers.EmailField(source="triggered_by.email", read_only=True)
    report_type_display = serializers.CharField(source="get_report_type_display", read_only=True)
    status_display      = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = ReportExecution
        fields = [
            "id", "report_type", "report_type_display",
            "export_format", "status", "status_display",
            "triggered_by_email", "is_scheduled",
            "started_at", "completed_at",
        ]


# ─── Run Report (ad-hoc) ─────────────────────────────────────────────────────

class RunReportSerializer(serializers.Serializer):
    """
    Input serializer for POST /api/reports/run/
    Validates a one-off report request (not tied to a saved template).
    """
    report_type   = serializers.ChoiceField(choices=ReportType.choices)
    config        = serializers.DictField(default=dict)
    export_format = serializers.ChoiceField(
        choices=ExportFormat.choices,
        default=ExportFormat.JSON,
    )
    # Optionally save result against an existing template
    template_id   = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, data):
        validate_report_config(data["config"], data["report_type"])

        # Manager scope check — managers only see data they are allowed
        request = self.context.get("request")
        if request:
            role = getattr(
                getattr(request.user, "staff_profile", None),
                "effective_role", None
            )
            if role == "manager":
                # Managers cannot request staff reports for other managers' teams
                filters = data["config"].get("filters", {})
                staff_id = filters.get("staff_id")
                if staff_id:
                    from staff.models import StaffProfile
                    try:
                        target = StaffProfile.objects.get(pk=staff_id)
                        # Managers can only filter for staff below them
                        if target.effective_role in ("admin", "manager"):
                            raise serializers.ValidationError(
                                {"filters": "Managers cannot access admin/manager staff data."}
                            )
                    except StaffProfile.DoesNotExist:
                        raise serializers.ValidationError(
                            {"filters": "Staff member not found."}
                        )

        return data