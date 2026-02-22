import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// ─── Generic fetch helper ─────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('accessToken'); // matches api.js
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

// ─── useCurrentUser — fetches logged-in user profile for auto-fill ────────────
// Adjust the endpoint to match your users app (e.g. /users/me/ or /auth/me/)

export function useCurrentUser() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ✅ api.js stores token as 'accessToken' and user as 'user' (JSON)
    const token       = localStorage.getItem('accessToken');
    const storedUser  = localStorage.getItem('user');

    // No token → not logged in
    if (!token) {
      setLoading(false);
      return;
    }

    // ✅ User object is already stored in localStorage by loginUser/verifyCode
    // Use it directly — no extra API call needed
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        setUser(null);
      }
      setLoading(false);
      return;
    }

    // Fallback: fetch from API if localStorage user is missing
    let cancelled = false;
    apiFetch('/auth/me/')
      .then((data) => { if (!cancelled) setUser(data); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return { user, loading };
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
// FIX: when id is null/undefined (e.g. state already has booking),
// loading starts as FALSE so the confirmation page never gets stuck.

export function useBookingDetail(id) {
  const [booking, setBooking] = useState(null);
  // ✅ Start loading=false when there's no id to fetch
  const [loading, setLoading] = useState(!!id);
  const [error, setError]     = useState(null);

  useEffect(() => {
    // No id means caller already has the data (e.g. from router state)
    if (!id) {
      setLoading(false);
      return;
    }

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

// ─── useCreateBooking — POST /bookings/ ───────────────────────────────────────

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

// ─── useCancelBooking — POST /bookings/my/<id>/cancel/ ────────────────────────

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