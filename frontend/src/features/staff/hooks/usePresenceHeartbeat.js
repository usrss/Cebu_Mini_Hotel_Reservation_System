/**
 * src/features/staff/hooks/usePresenceHeartbeat.js
 *
 * Drop this hook into StaffLayout, FrontDeskLayout, and AdminLayout.
 * It handles the full presence lifecycle automatically:
 *
 *   - Sends POST /staff/presence/ { status: "online" } every 90 seconds
 *   - Sends { status: "idle" } when the browser tab is hidden for 5+ minutes
 *   - Sends { status: "offline" } on tab close / page unload
 *   - Sends { status: "online" } when a hidden tab becomes visible again
 *   - Does nothing if the user is not authenticated as staff
 *
 * Usage (add to each layout's component body — no props needed):
 *
 *   import { usePresenceHeartbeat } from '../hooks/usePresenceHeartbeat';
 *   export default function StaffLayout({ children }) {
 *     usePresenceHeartbeat();
 *     ...
 *   }
 */

import { useEffect, useRef, useCallback } from 'react';
import { monitoringApi } from '../services/staffApi';
import { getStoredUser } from '../../../services/api';

// ── Tunables ──────────────────────────────────────────────────────────────────
const HEARTBEAT_MS   = 90_000;   // POST online every 90 s
const IDLE_AFTER_MS  = 300_000;  // mark idle after 5 min of hidden tab

export function usePresenceHeartbeat() {
  const heartbeatRef  = useRef(null);
  const idleTimerRef  = useRef(null);
  const lastStatusRef = useRef(null); // avoid redundant identical POSTs

  // ── Guard — only run for authenticated staff ────────────────────────────────
  const user    = getStoredUser();
  const isStaff = !!user?.staff_profile;

  const post = useCallback((status) => {
    // Skip if same status was just sent — reduces noise
    if (lastStatusRef.current === status) return;
    lastStatusRef.current = status;

    monitoringApi.updatePresence({ status }).catch(() => {
      // Swallow errors silently — heartbeat should never crash the UI
    });
  }, []);

  // ── Send offline synchronously on page unload ───────────────────────────────
  // navigator.sendBeacon is fire-and-forget, survives page close
  const sendOfflineBeacon = useCallback(() => {
    if (!isStaff) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const baseUrl = (window.__API_BASE__ ?? 'http://localhost:8000/api');
    const body    = JSON.stringify({ status: 'offline' });
    try {
      navigator.sendBeacon(
        `${baseUrl}/staff/presence/`,
        new Blob([body], { type: 'application/json' })
      );
    } catch {
      // sendBeacon not supported in very old browsers — fallback silent fail
    }
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff) return;

    // ── Initial online ping ──────────────────────────────────────────────────
    post('online');

    // ── Heartbeat ────────────────────────────────────────────────────────────
    heartbeatRef.current = setInterval(() => {
      // If tab is visible send online, otherwise let the idle timer handle it
      if (!document.hidden) {
        post('online');
      }
    }, HEARTBEAT_MS);

    // ── Visibility change handler ─────────────────────────────────────────────
    // Tab hidden → start idle countdown
    // Tab visible → cancel idle countdown, go back online immediately
    function handleVisibilityChange() {
      if (document.hidden) {
        // Start idle countdown
        idleTimerRef.current = setTimeout(() => {
          post('idle');
        }, IDLE_AFTER_MS);
      } else {
        // Tab is visible again — cancel idle timer, mark online
        clearTimeout(idleTimerRef.current);
        post('online');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ── Offline on unload ─────────────────────────────────────────────────────
    window.addEventListener('beforeunload', sendOfflineBeacon);
    // pagehide fires on mobile browsers that don't fire beforeunload reliably
    window.addEventListener('pagehide', sendOfflineBeacon);

    return () => {
      clearInterval(heartbeatRef.current);
      clearTimeout(idleTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', sendOfflineBeacon);
      window.removeEventListener('pagehide', sendOfflineBeacon);
      // Mark offline when the component unmounts (logout nav, route change to guest)
      post('offline');
    };
  }, [isStaff, post, sendOfflineBeacon]);
}