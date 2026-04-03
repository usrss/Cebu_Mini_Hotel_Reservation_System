/**
 * src/services/reportsApi.js
 *
 * API client for the custom report generation module.
 * Hits /api/reports/ endpoints (new reports Django app).
 *
 * Uses the shared axios instance from src/services/api.js which:
 *  - automatically attaches Bearer token from localStorage('accessToken')
 *  - handles 401 / token refresh transparently
 */

import api from './api';

const BASE = '/reports';

// ─── Meta ─────────────────────────────────────────────────────────────────────

export const reportMetaApi = {
  /** Returns available report types, metrics, group_by options, periods, formats. */
  get: () =>
    api.get(`${BASE}/meta/`).then((r) => r.data),
};

// ─── Ad-hoc run ───────────────────────────────────────────────────────────────

export const reportRunApi = {
  /**
   * Run a one-off report.
   * @param {object} body
   *   {
   *     report_type:   'revenue',
   *     export_format: 'json' | 'csv' | 'pdf' | 'excel',
   *     config: {
   *       period:   'monthly',
   *       metrics:  ['total_revenue'],
   *       group_by: 'day',
   *       filters:  { room_type: 'suite' }
   *     },
   *     template_id: null
   *   }
   * For json → returns { execution_id, data }
   * For csv/pdf/excel → returns blob (set responseType: 'blob' manually)
   */
  run: (body) =>
    api.post(`${BASE}/run/`, body).then((r) => r.data),

  /** Run with blob response for file downloads. */
  download: (body) =>
    api.post(`${BASE}/run/`, body, { responseType: 'blob' }).then((r) => r.data),
};

// ─── Execution history ────────────────────────────────────────────────────────

export const reportExecutionApi = {
  list: (params) =>
    api.get(`${BASE}/executions/`, { params }).then((r) => r.data),

  detail: (id) =>
    api.get(`${BASE}/executions/${id}/`).then((r) => r.data),

  /** Re-download a previous execution result. format = csv | pdf | excel */
  download: (id, format = 'csv') =>
    api.get(`${BASE}/executions/${id}/download/`, {
      params: { format },
      responseType: 'blob',
    }).then((r) => r.data),
};

// ─── Templates ────────────────────────────────────────────────────────────────

export const reportTemplateApi = {
  list: (params) =>
    api.get(`${BASE}/templates/`, { params }).then((r) => r.data),

  detail: (id) =>
    api.get(`${BASE}/templates/${id}/`).then((r) => r.data),

  create: (body) =>
    api.post(`${BASE}/templates/`, body).then((r) => r.data),

  update: (id, body) =>
    api.patch(`${BASE}/templates/${id}/`, body).then((r) => r.data),

  remove: (id) =>
    api.delete(`${BASE}/templates/${id}/`).then((r) => r.data),

  /**
   * Run a report from a saved template.
   * Body (optional): { export_format, config_overrides }
   */
  run: (id, body = {}) =>
    api.post(`${BASE}/templates/${id}/run/`, body).then((r) => r.data),

  runDownload: (id, body = {}) =>
    api.post(`${BASE}/templates/${id}/run/`, body, { responseType: 'blob' }).then((r) => r.data),
};

// ─── Schedules ────────────────────────────────────────────────────────────────

export const reportScheduleApi = {
  list: (params) =>
    api.get(`${BASE}/schedules/`, { params }).then((r) => r.data),

  detail: (id) =>
    api.get(`${BASE}/schedules/${id}/`).then((r) => r.data),

  create: (body) =>
    api.post(`${BASE}/schedules/`, body).then((r) => r.data),

  update: (id, body) =>
    api.patch(`${BASE}/schedules/${id}/`, body).then((r) => r.data),

  remove: (id) =>
    api.delete(`${BASE}/schedules/${id}/`).then((r) => r.data),

  toggle: (id) =>
    api.post(`${BASE}/schedules/${id}/toggle/`).then((r) => r.data),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Trigger a browser download from a Blob.
 * @param {Blob}   blob
 * @param {string} filename  e.g. "revenue_monthly.csv"
 */
export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}