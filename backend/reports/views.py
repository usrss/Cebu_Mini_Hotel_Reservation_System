"""
reports/views.py

API views for the custom report generation feature.

Endpoints:
  POST   /api/reports/run/                    — Ad-hoc report run
  GET    /api/reports/executions/             — Execution history
  GET    /api/reports/executions/<id>/        — Single execution detail

  GET    /api/reports/templates/              — List templates (own + shared)
  POST   /api/reports/templates/             — Create template
  GET    /api/reports/templates/<id>/         — Template detail
  PUT    /api/reports/templates/<id>/         — Update template
  DELETE /api/reports/templates/<id>/         — Delete template
  POST   /api/reports/templates/<id>/run/     — Run from saved template

  GET    /api/reports/schedules/             — List schedules
  POST   /api/reports/schedules/             — Create schedule
  GET    /api/reports/schedules/<id>/         — Schedule detail
  PATCH  /api/reports/schedules/<id>/         — Update schedule
  DELETE /api/reports/schedules/<id>/         — Delete schedule
  POST   /api/reports/schedules/<id>/toggle/  — Activate / deactivate

  GET    /api/reports/meta/                   — Available types, metrics, options
"""

import logging

from django.http        import HttpResponse
from django.utils       import timezone
from rest_framework     import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response    import Response
from rest_framework.views       import APIView

from staff.permissions import CanViewReports, IsAdminStaff

from .models      import (
    ExportFormat, ReportExecution, ReportTemplate, ReportType,
    ScheduledReport, ScheduleFrequency, ExecutionStatus,
)
from .serializers import (
    ReportExecutionListSerializer,
    ReportExecutionSerializer,
    ReportTemplateListSerializer,
    ReportTemplateSerializer,
    RunReportSerializer,
    ScheduledReportSerializer,
    METRICS_BY_TYPE,
    GROUP_BY_OPTIONS,
    PERIOD_OPTIONS,
)
from .services import (
    EnhancedReportService,
    export_csv, export_excel, export_pdf,
    run_report_and_log,
)

logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_role(user) -> str | None:
    profile = getattr(user, "staff_profile", None)
    return getattr(profile, "effective_role", None) if profile else None


def _template_qs(user):
    """Templates the user can see: own templates + shared templates."""
    return ReportTemplate.objects.filter(
        created_by=user
    ) | ReportTemplate.objects.filter(is_shared=True)


def _make_export_response(data: dict, fmt: str, report_type: str) -> HttpResponse:
    """Build an HTTP download response for CSV, Excel, or PDF."""
    ts = timezone.now().strftime("%Y%m%d_%H%M")
    if fmt == ExportFormat.CSV:
        content  = export_csv(data, report_type)
        response = HttpResponse(content, content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="{report_type}_{ts}.csv"'
        )
    elif fmt == ExportFormat.PDF:
        content  = export_pdf(data, report_type)
        response = HttpResponse(content, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="{report_type}_{ts}.pdf"'
        )
    elif fmt == ExportFormat.EXCEL:
        content  = export_excel(data, report_type)
        response = HttpResponse(
            content,
            content_type=(
                "application/vnd.openxmlformats-officedocument"
                ".spreadsheetml.sheet"
            ),
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{report_type}_{ts}.xlsx"'
        )
    else:
        # Unknown format — return JSON as fallback
        response = HttpResponse(
            content_type="application/json"
        )
        import json as _json
        response.write(_json.dumps(data))
    return response


# Fix #4 — _run_and_log and notification helpers have been moved to services.py
# (run_report_and_log) to prevent circular imports when tasks.py loads at
# Celery startup. This alias keeps all existing call sites working unchanged.
_run_and_log = run_report_and_log


# ═══════════════════════════════════════════════════════════════════════════════
# AD-HOC REPORT RUN
# ═══════════════════════════════════════════════════════════════════════════════

