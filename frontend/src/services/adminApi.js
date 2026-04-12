/**
 * adminApi.js
 * All API calls for the Admin Panel module.
 *
 * Uses the shared axios instance from src/services/api.js which:
 *  - automatically attaches Bearer token from localStorage('accessToken')
 *  - handles 401 / token refresh transparently
 *
 * The axios baseURL is already set to http://localhost:8000/api,
 * so paths here start from /admin (not /api/admin).
 */

import api from './api';  // ← correct path from services/ subfolder

const BASE = '/admin';

// ─── GUEST MANAGEMENT ────────────────────────────────────────────────────────

export const guestApi = {
  list: (params) =>
    api.get(`${BASE}/guests/`, { params }).then((r) => r.data),

  detail: (id) =>
    api.get(`${BASE}/guests/${id}/`).then((r) => r.data),

  bookings: (id, params) =>
    api.get(`${BASE}/guests/${id}/bookings/`, { params }).then((r) => r.data),

  block: (id, body) =>
    api.patch(`${BASE}/guests/${id}/block/`, body).then((r) => r.data),
};

// ─── PAYMENT MANAGEMENT ───────────────────────────────────────────────────────

export const paymentApi = {
  list: (params) =>
    api.get(`${BASE}/payments/`, { params }).then((r) => r.data),

  detail: (id) =>
    api.get(`${BASE}/payments/${id}/`).then((r) => r.data),

  revenue: (params) =>
    api.get(`${BASE}/payments/revenue/`, { params }).then((r) => r.data),

  confirm: (id, body) =>
    api.post(`${BASE}/payments/${id}/confirm/`, body).then((r) => r.data),

  refund: (id, body) =>
    api.post(`${BASE}/payments/${id}/refund/`, body).then((r) => r.data),
};

// ─── REVIEW MANAGEMENT ────────────────────────────────────────────────────────

export const reviewApi = {
  list: (params) =>
    api.get(`${BASE}/reviews/`, { params }).then((r) => r.data),

  detail: (id) =>
    api.get(`${BASE}/reviews/${id}/`).then((r) => r.data),

  stats: (params) =>
    api.get(`${BASE}/reviews/stats/`, { params }).then((r) => r.data),

  setVisibility: (id, body) =>
    api.patch(`${BASE}/reviews/${id}/visibility/`, body).then((r) => r.data),
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

export const analyticsApi = {
  // Staff dashboard — rooms, bookings, tasks, staff, revenue_today
  dashboard: () =>
    api.get('/staff/dashboard/').then((r) => r.data),

  // Reports: type = bookings | occupancy | guests | staff
  // period  = daily | weekly | monthly | yearly
  report: (type, period, params = {}) =>
    api.get('/staff/reports/', { params: { type, period, ...params } }).then((r) => r.data),
};


export const foodApi = {
  /**
   * GET /api/food/analytics/?period=daily|weekly|monthly|yearly
   * Returns summary, top_items, categories, trend, status_breakdown, payment_split.
   */
  analytics: (period = 'monthly') =>
    api.get('/food/analytics/', { params: { period } }).then((r) => r.data),
};