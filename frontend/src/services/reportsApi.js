/**
 * src/services/reportsApi.js
 */

import api from './api';

const BASE = '/reports';

// ─── Meta ─────────────────────────────────────────────────────────────────────

export const reportMetaApi = {
  get: () =>
    api.get(`${BASE}/meta/`).then((r) => r.data),
};

// ─── Ad-hoc run ───────────────────────────────────────────────────────────────

export const reportRunApi = {
  run: (body) =>
    api.post(`${BASE}/run/`, body).then((r) => r.data),

  download: (body) =>
    api.post(`${BASE}/run/`, body, { responseType: 'blob' }).then((r) => r.data),
};

// ─── Execution history ────────────────────────────────────────────────────────

export const reportExecutionApi = {
  list: (params) =>
    api.get(`${BASE}/executions/`, { params }).then((r) => r.data),

  detail: (id) =>
    api.get(`${BASE}/executions/${id}/`).then((r) => r.data),

  /**
   * Re-download a previous execution result.
   * The backend endpoint is /api/reports/executions/{id}/download/?format={format}
   */
  download: async (id, format = 'csv') => {
    try {
      console.log(`Downloading execution ${id} as ${format}`);

      const response = await api.get(`${BASE}/executions/${id}/download/`, {
        params: { format },
        responseType: 'blob',
      });

      // Check if we got a valid blob
      if (!response.data || response.data.size === 0) {
        throw new Error('Server returned an empty file');
      }

      // Check if the response is actually JSON error (some servers return error as JSON even with blob responseType)
      if (response.data.type === 'application/json') {
        const text = await response.data.text();
        const json = JSON.parse(text);
        throw new Error(json.detail || json.error || 'Server returned an error');
      }

      return response.data;
    } catch (err) {
      console.error('Download error:', err);

      // Handle different error cases
      if (err.response) {
        // The request was made and the server responded with a status code
        console.error('Response status:', err.response.status);
        console.error('Response headers:', err.response.headers);

        // If it's a blob, try to read the error message
        if (err.response.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            console.error('Error response body:', text);

            // Try to parse as JSON
            try {
              const json = JSON.parse(text);
              throw new Error(json.detail || json.error || `Server error: ${err.response.status}`);
            } catch {
              // Not JSON, just use the text
              throw new Error(`Server error ${err.response.status}: ${text.substring(0, 100)}`);
            }
          } catch (readErr) {
            throw new Error(`Failed to read error response: ${readErr.message}`);
          }
        }

        // If we get here, rethrow with status
        throw new Error(`Request failed with status ${err.response.status}`);
      } else if (err.request) {
        // The request was made but no response was received
        throw new Error('No response received from server');
      } else {
        // Something happened in setting up the request
        throw err;
      }
    }
  },
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

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}