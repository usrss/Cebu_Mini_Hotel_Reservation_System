// src/features/hooks/useBookingModification.js
/**
 * Hooks for the booking modification system (reschedule + extend stay).
 * Mirrors the pattern in useBookings.js / usePayments.js.
 */

import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.detail ||
      data?.error  ||
      Object.values(data).flat().join(' ') ||
      'Something went wrong.';
    throw new Error(message);
  }
  return data;
}

// ─── useRescheduleBooking ──────────────────────────────────────────────────────
/**
 * POST /api/bookings/my/<bookingId>/reschedule/
 * Returns a modification record with price_difference, status, refund breakdown.
 */
export function useRescheduleBooking() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const requestReschedule = useCallback(async (bookingId, { new_check_in, new_check_out }) => {
    setLoading(true);
    setError(null);
    try {
      return await apiFetch(`/bookings/my/${bookingId}/reschedule/`, {
        method: 'POST',
        body: JSON.stringify({ new_check_in, new_check_out }),
      });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { requestReschedule, loading, error };
}

// ─── useExtendStay ────────────────────────────────────────────────────────────
/**
 * POST /api/bookings/my/<bookingId>/extend/
 * Returns a modification record with price_difference (always positive).
 */
export function useExtendStay() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const requestExtend = useCallback(async (bookingId, { new_check_out }) => {
    setLoading(true);
    setError(null);
    try {
      return await apiFetch(`/bookings/my/${bookingId}/extend/`, {
        method: 'POST',
        body: JSON.stringify({ new_check_out }),
      });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { requestExtend, loading, error };
}

// ─── useConfirmModification ───────────────────────────────────────────────────
/**
 * POST /api/bookings/my/modification/<modId>/confirm/
 * Used only when price_difference == 0.
 */
export function useConfirmModification() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const confirm = useCallback(async (modId) => {
    setLoading(true);
    setError(null);
    try {
      return await apiFetch(`/bookings/my/modification/${modId}/confirm/`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { confirm, loading, error };
}

// ─── useConfirmRefund ─────────────────────────────────────────────────────────
/**
 * POST /api/bookings/my/modification/<modId>/confirm-refund/
 * Guest confirms they accept the refund breakdown → commits reschedule.
 */
export function useConfirmRefund() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const confirmRefund = useCallback(async (modId) => {
    setLoading(true);
    setError(null);
    try {
      return await apiFetch(`/bookings/my/modification/${modId}/confirm-refund/`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { confirmRefund, loading, error };
}

// ─── useCancelModification ────────────────────────────────────────────────────
/**
 * POST /api/bookings/my/modification/<modId>/cancel/
 */
export function useCancelModification() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const cancel = useCallback(async (modId) => {
    setLoading(true);
    setError(null);
    try {
      return await apiFetch(`/bookings/my/modification/${modId}/cancel/`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { cancel, loading, error };
}

// ─── useModificationPayment ───────────────────────────────────────────────────
/**
 * POST /api/bookings/my/modification/<modId>/pay/
 * Initiates a payment session for a modification that requires additional charge.
 */
export function useModificationPayment() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const initiatePayment = useCallback(async (modId, { payment_method }) => {
    setLoading(true);
    setError(null);
    try {
      return await apiFetch(`/bookings/my/modification/${modId}/pay/`, {
        method: 'POST',
        body: JSON.stringify({ payment_method }),
      });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { initiatePayment, loading, error };
}