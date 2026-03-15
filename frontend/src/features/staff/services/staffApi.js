/**
 * src/features/staff/services/staffApi.js
 *
 * All API calls for the Staff Management module.
 * Uses the shared axios instance from src/services/api.js which:
 *  - automatically attaches Bearer token from localStorage('accessToken')
 *  - handles 401 / token refresh transparently
 *
 * Axios baseURL = http://localhost:8000/api  → paths start from /staff
 */

import api from '../../../services/api';

const BASE = '/staff';

// ─── STAFF PROFILES ──────────────────────────────────────────────────────────

export const staffMembersApi = {
  /** GET /staff/members/?role=&online_status=&is_active=&search= */
  list: (params) =>
    api.get(`${BASE}/members/`, { params }).then((r) => r.data),

  /** GET /staff/members/<pk>/ */
  detail: (pk) =>
    api.get(`${BASE}/members/${pk}/`).then((r) => r.data),

  /** POST /staff/members/ */
  create: (body) =>
    api.post(`${BASE}/members/`, body).then((r) => r.data),

  /** PATCH /staff/members/<pk>/ */
  update: (pk, body) =>
    api.patch(`${BASE}/members/${pk}/`, body).then((r) => r.data),

  /** DELETE /staff/members/<pk>/ */
  remove: (pk) =>
    api.delete(`${BASE}/members/${pk}/`).then((r) => r.data),

  /** POST /staff/members/<pk>/promote/ */
  promote: (pk, body) =>
    api.post(`${BASE}/members/${pk}/promote/`, body).then((r) => r.data),

  /** POST /staff/members/<pk>/temp-role/ */
  assignTempRole: (pk, body) =>
    api.post(`${BASE}/members/${pk}/temp-role/`, body).then((r) => r.data),

  /** DELETE /staff/members/<pk>/temp-role/ */
  removeTempRole: (pk) =>
    api.delete(`${BASE}/members/${pk}/temp-role/`).then((r) => r.data),

  /** POST /staff/members/<pk>/deactivate/ */
  deactivate: (pk, body) =>
    api.post(`${BASE}/members/${pk}/deactivate/`, body).then((r) => r.data),

  /** POST /staff/members/<pk>/reactivate/ */
  reactivate: (pk) =>
    api.post(`${BASE}/members/${pk}/reactivate/`).then((r) => r.data),
};

// ─── MONITORING & PRESENCE ────────────────────────────────────────────────────

export const monitoringApi = {
  /** GET /staff/monitoring/ */
  overview: (params) =>
    api.get(`${BASE}/monitoring/`, { params }).then((r) => r.data),

  /** POST /staff/presence/ — { status, current_task } */
  updatePresence: (body) =>
    api.post(`${BASE}/presence/`, body).then((r) => r.data),
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  /** GET /staff/dashboard/ */
  get: () =>
    api.get(`${BASE}/dashboard/`).then((r) => r.data),
};

// ─── SHIFTS ───────────────────────────────────────────────────────────────────

export const shiftsApi = {
  /** GET /staff/shifts/?staff_id=&status= */
  list: (params) =>
    api.get(`${BASE}/shifts/`, { params }).then((r) => r.data),

  /** GET /staff/shifts/<pk>/ */
  detail: (pk) =>
    api.get(`${BASE}/shifts/${pk}/`).then((r) => r.data),

  /** POST /staff/shifts/ */
  create: (body) =>
    api.post(`${BASE}/shifts/`, body).then((r) => r.data),

  /** PATCH /staff/shifts/<pk>/ */
  update: (pk, body) =>
    api.patch(`${BASE}/shifts/${pk}/`, body).then((r) => r.data),

  /** DELETE /staff/shifts/<pk>/ */
  remove: (pk) =>
    api.delete(`${BASE}/shifts/${pk}/`).then((r) => r.data),
};

// ─── ACTIVITY LOGS ────────────────────────────────────────────────────────────

export const activityLogsApi = {
  /** GET /staff/activity-logs/?staff=&action_type=&date_from=&date_to= */
  list: (params) =>
    api.get(`${BASE}/activity-logs/`, { params }).then((r) => r.data),

  /** GET /staff/activity-logs/me/ */
  mine: () =>
    api.get(`${BASE}/activity-logs/me/`).then((r) => r.data),
};

// ─── CLEANING TASKS ───────────────────────────────────────────────────────────

export const cleaningApi = {
  /** GET /staff/cleaning/?status=&room=&priority= */
  list: (params) =>
    api.get(`${BASE}/cleaning/`, { params }).then((r) => r.data),

  /** GET /staff/cleaning/<pk>/ */
  detail: (pk) =>
    api.get(`${BASE}/cleaning/${pk}/`).then((r) => r.data),

  /** POST /staff/cleaning/ */
  create: (body) =>
    api.post(`${BASE}/cleaning/`, body).then((r) => r.data),

  /** PATCH /staff/cleaning/<pk>/ */
  update: (pk, body) =>
    api.patch(`${BASE}/cleaning/${pk}/`, body).then((r) => r.data),

  /** PATCH /staff/cleaning/<pk>/status/ */
  updateStatus: (pk, body) =>
    api.patch(`${BASE}/cleaning/${pk}/status/`, body).then((r) => r.data),
};

