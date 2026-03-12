/**
 * NotificationBell.jsx
 * ====================
 * Nav-bar bell icon with unread badge counter.
 * Clicking it toggles the NotificationPanel dropdown.
 *
 * Usage:
 *   import NotificationBell from './NotificationBell';
 *   <NotificationBell />
 */

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { isAuthenticated } from '../../services/api';  // ← adjust path if needed
import NotificationPanel from './NotificationPanel';
import './NotificationBell.css';

export default function NotificationBell() {
  // Guard — don't render the bell at all for unauthenticated users
  if (!isAuthenticated()) return null;

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const { notifications, unreadCount, loading, markAsRead, markAllRead } = useNotifications();

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="notif-bell-wrapper" ref={wrapperRef}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span className="notif-badge" aria-live="polite">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          notifications={notifications}
          loading={loading}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllRead={markAllRead}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}