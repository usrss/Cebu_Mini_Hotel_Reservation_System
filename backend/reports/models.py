"""
reports/models.py

Persistent models for the custom report generation feature.

Models:
  ReportTemplate   — saved custom report configuration (metrics, filters, grouping)
  ScheduledReport  — cron-like schedule tied to a template
  ReportExecution  — log of every report run (on-demand or scheduled)
"""

from django.conf     import settings
from django.db       import models
from django.utils    import timezone


# ─── Choices ──────────────────────────────────────────────────────────────────

class ReportType(models.TextChoices):
    BOOKINGS  = "bookings",  "Bookings"
    REVENUE   = "revenue",   "Revenue"
    OCCUPANCY = "occupancy", "Occupancy"
    GUESTS    = "guests",    "Guests"
    STAFF     = "staff",     "Staff Performance"
    FOOD      = "food",      "Food & Drinks"
    PAYMENTS  = "payments",  "Payments"   # FIX: was missing — caused AttributeError in serializers.py


class ExportFormat(models.TextChoices):
    JSON  = "json",  "JSON (in-app)"
    CSV   = "csv",   "CSV"
    PDF   = "pdf",   "PDF"
    EXCEL = "excel", "Excel"


class ScheduleFrequency(models.TextChoices):
    DAILY   = "daily",   "Daily"
    WEEKLY  = "weekly",  "Weekly"
    MONTHLY = "monthly", "Monthly"


class ExecutionStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SUCCESS = "success", "Success"
    FAILED  = "failed",  "Failed"


# ─── ReportTemplate ───────────────────────────────────────────────────────────

class ReportTemplate(models.Model):
    """
    A saved report configuration. Belongs to the user who created it.
    Admin templates can be shared system-wide; Manager templates are private.

    config (JSONField) stores the full report parameters:
      {
        "report_type":  "revenue",
        "period":       "monthly",              # named period OR null if custom dates
        "start_date":   "2026-01-01",           # null if using named period
        "end_date":     "2026-01-31",
        "metrics":      ["total_revenue", "avg_booking_value"],
        "group_by":     "day",                  # day | week | month | room_type | status
        "filters": {
          "room_type":  "suite",                # optional
          "status":     "confirmed",            # optional
          "staff_id":   null                    # null = system-wide (admin) or own (manager)
        }
      }
    """

    name        = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    report_type = models.CharField(max_length=20, choices=ReportType.choices, db_index=True)
    config      = models.JSONField(
        default=dict,
        help_text="Full report parameters as a JSON object.",
    )

    # Ownership
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="report_templates",
    )
    # Admin can mark a template as shared — all admins/managers can use it
    is_shared   = models.BooleanField(
        default=False,
        help_text="If True, all Admin and Manager users can use this template.",
    )

    # Timestamps
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "report_templates"
        ordering = ["-updated_at"]
        indexes  = [
            models.Index(fields=["created_by", "report_type"]),
            models.Index(fields=["is_shared"]),
        ]

    def __str__(self):
        return f"{self.name} [{self.get_report_type_display()}] — {self.created_by.email}"


# ─── ScheduledReport ──────────────────────────────────────────────────────────

class ScheduledReport(models.Model):
    """
    Ties a ReportTemplate to a recurring schedule.
    The Celery beat task checks this table and fires report generation.

    next_run is updated after each execution.
    """

    template    = models.ForeignKey(
        ReportTemplate,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    frequency   = models.CharField(
        max_length=10,
        choices=ScheduleFrequency.choices,
        default=ScheduleFrequency.MONTHLY,
    )
    export_format = models.CharField(
        max_length=5,
        choices=ExportFormat.choices,
        default=ExportFormat.JSON,
    )

    is_active   = models.BooleanField(default=True)
    next_run    = models.DateTimeField(
        null=True, blank=True,
        help_text="Datetime of next scheduled execution. Auto-updated after each run.",
    )
    last_run    = models.DateTimeField(null=True, blank=True)

    # Who created this schedule
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="scheduled_reports",
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "scheduled_reports"
        ordering = ["next_run"]

    def __str__(self):
        return f"Schedule({self.template.name} — {self.frequency})"

    def advance_next_run(self):
        """
        Advance next_run by one period after a successful execution.
        """
        from datetime import timedelta
        now = timezone.now()
        if self.frequency == ScheduleFrequency.DAILY:
            self.next_run = now + timedelta(days=1)
        elif self.frequency == ScheduleFrequency.WEEKLY:
            self.next_run = now + timedelta(weeks=1)
        else:  # MONTHLY — advance by ~30 days
            self.next_run = now + timedelta(days=30)
        self.last_run = now
        self.save(update_fields=["next_run", "last_run", "updated_at"])


# ─── ReportExecution ──────────────────────────────────────────────────────────

class ReportExecution(models.Model):
    """
    Immutable log of every report run (on-demand or scheduled).
    Stores the full result payload so it can be retrieved later.

    result_data is the JSON payload returned by ReportService — summary + rows.
    For PDF/CSV exports, result_data stores metadata and a download token.
    """

    template    = models.ForeignKey(
        ReportTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="executions",
        help_text="Null for ad-hoc runs not tied to a saved template.",
    )
    schedule    = models.ForeignKey(
        ScheduledReport,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="executions",
        help_text="Null for on-demand runs.",
    )

    report_type   = models.CharField(max_length=20, choices=ReportType.choices)
    config_snapshot = models.JSONField(
        default=dict,
        help_text="Copy of config at execution time (immutable record).",
    )
    export_format = models.CharField(max_length=5, choices=ExportFormat.choices)
    status        = models.CharField(
        max_length=10,
        choices=ExecutionStatus.choices,
        default=ExecutionStatus.PENDING,
        db_index=True,
    )

    result_data   = models.JSONField(
        null=True, blank=True,
        help_text="Full report payload (summary + rows). Null on failure.",
    )
    error_message = models.TextField(blank=True)

    # Who triggered this run
    triggered_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="report_executions",
    )
    is_scheduled  = models.BooleanField(default=False)

    # Timing
    started_at    = models.DateTimeField(auto_now_add=True)
    completed_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "report_executions"
        ordering = ["-started_at"]
        indexes  = [
            models.Index(fields=["report_type", "-started_at"]),
            models.Index(fields=["triggered_by", "-started_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return (
            f"Execution({self.report_type} "
            f"{self.started_at:%Y-%m-%d %H:%M} "
            f"[{self.status}])"
        )

    def mark_success(self, result_data: dict):
        self.status       = ExecutionStatus.SUCCESS
        self.result_data  = result_data
        self.completed_at = timezone.now()
        self.save(update_fields=["status", "result_data", "completed_at"])

    def mark_failed(self, error: str):
        self.status        = ExecutionStatus.FAILED
        self.error_message = error
        self.completed_at  = timezone.now()
        self.save(update_fields=["status", "error_message", "completed_at"])