"""
staff/urls.py  — UPDATED version with activation routes added
─────────────────────────────────────────────────────────────
Two new patterns added at the bottom. All existing routes are unchanged.

New endpoints:
  GET  /api/staff/activate/<uidb64>/<token>/  — pre-check token validity
  POST /api/staff/activate/<uidb64>/<token>/  — set password & activate account
"""

from django.urls import path
from . import views
from .activation_views import StaffActivateView   # ← new import

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

    # ── Cleaning tasks ────────────────────────────────────────────────────────
    path("cleaning/",
         views.CleaningTaskListCreateView.as_view(),
         name="cleaning-list-create"),

    path("cleaning/<int:pk>/",
         views.CleaningTaskDetailView.as_view(),
         name="cleaning-detail"),

    path("cleaning/<int:pk>/status/",
         views.CleaningTaskStatusView.as_view(),
         name="cleaning-status"),

    # ── Maintenance tasks ─────────────────────────────────────────────────────
    path("maintenance/",
         views.MaintenanceTaskListCreateView.as_view(),
         name="maintenance-list-create"),

    path("maintenance/<int:pk>/",
         views.MaintenanceTaskDetailView.as_view(),
         name="maintenance-detail"),

    path("maintenance/<int:pk>/status/",
         views.MaintenanceTaskStatusView.as_view(),
         name="maintenance-status"),

    # ── Incident logs (Security) ──────────────────────────────────────────────
    path("incidents/",
         views.IncidentLogListCreateView.as_view(),
         name="incident-list-create"),

    path("incidents/<int:pk>/",
         views.IncidentLogDetailView.as_view(),
         name="incident-detail"),

    # ── Reports & analytics ───────────────────────────────────────────────────
    path("reports/",
         views.ReportView.as_view(),
         name="reports"),

    # ── Account activation (NEW) ──────────────────────────────────────────────
    # GET  — pre-check: is the token still valid? (called on page load)
    # POST — set password + activate account
    path(
        "activate/<str:uidb64>/<str:token>/",
        StaffActivateView.as_view(),
        name="staff-activate",
    ),
]