// ─── MAINTENANCE TASKS ────────────────────────────────────────────────────────

export const maintenanceApi = {
  /** GET /staff/maintenance/?status=&room=&priority= */
  list: (params) =>
    api.get(`${BASE}/maintenance/`, { params }).then((r) => r.data),

  /** GET /staff/maintenance/<pk>/ */
  detail: (pk) =>
    api.get(`${BASE}/maintenance/${pk}/`).then((r) => r.data),

  /** POST /staff/maintenance/ */
  create: (body) =>
    api.post(`${BASE}/maintenance/`, body).then((r) => r.data),

  /** PATCH /staff/maintenance/<pk>/ */
  update: (pk, body) =>
    api.patch(`${BASE}/maintenance/${pk}/`, body).then((r) => r.data),

  /** PATCH /staff/maintenance/<pk>/status/ */
  updateStatus: (pk, body) =>
    api.patch(`${BASE}/maintenance/${pk}/status/`, body).then((r) => r.data),
};

// ─── INCIDENT LOGS ────────────────────────────────────────────────────────────

export const incidentsApi = {
  /** GET /staff/incidents/ */
  list: (params) =>
    api.get(`${BASE}/incidents/`, { params }).then((r) => r.data),

  /** GET /staff/incidents/<pk>/ */
  detail: (pk) =>
    api.get(`${BASE}/incidents/${pk}/`).then((r) => r.data),

  /** POST /staff/incidents/ */
  create: (body) =>
    api.post(`${BASE}/incidents/`, body).then((r) => r.data),

  /** PATCH /staff/incidents/<pk>/ */
  update: (pk, body) =>
    api.patch(`${BASE}/incidents/${pk}/`, body).then((r) => r.data),
};

// ─── REPORTS ──────────────────────────────────────────────────────────────────

export const reportsApi = {
  /**
   * GET /staff/reports/
   * @param {'bookings'|'revenue'|'occupancy'|'guests'|'staff'} type
   * @param {'daily'|'weekly'|'monthly'|'yearly'} period
   * @param {string} [startDate] YYYY-MM-DD
   * @param {string} [endDate]   YYYY-MM-DD
   */
  get: (type, period = 'monthly', startDate, endDate) =>
    api
      .get(`${BASE}/reports/`, {
        params: {
          type,
          period,
          ...(startDate && { start_date: startDate }),
          ...(endDate   && { end_date:   endDate   }),
        },
      })
      .then((r) => r.data),

  /** CSV download — returns blob */
  exportCsv: (type, period = 'monthly', startDate, endDate) =>
    api
      .get(`${BASE}/reports/`, {
        params: {
          type,
          period,
          export: 'csv',
          ...(startDate && { start_date: startDate }),
          ...(endDate   && { end_date:   endDate   }),
        },
        responseType: 'blob',
      })
      .then((r) => r.data),
};

// ─── ROLE CONSTANTS (mirrors backend StaffRole) ───────────────────────────────

export const STAFF_ROLES = {
  ADMIN:        'admin',
  MANAGER:      'manager',
  RECEPTIONIST: 'receptionist',
  FRONT_DESK:   'front_desk',
  HOUSEKEEPING: 'housekeeping',
  MAINTENANCE:  'maintenance',
  SECURITY:     'security',
};

export const ROLE_LABELS = {
  admin:        'Admin',
  manager:      'Manager',
  receptionist: 'Receptionist',
  front_desk:   'Front Desk',
  housekeeping: 'Housekeeping',
  maintenance:  'Maintenance',
  security:     'Security',
};

export const CLEANING_STATUS_LABELS = {
  dirty:    'Dirty',
  cleaning: 'Cleaning',
  clean:    'Clean / Ready',
};

export const MAINTENANCE_STATUS_LABELS = {
  pending:     'Pending',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

export const ONLINE_STATUS_LABELS = {
  online:  'Online',
  offline: 'Offline',
  idle:    'Idle',
};

export const INCIDENT_TYPE_LABELS = {
  lost_item:   'Lost Item',
  disturbance: 'Disturbance',
  trespassing: 'Trespassing',
  medical:     'Medical Emergency',
  theft:       'Theft',
  other:       'Other',
};

export const SEVERITY_LABELS = {
  low:    'Low',
  medium: 'Medium',
  high:   'High',
};

export const PRIORITY_LABELS = {
  1: 'High',
  2: 'Normal',
  3: 'Low',
};