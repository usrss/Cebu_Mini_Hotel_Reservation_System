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
  list: (params) =>
    api.get(`${BASE}/members/`, { params }).then((r) => r.data),
  detail: (pk) =>
    api.get(`${BASE}/members/${pk}/`).then((r) => r.data),
  create: (body) =>
    api.post(`${BASE}/members/`, body).then((r) => r.data),
  update: (pk, body) =>
    api.patch(`${BASE}/members/${pk}/`, body).then((r) => r.data),
  remove: (pk) =>
    api.delete(`${BASE}/members/${pk}/`).then((r) => r.data),
  promote: (pk, body) =>
    api.post(`${BASE}/members/${pk}/promote/`, body).then((r) => r.data),
  assignTempRole: (pk, body) =>
    api.post(`${BASE}/members/${pk}/temp-role/`, body).then((r) => r.data),
  removeTempRole: (pk) =>
    api.delete(`${BASE}/members/${pk}/temp-role/`).then((r) => r.data),
  deactivate: (pk, body) =>
    api.post(`${BASE}/members/${pk}/deactivate/`, body).then((r) => r.data),
  reactivate: (pk) =>
    api.post(`${BASE}/members/${pk}/reactivate/`).then((r) => r.data),
};

// ─── MONITORING & PRESENCE ────────────────────────────────────────────────────

export const monitoringApi = {
  overview: (params) =>
    api.get(`${BASE}/monitoring/`, { params }).then((r) => r.data),
  updatePresence: (body) =>
    api.post(`${BASE}/presence/`, body).then((r) => r.data),
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  get: () =>
    api.get(`${BASE}/dashboard/`).then((r) => r.data),
};

// ─── SHIFTS  (Admin + Manager only) ──────────────────────────────────────────

export const shiftsApi = {
  list: (params) =>
    api.get(`${BASE}/shifts/`, { params }).then((r) => r.data),
  detail: (pk) =>
    api.get(`${BASE}/shifts/${pk}/`).then((r) => r.data),
  create: (body) =>
    api.post(`${BASE}/shifts/`, body).then((r) => r.data),
  update: (pk, body) =>
    api.patch(`${BASE}/shifts/${pk}/`, body).then((r) => r.data),
  remove: (pk) =>
    api.delete(`${BASE}/shifts/${pk}/`).then((r) => r.data),
};

// ─── MY SHIFTS  (all active staff roles) ─────────────────────────────────────

export const myShiftsApi = {
  list: () =>
    api.get(`${BASE}/my-shifts/`).then((r) => r.data),
};

// ─── ACTIVITY LOGS ────────────────────────────────────────────────────────────

export const activityLogsApi = {
  list: (params) =>
    api.get(`${BASE}/activity-logs/`, { params }).then((r) => r.data),
  mine: () =>
    api.get(`${BASE}/activity-logs/me/`).then((r) => r.data),
};

// ─── CLEANING TASKS ───────────────────────────────────────────────────────────

export const cleaningApi = {
  list: (params) =>
    api.get(`${BASE}/cleaning/`, { params }).then((r) => r.data),
  detail: (pk) =>
    api.get(`${BASE}/cleaning/${pk}/`).then((r) => r.data),
  create: (body) =>
    api.post(`${BASE}/cleaning/`, body).then((r) => r.data),
  update: (pk, body) =>
    api.patch(`${BASE}/cleaning/${pk}/`, body).then((r) => r.data),
  updateStatus: (pk, body) =>
    api.patch(`${BASE}/cleaning/${pk}/status/`, body).then((r) => r.data),
  assign: (pk, body) =>
    api.patch(`${BASE}/cleaning/${pk}/assign/`, body).then((r) => r.data),
};

// ─── MAINTENANCE TASKS ────────────────────────────────────────────────────────

export const maintenanceApi = {
  list: (params) =>
    api.get(`${BASE}/maintenance/`, { params }).then((r) => r.data),
  detail: (pk) =>
    api.get(`${BASE}/maintenance/${pk}/`).then((r) => r.data),
  create: (body) =>
    api.post(`${BASE}/maintenance/`, body).then((r) => r.data),
  update: (pk, body) =>
    api.patch(`${BASE}/maintenance/${pk}/`, body).then((r) => r.data),

  /** Update workflow status (pending → in_progress → completed / cancelled). */
  updateStatus: (pk, body) =>
    api.patch(`${BASE}/maintenance/${pk}/status/`, body).then((r) => r.data),

  /** Append a progress note without changing status (maintenance staff). */
  addNotes: (pk, body) =>
    api.patch(`${BASE}/maintenance/${pk}/notes/`, body).then((r) => r.data),
};

// ─── MAINTENANCE REQUESTS (reporting layer — FD + HK) ────────────────────────

