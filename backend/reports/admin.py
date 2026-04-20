"""reports/admin.py"""
from django.contrib import admin
from .models import ReportTemplate, ScheduledReport, ReportExecution


@admin.register(ReportTemplate)
class ReportTemplateAdmin(admin.ModelAdmin):
    list_display  = ["name", "report_type", "created_by", "is_shared", "updated_at"]
    list_filter   = ["report_type", "is_shared"]
    search_fields = ["name", "created_by__email"]
    readonly_fields = ["created_at", "updated_at"]
    ordering      = ["-updated_at"]


@admin.register(ScheduledReport)
class ScheduledReportAdmin(admin.ModelAdmin):
    list_display  = ["template", "frequency", "export_format", "is_active", "next_run", "last_run"]
    list_filter   = ["frequency", "is_active", "export_format"]
    readonly_fields = ["created_at", "updated_at", "last_run"]
    ordering      = ["next_run"]


@admin.register(ReportExecution)
class ReportExecutionAdmin(admin.ModelAdmin):
    list_display  = ["report_type", "status", "triggered_by", "is_scheduled", "started_at", "completed_at"]
    list_filter   = ["report_type", "status", "is_scheduled"]
    search_fields = ["triggered_by__email"]
    readonly_fields = [
        "template", "schedule", "report_type", "config_snapshot",
        "export_format", "status", "result_data", "error_message",
        "triggered_by", "is_scheduled", "started_at", "completed_at",
    ]
    ordering      = ["-started_at"]