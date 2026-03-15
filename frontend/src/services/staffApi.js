/**
 * staffApi.js — Staff Management & Shift API calls
 * All endpoints under /api/staff/
 */ 
import api from './api';

export const staffApi = {
  // ── Staff Members ──────────────────────────────────────
  list:       (params) => api.get('/staff/members/', { params }).then(r => r.data),
  detail:     (id)     => api.get(`/staff/members/${id}/`).then(r => r.data),
  create:     (body)   => api.post('/staff/members/', body).then(r => r.data),
  update:     (id, body) => api.patch(`/staff/members/${id}/`, body).then(r => r.data),
  delete:     (id)     => api.delete(`/staff/members/${id}/`).then(r => r.data),
  promote:    (id, body) => api.post(`/staff/members/${id}/promote/`, body).then(r => r.data),
  assignTemp: (id, body) => api.post(`/staff/members/${id}/temp-role/`, body).then(r => r.data),
  removeTemp: (id)     => api.delete(`/staff/members/${id}/temp-role/`).then(r => r.data),
  deactivate: (id, body) => api.post(`/staff/members/${id}/deactivate/`, body).then(r => r.data),
  reactivate: (id)     => api.post(`/staff/members/${id}/reactivate/`).then(r => r.data),

  // ── Shifts ─────────────────────────────────────────────
  shifts:       (params) => api.get('/staff/shifts/', { params }).then(r => r.data),
  createShift:  (body)   => api.post('/staff/shifts/', body).then(r => r.data),
  updateShift:  (id, body) => api.patch(`/staff/shifts/${id}/`, body).then(r => r.data),
  deleteShift:  (id)     => api.delete(`/staff/shifts/${id}/`).then(r => r.data),
};