export const maintenanceRequestsApi = {
  /** List requests. Admin/Manager: all. FD/HK: own only (scoped server-side). */
  list: (params) =>
    api.get(`${BASE}/maintenance-requests/`, { params }).then((r) => r.data),

  /** Get a single request. */
  detail: (pk) =>
    api.get(`${BASE}/maintenance-requests/${pk}/`).then((r) => r.data),

  /**
   * Submit a new maintenance request.
   * FD + HK + Admin + Manager only.
   * Body: { title, description, room? }
   */
  create: (body) =>
    api.post(`${BASE}/maintenance-requests/`, body).then((r) => r.data),

  /**
   * Admin/Manager marks a request as reviewed.
   * Body: { review_notes? }
   */
  review: (pk, body = {}) =>
    api.patch(`${BASE}/maintenance-requests/${pk}/review/`, body).then((r) => r.data),

  /**
   * Admin/Manager converts a request into a MaintenanceTask.
   * Body: { title, description, priority?, deadline?, assigned_to? }
   * Returns the created MaintenanceTask.
   */
  convert: (pk, body) =>
    api.post(`${BASE}/maintenance-requests/${pk}/convert/`, body).then((r) => r.data),
};

// ─── INCIDENT LOGS ────────────────────────────────────────────────────────────

export const incidentsApi = {
  list: (params) =>
    api.get(`${BASE}/incidents/`, { params }).then((r) => r.data),
  detail: (pk) =>
    api.get(`${BASE}/incidents/${pk}/`).then((r) => r.data),
  create: (body) =>
    api.post(`${BASE}/incidents/`, body).then((r) => r.data),
  update: (pk, body) =>
    api.patch(`${BASE}/incidents/${pk}/`, body).then((r) => r.data),

  /**
   * Cross-module escalation: create a linked MaintenanceTask from an incident.
   * Admin + Security (own incident only).
   * Body: { title, description, room?, priority?, deadline?, assigned_to? }
   * Returns the created MaintenanceTask.
   */
  escalate: (pk, body) =>
    api.post(`${BASE}/incidents/${pk}/escalate/`, body).then((r) => r.data),
};

// ─── REPORTS ──────────────────────────────────────────────────────────────────

export const reportsApi = {
  get: (type, period = 'monthly', startDate, endDate) =>
    api.get(`${BASE}/reports/`, {
      params: {
        type, period,
        ...(startDate && { start_date: startDate }),
        ...(endDate   && { end_date:   endDate   }),
      },
    }).then((r) => r.data),

  exportCsv: (type, period = 'monthly', startDate, endDate) =>
    api.get(`${BASE}/reports/`, {
      params: {
        type, period, export: 'csv',
        ...(startDate && { start_date: startDate }),
        ...(endDate   && { end_date:   endDate   }),
      },
      responseType: 'blob',
    }).then((r) => r.data),
};

// ─── ROLE CONSTANTS ───────────────────────────────────────────────────────────

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
  dirty:    'Pending',
  cleaning: 'In Progress',
  clean:    'Done',
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

/** Severity now includes critical */
export const SEVERITY_LABELS = {
  low:      'Low',
  medium:   'Medium',
  high:     'High',
  critical: 'Critical',
};

/** Incident workflow status labels (new) */
export const INCIDENT_STATUS_LABELS = {
  reported:            'Reported',
  under_investigation: 'Under Investigation',
  resolved:            'Resolved',
};

/** Maintenance request workflow status labels (new) */
export const MAINTENANCE_REQUEST_STATUS_LABELS = {
  pending:           'Pending Review',
  reviewed:          'Reviewed',
  converted_to_task: 'Converted to Task',
};

/** Priority labels — integer keys matching MaintenanceTask.Priority */
export const PRIORITY_LABELS = {
  1: 'High',
  2: 'Medium',
  3: 'Low',
};


export const staffApi = {
  list:        (params)   => staffMembersApi.list(params),
  detail:      (id)       => staffMembersApi.detail(id),
  create:      (body)     => staffMembersApi.create(body),
  update:      (id, body) => staffMembersApi.update(id, body),
  delete:      (id)       => staffMembersApi.remove(id),
  promote:     (id, body) => staffMembersApi.promote(id, body),
  assignTemp:  (id, body) => staffMembersApi.assignTempRole(id, body),
  removeTemp:  (id)       => staffMembersApi.removeTempRole(id),
  deactivate:  (id, body) => staffMembersApi.deactivate(id, body),
  reactivate:  (id)       => staffMembersApi.reactivate(id),
  shifts:      (params)   => shiftsApi.list(params),
  createShift: (body)     => shiftsApi.create(body),
  updateShift: (id, body) => shiftsApi.update(id, body),
  deleteShift: (id)       => shiftsApi.remove(id),
};