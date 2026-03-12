/**
 * NotificationItem.jsx
 * ====================
 * Single notification row used in both the panel dropdown and the
 * full NotificationsPage list.
 *
 * Props:
 *   notification  – notification object from API
 *   onClick       – called when the row is clicked (for mark-as-read)
 *   onClose       – optional; closes the panel if navigating to a booking
 *
 * Dependencies: lucide-react only (no date-fns required)
 */

import { Link } from 'react-router-dom';
import {
  CalendarCheck, CreditCard, CheckCircle2,
  XCircle, Bell, AlertCircle,
} from 'lucide-react';
import './NotificationItem.css';

// ── Event → icon ─────────────────────────────────────────────────────────────
const EVENT_ICONS = {
  booking_created:   <CalendarCheck size={18} />,
  deposit_received:  <CreditCard    size={18} />,
  booking_confirmed: <CheckCircle2  size={18} />,
  booking_cancelled: <XCircle       size={18} />,
  checkin_reminder:  <Bell          size={18} />,
};

// ── Event → accent colour ────────────────────────────────────────────────────
const EVENT_COLORS = {
  booking_created:   '#4f46e5',   // indigo
  deposit_received:  '#0ea5e9',   // sky
  booking_confirmed: '#16a34a',   // green
  booking_cancelled: '#dc2626',   // red
  checkin_reminder:  '#f59e0b',   // amber
};

// ── Self-contained relative time (no date-fns dependency) ───────────────────
function timeAgo(dateStr) {
  try {
    const diff  = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60_000);
    const hours = Math.floor(mins  / 60);
    const days  = Math.floor(hours / 24);
    if (mins  <  1)  return 'Just now';
    if (mins  < 60)  return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days  <  7)  return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function NotificationItem({ notification, onClick, onClose }) {
  // Support both the boolean `is_unread` property and the `status` string
  const isUnread = notification.is_unread ?? notification.status === 'unread';
  const icon     = EVENT_ICONS[notification.event]  ?? <AlertCircle size={18} />;
  const color    = EVENT_COLORS[notification.event] ?? '#6b7280';

  const content = (
    <>
      {/* Left accent bar shown only for unread items */}
      {isUnread && <span className="notif-item-bar" />}

      {/* Coloured icon bubble */}
      <span
        className="notif-item-icon"
        style={{ background: `${color}18`, color }}
      >
        {icon}
      </span>

      {/* Text content */}
      <div className="notif-item-body">
        <p className="notif-item-title">{notification.title}</p>
        <p className="notif-item-desc">{notification.description}</p>
        <span className="notif-item-time">{timeAgo(notification.created_at)}</span>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <span className="notif-item-dot" style={{ background: color }} />
      )}
    </>
  );

  const sharedProps = {
    className: `notif-item${isUnread ? ' notif-item--unread' : ''}`,
    style:     { '--accent': color },
  };

  // If there's a related booking, wrap the row in a Link for native navigation
  if (notification.booking_id) {
    return (
      <li {...sharedProps}>
        <Link
          to={`/bookings/my/${notification.booking_id}`}
          className="notif-item-link"
          onClick={() => {
            onClick?.();
            onClose?.();
          }}
        >
          {content}
        </Link>
      </li>
    );
  }

  // Plain clickable row (no booking to navigate to)
  return (
    <li
      {...sharedProps}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {content}
    </li>
  );
}