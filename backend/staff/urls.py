"""
staff/urls.py

All staff-module endpoints namespaced under /api/staff/.

URL Layout:
  /api/staff/dashboard/                       — Admin/Manager operational overview
  /api/staff/presence/                        — Self-service heartbeat

  /api/staff/members/                         — List / create staff (Admin/Manager)
  /api/staff/members/<pk>/                    — Retrieve / update / delete
  /api/staff/members/<pk>/promote/            — Role change
  /api/staff/members/<pk>/temp-role/          — Assign / remove temp role
  /api/staff/members/<pk>/deactivate/         — Deactivate account
  /api/staff/members/<pk>/reactivate/         — Reactivate account

  /api/staff/monitoring/                      — Real-time staff overview
  /api/staff/activity-logs/                   — Full audit trail
  /api/staff/activity-logs/me/                — Own activity log

  /api/staff/shifts/                          — List / create shifts
  /api/staff/shifts/<pk>/                     — Detail / update / delete shift

  /api/staff/cleaning/                        — List / create cleaning tasks
  /api/staff/cleaning/<pk>/                   — Detail / update
  /api/staff/cleaning/<pk>/status/            — Status transition

  /api/staff/maintenance/                     — List / create maintenance tasks
  /api/staff/maintenance/<pk>/                — Detail / update
  /api/staff/maintenance/<pk>/status/         — Status transition

  /api/staff/incidents/                       — List / create incident logs
  /api/staff/incidents/<pk>/                  — Detail / update

  /api/staff/reports/                         — Generate & export reports
"""

from django.urls import path
from . import views

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
]