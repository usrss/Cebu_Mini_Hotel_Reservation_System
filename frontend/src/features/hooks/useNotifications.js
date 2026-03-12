/**
 * hooks/useNotifications.js
 * =========================
 * Custom React hook — fetches notifications and polls every 30 s.
 * Uses the shared axios instance from api.js so token refresh and
 * auth headers are handled automatically.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api, { isAuthenticated } from '../../services/api';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  const intervalRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    // Don't attempt the call if not logged in
    if (!isAuthenticated()) {
      stopPolling();
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get('/notifications/');
      const list = Array.isArray(data) ? data : (data.results ?? []);

      setNotifications(list);
      setUnreadCount(list.filter(n => n.status === 'unread').length);
      setError(null);
    } catch (err) {
      // 401 is handled by the axios interceptor in api.js —
      // if it still fails (e.g. both tokens expired), stop polling
      if (err.response?.status === 401) {
        stopPolling();
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [stopPolling]);

  const markAsRead = useCallback(async (id) => {
    try {
      const { data } = await api.patch(`/notifications/${id}/read/`);
      setNotifications(prev => prev.map(n => (n.id === id ? data : n)));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (_) { /* silent */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/notifications/mark-all-read/');
      setNotifications(prev =>
        prev.map(n => ({ ...n, status: 'read', is_unread: false }))
      );
      setUnreadCount(0);
    } catch (_) { /* silent */ }
  }, []);

  useEffect(() => {
    // Only start polling if the user is logged in
    if (!isAuthenticated()) return;

    setLoading(true);
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);

    return () => stopPolling();
  }, [fetchNotifications, stopPolling]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllRead,
    refetch: fetchNotifications,
  };
}