class RunReportView(APIView):
    """
    POST /api/reports/run/

    Run a one-off report with custom config.
    Returns JSON data or a file download depending on export_format.

    Body:
      {
        "report_type":   "revenue",
        "export_format": "json" | "csv" | "pdf" | "excel",
        "config": {
          "period":   "monthly",
          "metrics":  ["total_revenue", "net_revenue"],
          "group_by": "day",
          "filters":  { "room_type": "suite" }
        },
        "template_id": null   // optional — log result against a saved template
      }
    """
    permission_classes = [IsAuthenticated, CanViewReports]

    def post(self, request):
        serializer = RunReportSerializer(
            data=request.data,
            context={"request": request},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        vd            = serializer.validated_data
        report_type   = vd["report_type"]
        config        = vd["config"]
        export_format = vd["export_format"]
        template_id   = vd.get("template_id")

        template = None
        if template_id:
            try:
                template = _template_qs(request.user).get(pk=template_id)
            except ReportTemplate.DoesNotExist:
                return Response(
                    {"detail": "Template not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        data, execution = _run_and_log(
            report_type   = report_type,
            config        = config,
            export_format = export_format,
            user          = request.user,
            template      = template,
        )

        if execution.status == ExecutionStatus.FAILED:
            return Response(
                {"detail": "Report generation failed.", "error": execution.error_message},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if export_format != ExportFormat.JSON:
            return _make_export_response(data, export_format, report_type)

        return Response({
            "execution_id": execution.pk,
            "data":         data,
        }, status=status.HTTP_200_OK)


# ═══════════════════════════════════════════════════════════════════════════════
# EXECUTION HISTORY
# ═══════════════════════════════════════════════════════════════════════════════

class ReportExecutionListView(generics.ListAPIView):
    """
    GET /api/reports/executions/
    Admins see all executions. Managers see only their own.
    """
    serializer_class   = ReportExecutionListSerializer
    permission_classes = [IsAuthenticated, CanViewReports]

    def get_queryset(self):
        qs = ReportExecution.objects.select_related(
            "template", "triggered_by"
        ).order_by("-started_at")

        role = _get_role(self.request.user)
        if role != "admin":
            qs = qs.filter(triggered_by=self.request.user)

        # Optional filters
        p = self.request.query_params
        if p.get("report_type"):
            qs = qs.filter(report_type=p["report_type"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])

        return qs


class ReportExecutionDetailView(generics.RetrieveAPIView):
    """
    GET /api/reports/executions/<id>/
    Full execution detail including result_data.
    """
    serializer_class   = ReportExecutionSerializer
    permission_classes = [IsAuthenticated, CanViewReports]

    def get_queryset(self):
        qs = ReportExecution.objects.select_related("template", "triggered_by")
        role = _get_role(self.request.user)
        if role != "admin":
            qs = qs.filter(triggered_by=self.request.user)
        return qs


class ReportExecutionDownloadView(APIView):
    """
    GET /api/reports/executions/<id>/download/?format=csv|pdf|excel

    Re-export a previous execution result.
    Strategy:
      1. If result_data is stored → render and return it directly (fast path).
      2. If result_data is NULL (old executions before storage was added, or
         file-stream-only runs) → re-run the report from config_snapshot and
         return the file. The execution record is NOT updated.
    """
    permission_classes = [IsAuthenticated, CanViewReports]

    def get(self, request, pk):
        role = _get_role(request.user)

        try:
            if role == "admin":
                execution = ReportExecution.objects.get(pk=pk)
            else:
                execution = ReportExecution.objects.get(
                    pk=pk,
                    triggered_by=request.user,
                )
        except ReportExecution.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if execution.status != ExecutionStatus.SUCCESS:
            return Response(
                {"detail": "This execution did not complete successfully."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fmt = request.query_params.get("format", "csv")
        if fmt not in ("csv", "pdf", "excel"):
            return Response(
                {"detail": "format must be one of: csv, pdf, excel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Fast path: result_data already stored ─────────────────────────────
        if execution.result_data:
            return _make_export_response(
                execution.result_data,
                fmt,
                execution.report_type,
            )

        # ── Slow path: re-run from config_snapshot ────────────────────────────
        # Covers old executions created before result_data storage was added,
        # or any execution where result_data was not persisted.
        config = execution.config_snapshot
        if not config:
            return Response(
                {"detail": "No config available to regenerate this report."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            data = EnhancedReportService.run(
                execution.report_type,
                config,
                user=request.user,
            )
        except Exception as exc:
            logger.exception(
                "Re-run failed for execution %s during download: %s", pk, exc
            )
            return Response(
                {"detail": f"Failed to regenerate report: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return _make_export_response(data, fmt, execution.report_type)


# ═══════════════════════════════════════════════════════════════════════════════
# REPORT TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════════

class ReportTemplateListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/reports/templates/   — List own + shared templates
    POST /api/reports/templates/   — Create new template
    """
    permission_classes = [IsAuthenticated, CanViewReports]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ReportTemplateSerializer
        return ReportTemplateListSerializer

    def get_queryset(self):
        qs = _template_qs(self.request.user).distinct()
        if self.request.query_params.get("report_type"):
            qs = qs.filter(report_type=self.request.query_params["report_type"])
        return qs.order_by("-updated_at")

    def get_serializer_context(self):
        return {"request": self.request}


class ReportTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/reports/templates/<id>/
    PUT    /api/reports/templates/<id>/
    PATCH  /api/reports/templates/<id>/
    DELETE /api/reports/templates/<id>/
    """
    serializer_class   = ReportTemplateSerializer
    permission_classes = [IsAuthenticated, CanViewReports]

    def get_queryset(self):
        return _template_qs(self.request.user).distinct()

    def get_serializer_context(self):
        return {"request": self.request}

    def update(self, request, *args, **kwargs):
        template = self.get_object()
        if template.created_by != request.user:
            return Response(
                {"detail": "You can only edit your own templates."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        template = self.get_object()
        if template.created_by != request.user:
            return Response(
                {"detail": "You can only delete your own templates."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class RunFromTemplateView(APIView):
    """
    POST /api/reports/templates/<id>/run/

    Run a report using a saved template's config.
    Optionally override export_format.

    Body (optional):
      {
        "export_format": "csv",
        "config_overrides": { "period": "weekly" }
      }
    """
    permission_classes = [IsAuthenticated, CanViewReports]

    def post(self, request, pk):
        try:
            template = _template_qs(request.user).distinct().get(pk=pk)
        except ReportTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)

        # Merge base config with any overrides from request body
        config = {**template.config}
        overrides = request.data.get("config_overrides", {})
        if overrides:
            config.update(overrides)

        export_format = request.data.get("export_format", ExportFormat.JSON)

        data, execution = _run_and_log(
            report_type   = template.report_type,
            config        = config,
            export_format = export_format,
            user          = request.user,
            template      = template,
        )

        if execution.status == ExecutionStatus.FAILED:
            return Response(
                {"detail": "Report generation failed.", "error": execution.error_message},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if export_format != ExportFormat.JSON:
            return _make_export_response(data, export_format, template.report_type)

        return Response({
            "execution_id": execution.pk,
            "template_id":  template.pk,
            "data":         data,
        }, status=status.HTTP_200_OK)


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEDULED REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

class ScheduledReportListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/reports/schedules/   — List schedules
    POST /api/reports/schedules/   — Create schedule
    """
    serializer_class   = ScheduledReportSerializer
    permission_classes = [IsAuthenticated, CanViewReports]

    def get_queryset(self):
        qs = ScheduledReport.objects.select_related(
            "template", "created_by"
        )
        role = _get_role(self.request.user)
        if role != "admin":
            qs = qs.filter(created_by=self.request.user)
        return qs.order_by("next_run")

    def get_serializer_context(self):
        return {"request": self.request}


class ScheduledReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/reports/schedules/<id>/
    PATCH  /api/reports/schedules/<id>/
    DELETE /api/reports/schedules/<id>/
    """
    serializer_class   = ScheduledReportSerializer
    permission_classes = [IsAuthenticated, CanViewReports]

    def get_queryset(self):
        qs = ScheduledReport.objects.select_related("template", "created_by")
        role = _get_role(self.request.user)
        if role != "admin":
            qs = qs.filter(created_by=self.request.user)
        return qs

    def get_serializer_context(self):
        return {"request": self.request}

    def update(self, request, *args, **kwargs):
        schedule = self.get_object()
        if schedule.created_by != request.user and _get_role(request.user) != "admin":
            return Response(
                {"detail": "You can only edit your own schedules."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        schedule = self.get_object()
        if schedule.created_by != request.user and _get_role(request.user) != "admin":
            return Response(
                {"detail": "You can only delete your own schedules."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class ScheduleToggleView(APIView):
    """
    POST /api/reports/schedules/<id>/toggle/
    Activate or deactivate a scheduled report.
    """
    permission_classes = [IsAuthenticated, CanViewReports]

    def post(self, request, pk):
        try:
            qs = ScheduledReport.objects.all()
            if _get_role(request.user) != "admin":
                qs = qs.filter(created_by=request.user)
            schedule = qs.get(pk=pk)
        except ScheduledReport.DoesNotExist:
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)

        schedule.is_active = not schedule.is_active
        schedule.save(update_fields=["is_active", "updated_at"])

        action = "activated" if schedule.is_active else "deactivated"
        return Response({
            "detail":    f"Schedule {action}.",
            "is_active": schedule.is_active,
        })


# ═══════════════════════════════════════════════════════════════════════════════
# META — Available options for the frontend form builder
# ═══════════════════════════════════════════════════════════════════════════════

class ReportMetaView(APIView):
    """
    GET /api/reports/meta/
    Returns all available report types, metrics, group_by options, and periods.
    Used by the frontend to dynamically build the report configuration form.
    """
    permission_classes = [IsAuthenticated, CanViewReports]

    def get(self, request):
        role = _get_role(request.user)

        # Fix #2 — use the already-imported ReportType directly
        report_types = [
            {"value": rt.value, "label": rt.label}
            for rt in ReportType
        ]

        # Managers cannot access the staff report
        if role == "manager":
            report_types = [r for r in report_types if r["value"] != "staff"]

        metrics_map = {
            rt: metrics
            for rt, metrics in METRICS_BY_TYPE.items()
        }

        # Fix #3 — expose valid_group_by_per_type so the frontend stays
        # in sync with the backend without hardcoding it in two places.
        from .serializers import VALID_GROUP_BY_PER_TYPE

        return Response({
            "report_types":           report_types,
            "metrics_by_type":        metrics_map,
            "group_by_options":       GROUP_BY_OPTIONS,
            "valid_group_by_per_type": VALID_GROUP_BY_PER_TYPE,  # Fix #3
            "period_options":         PERIOD_OPTIONS,
            "export_formats": [
                {"value": f.value, "label": f.label}
                for f in ExportFormat
            ],
            # Fix #2 — use the already-imported ScheduleFrequency directly
            "schedule_frequencies": [
                {"value": f.value, "label": f.label}
                for f in ScheduleFrequency
            ],
            "role": role,
        })