from django.urls import path
from . import views
from .activation_views import StaffActivateView

app_name = "staff"

urlpatterns = [

    # ── Dashboard ─────────────────────────────────────────────────────────────
    path("dashboard/",
         views.AdminDashboardView.as_view(),
         name="dashboard"),

    # ── Self-service presence heartbeat ──────────────────────────────────────
    path("presence/",
         views.StaffPresenceUpdateView.as_view(),
         name="presence"),

    # ── Staff member CRUD ─────────────────────────────────────────────────────
    path("members/",
         views.StaffListCreateView.as_view(),
         name="staff-list-create"),
    path("members/<int:pk>/",
         views.StaffDetailView.as_view(),
         name="staff-detail"),
    path("members/<int:pk>/promote/",
         views.StaffRoleChangeView.as_view(),
         name="staff-promote"),
    path("members/<int:pk>/temp-role/",
         views.StaffTempRoleView.as_view(),
         name="staff-temp-role"),
    path("members/<int:pk>/deactivate/",
         views.StaffDeactivateView.as_view(),
         name="staff-deactivate"),
    path("members/<int:pk>/dependencies/",
         views.StaffDependenciesView.as_view(),
         name="staff-dependencies"),
    path("members/<int:pk>/reactivate/",
         views.StaffReactivateView.as_view(),
         name="staff-reactivate"),

    # ── Monitoring & logs ─────────────────────────────────────────────────────
    path("monitoring/",
         views.StaffMonitoringView.as_view(),
         name="monitoring"),
    path("activity-logs/",
         views.StaffActivityLogListView.as_view(),
         name="activity-logs"),
    path("activity-logs/me/",
         views.MyActivityLogView.as_view(),
         name="activity-logs-me"),

    # ── Shifts ────────────────────────────────────────────────────────────────
    path("shifts/",
         views.ShiftListCreateView.as_view(),
         name="shift-list-create"),
    path("shifts/<int:pk>/",
         views.ShiftDetailView.as_view(),
         name="shift-detail"),
    path("my-shifts/",
         views.MyShiftView.as_view(),
         name="my-shifts"),

    # ── Cleaning tasks ────────────────────────────────────────────────────────
    path("cleaning/",
         views.CleaningTaskListCreateView.as_view(),
         name="cleaning-list-create"),
    path("cleaning/<int:pk>/assign/",
         views.CleaningTaskAssignView.as_view(),
         name="cleaning-assign"),
    path("cleaning/<int:pk>/status/",
         views.CleaningTaskStatusView.as_view(),
         name="cleaning-status"),
    path("cleaning/<int:pk>/",
         views.CleaningTaskDetailView.as_view(),
         name="cleaning-detail"),

    # ── Maintenance tasks ─────────────────────────────────────────────────────
    path("maintenance/",
         views.MaintenanceTaskListCreateView.as_view(),
         name="maintenance-list-create"),
    path("maintenance/<int:pk>/status/",
         views.MaintenanceTaskStatusView.as_view(),
         name="maintenance-status"),
    path("maintenance/<int:pk>/notes/",
         views.MaintenanceTaskNotesView.as_view(),
         name="maintenance-notes"),
    path("maintenance/<int:pk>/",
         views.MaintenanceTaskDetailView.as_view(),
         name="maintenance-detail"),

    # ── Maintenance Requests (NEW — reporting layer) ──────────────────────────
    # ⚠ Sub-actions MUST come before maintenance-requests/<pk>/
    path("maintenance-requests/",
         views.MaintenanceRequestListCreateView.as_view(),
         name="maintenance-request-list-create"),
    path("maintenance-requests/<int:pk>/review/",
         views.MaintenanceRequestReviewView.as_view(),
         name="maintenance-request-review"),
    path("maintenance-requests/<int:pk>/convert/",
         views.MaintenanceRequestConvertView.as_view(),
         name="maintenance-request-convert"),
    path("maintenance-requests/<int:pk>/",
         views.MaintenanceRequestDetailView.as_view(),
         name="maintenance-request-detail"),

    # ── Incident logs ─────────────────────────────────────────────────────────
    path("incidents/",
         views.IncidentLogListCreateView.as_view(),
         name="incident-list-create"),
    path("incidents/<int:pk>/escalate/",
         views.IncidentEscalateView.as_view(),
         name="incident-escalate"),
    path("incidents/<int:pk>/",
         views.IncidentLogDetailView.as_view(),
         name="incident-detail"),

    # ── Reports & analytics ───────────────────────────────────────────────────
    path("reports/",
         views.ReportView.as_view(),
         name="reports"),

    # ── Account activation ────────────────────────────────────────────────────
    path(
        "activate/<str:uidb64>/<str:token>/",
        StaffActivateView.as_view(),
        name="staff-activate",
    ),
]