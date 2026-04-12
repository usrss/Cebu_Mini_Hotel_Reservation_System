// src/features/hooks/useHotelSettings.js
/**
 * useHotelSettings
 *
 * Fetches global hotel settings from GET /api/rooms/hotel/settings/.
 * Includes cancellation_tiers — a structured JSON array that drives
 * both the policy display (BookingForm) and refund calculations (MyBookingsPage).
 *
 * BUG FIXES applied in this version:
 *   1. Unified API_BASE env var — was VITE_API_URL here but VITE_API_BASE_URL
 *      in HotelSettingsPage.jsx. Mismatch meant save and fetch could hit
 *      different URLs, making admin-saved tiers invisible to guests.
 *   2. Failed fetches no longer cache the fallback — previously a single
 *      failed request would lock in DEFAULT_CANCELLATION_TIERS for the
 *      entire tab lifetime with no way to recover short of a hard reload.
 *   3. fetchPromise is always cleared in finally{} so retries are possible.
 */

import { useState, useEffect } from 'react';

// FIX 1: Match the env var used by HotelSettingsPage.jsx (VITE_API_BASE_URL).
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL      ||
  'http://localhost:8000/api';

// ── Default tiers ─────────────────────────────────────────────────────────────
export const DEFAULT_CANCELLATION_TIERS = [
  { hours_before: 48, refund_pct: 90, label: '48+ hours before check-in' },
  { hours_before: 24, refund_pct: 50, label: '24–47 hours before check-in' },
  { hours_before: 0,  refund_pct: 0,  label: 'Less than 24 hours / same day' },
];

// ── Fallback defaults ─────────────────────────────────────────────────────────
export const HOTEL_SETTINGS_DEFAULTS = {
  checkin_time:        '14:00',
  checkout_time:       '12:00',
  hotel_name:          'Cebu Mini Hotel',
  hotel_address:       '123 Colon St., Cebu City, 6000',
  hotel_phone:         '+63 32 123 4567',
  hotel_email:         'info@cebuminihotel.com',
  hotel_description:   '',
  cancellation_policy: (
    'Free cancellation 48+ hours before check-in (90% refund). ' +
    '50% refund for cancellations within 24–47 hours. ' +
    'No refund for same-day cancellations or no-shows.'
  ),
  cancellation_tiers: DEFAULT_CANCELLATION_TIERS,
  terms_url:   '/terms-and-conditions',
  privacy_url: '/privacy-policy',
};

// ── Module-level cache ────────────────────────────────────────────────────────
let settingsCache = null;
let fetchPromise  = null;

async function fetchHotelSettings() {
  if (settingsCache) return settingsCache;

  if (!fetchPromise) {
    fetchPromise = (async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`${API_BASE}/rooms/hotel/settings/`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const rawTiers =
          Array.isArray(data.cancellation_tiers) && data.cancellation_tiers.length > 0
            ? data.cancellation_tiers
            : DEFAULT_CANCELLATION_TIERS;

        const tiers = [...rawTiers].sort((a, b) => b.hours_before - a.hours_before);

        settingsCache = {
          ...HOTEL_SETTINGS_DEFAULTS,
          ...data,
          cancellation_tiers: tiers,
        };
        return settingsCache;
      } catch (err) {
        // FIX 2: Do NOT assign settingsCache on failure. A failed fetch
        // (wrong URL, 401, network error) must NOT permanently lock in
        // hardcoded defaults — leave cache null so the next caller retries.
        console.warn('[useHotelSettings] Fetch failed, using defaults.', err?.message);
        return { ...HOTEL_SETTINGS_DEFAULTS };
      } finally {
        // FIX 3: Always clear in-flight promise so subsequent calls can retry.
        fetchPromise = null;
      }
    })();
  }

  return fetchPromise;
}

/**
 * Clears the module-level cache.
 * Call after admin saves new settings so the next consumer fetches fresh data.
 */
export function clearHotelSettingsCache() {
  settingsCache = null;
  fetchPromise  = null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useHotelSettings() {
  const [settings, setSettings] = useState(
    settingsCache ?? { ...HOTEL_SETTINGS_DEFAULTS }
  );
  const [loading, setLoading] = useState(!settingsCache);

  useEffect(() => {
    if (settingsCache) {
      setSettings(settingsCache);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchHotelSettings().then((data) => {
      if (!cancelled) {
        setSettings(data);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  return { settings, loading };
}