import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// ─── Generic fetch helper (mirrors useBookings.js) ────────────────────────────

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

// ─── useInitiatePayment — POST /api/payments/initiate/ ───────────────────────

export function useInitiatePayment() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const initiate = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/payments/initiate/', {
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

  return { initiate, loading, error };
}

// ─── useVerifyPayment — GET /api/payments/<id>/verify/ ───────────────────────

export function useVerifyPayment(paymentId) {
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(!!paymentId);
  const [error,   setError]   = useState(null);

  const verify = useCallback(async (id) => {
    const pid = id || paymentId;
    if (!pid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/payments/${pid}/verify/`);
      setPayment(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    if (paymentId) verify(paymentId);
  }, [paymentId]);

  return { payment, loading, error, verify };
}

// ─── useMyPayments — GET /api/payments/my/ ───────────────────────────────────

export function useMyPayments() {
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch('/payments/my/')
      .then((data) => { if (!cancelled) setPayments(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return { payments, loading, error };
}

// ─── useMyPaymentDetail — GET /api/payments/my/<id>/ ─────────────────────────

export function useMyPaymentDetail(id) {
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch(`/payments/my/${id}/`)
      .then((data) => { if (!cancelled) setPayment(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  return { payment, loading, error };
}