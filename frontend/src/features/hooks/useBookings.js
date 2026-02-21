// src/hooks/useBookings.js
import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// ─── Generic fetch helper ─────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('accessToken'); // use correct token name
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
      data?.error ||
      Object.values(data).flat().join(' ') ||
      'Something went wrong.';
    throw new Error(message);
  }
  return data;
}

// ─── useMyBookings — authenticated user's booking list ────────────────────────
export function useMyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch('/bookings/my/')
      .then((data) => { if (!cancelled) setBookings(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return { bookings, loading, error };
}

// ─── useBookingDetail — single booking detail ─────────────────────────────────
export function useBookingDetail(id) {
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch(`/bookings/my/${id}/`)
      .then((data) => { if (!cancelled) setBooking(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  return { booking, loading, error, setBooking };
}

// ─── useBookingLookup — guest lookup by reference number ──────────────────────
export function useBookingLookup() {
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const lookup = useCallback(async (reference) => {
    setLoading(true);
    setError(null);
    setBooking(null);
    try {
      const data = await apiFetch(`/bookings/lookup/?reference=${encodeURIComponent(reference)}`);
      setBooking(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { booking, loading, error, lookup };
}

// ─── useCreateBooking — POST /bookings/ ──────────────────────────────────────
export function useCreateBooking() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const createBooking = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/bookings/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createBooking, loading, error };
}

// ─── useCancelBooking — POST /bookings/my/<id>/cancel/ ───────────────────────
export function useCancelBooking() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const cancelBooking = useCallback(async (id, reason = '') => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/bookings/my/${id}/cancel/`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { cancelBooking, loading, error };
}