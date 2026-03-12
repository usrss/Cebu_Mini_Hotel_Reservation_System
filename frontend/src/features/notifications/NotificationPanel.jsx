/**
 * NotificationPanel.jsx
 * =====================
 * Dropdown panel rendered below the bell icon.
 * - Lists notifications newest-first
 * - "Mark all read" button when unread items exist
 * - Footer link to the full /notifications page
 * - Clicking an item marks it read and deep-links to the booking
 *
 * Props:
 *   notifications  – array from useNotifications
 *   loading        – boolean
 *   unreadCount    – number
 *   onMarkAsRead   – fn(id)
 *   onMarkAllRead  – fn()
 *   onClose        – fn()  closes the panel
 */

import { Link } from 'react-router-dom';
import { BellOff, CheckCheck, Loader2, ArrowRight } from 'lucide-react';
import NotificationItem from './NotificationItem';
import './NotificationPanel.css';

export default function NotificationPanel({
  notifications,
  loading,
  unreadCount,
  onMarkAsRead,
  onMarkAllRead,
  onClose,
}) {
  function handleItemClick(notification) {
    // Mark as read on click (works for both is_unread bool and status string)
    const isUnread = notification.is_unread ?? notification.status === 'unread';
    if (isUnread) {
      onMarkAsRead(notification.id);
    }
    // Navigate to the related booking if one exists
    if (notification.booking_id) {
      onClose();
      // Navigation handled inside NotificationItem via Link — see below
    }
  }

  return (
    <div className="notif-panel" role="dialog" aria-label="Notifications">

      {/* ── Header ── */}
      <div className="notif-panel-header">
        <h3 className="notif-panel-title">Notifications</h3>
        {unreadCount > 0 && (
          <button className="notif-mark-all-btn" onClick={onMarkAllRead}>
            <CheckCheck size={15} />
            Mark all read
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="notif-panel-body">
        {loading ? (
          <div className="notif-loading">
            <Loader2 size={22} className="notif-spinner" />
            <span>Loading…</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notif-empty">
            <BellOff size={32} className="notif-empty-icon" />
            <p>You have no notifications yet.</p>
          </div>
        ) : (
          <ul className="notif-list" role="list">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onClick={() => handleItemClick(n)}
                onClose={onClose}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="notif-panel-footer">
        <Link to="/notifications" className="notif-view-all-link" onClick={onClose}>
          View all notifications <ArrowRight size={13} />
        </Link>
      </div>

    </div>
  );
}