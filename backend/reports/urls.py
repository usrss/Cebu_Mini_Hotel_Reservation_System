"""
reports/urls.py

All routes under /api/reports/
"""
from django.urls import path
from .views import (
    RunReportView,
    ReportExecutionListView,
    ReportExecutionDetailView,
    ReportExecutionDownloadView,
    ReportTemplateListCreateView,
    ReportTemplateDetailView,
    RunFromTemplateView,
    ScheduledReportListCreateView,
    ScheduledReportDetailView,
    ScheduleToggleView,
    ReportMetaView,
)

app_name = "reports"

urlpatterns = [

    # ── Meta ──────────────────────────────────────────────────────────────────
    path("meta/",
         ReportMetaView.as_view(),
         name="meta"),

    # ── Ad-hoc run ────────────────────────────────────────────────────────────
    path("run/",
         RunReportView.as_view(),
         name="run"),

    # ── Execution history ─────────────────────────────────────────────────────
    path("executions/",
         ReportExecutionListView.as_view(),
         name="execution-list"),
    path("executions/<int:pk>/",
         ReportExecutionDetailView.as_view(),
         name="execution-detail"),
    path("executions/<int:pk>/download/",
         ReportExecutionDownloadView.as_view(),
         name="execution-download"),

    # ── Templates ─────────────────────────────────────────────────────────────
    path("templates/",
         ReportTemplateListCreateView.as_view(),
         name="template-list-create"),
    path("templates/<int:pk>/",
         ReportTemplateDetailView.as_view(),
         name="template-detail"),
    path("templates/<int:pk>/run/",
         RunFromTemplateView.as_view(),
         name="template-run"),

    # ── Schedules ─────────────────────────────────────────────────────────────
    path("schedules/",
         ScheduledReportListCreateView.as_view(),
         name="schedule-list-create"),
    path("schedules/<int:pk>/",
         ScheduledReportDetailView.as_view(),
         name="schedule-detail"),
    path("schedules/<int:pk>/toggle/",
         ScheduleToggleView.as_view(),
         name="schedule-toggle"),
]