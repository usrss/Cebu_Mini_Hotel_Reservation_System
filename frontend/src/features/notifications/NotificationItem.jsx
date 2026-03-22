/**
 * NotificationItem.jsx
 * ====================
 * Single notification row — used in both panel and full page.
 *
 * Routing is recipient_type + event aware:
 *   guest       → /bookings/my/<booking_id>
 *   front_desk  → /admin/bookings or /admin/payments
 *   manager     → /admin/dashboard or relevant admin page
 *   admin       → /admin/dashboard or relevant admin page
 *   housekeeping → /staff/cleaning
 *   maintenance  → /staff/maintenance
 *   security     → /staff/incidents
 */

import { Link } from 'react-router-dom';
import {
  CalendarCheck, CreditCard, CheckCircle2, XCircle,
  Bell, AlertCircle, Sparkles, Wrench, Shield,
  LogIn, LogOut, AlertTriangle, DollarSign, RefreshCw,
} from 'lucide-react';
import './NotificationItem.css';

// ── Event → icon ──────────────────────────────────────────────────────────────
const EVENT_ICONS = {
  booking_created:        <CalendarCheck  size={18} />,
  booking_confirmed:      <CheckCircle2   size={18} />,
  booking_cancelled:      <XCircle        size={18} />,
  booking_modified:       <RefreshCw      size={18} />,
  deposit_received:       <CreditCard     size={18} />,
  full_payment_received:  <DollarSign     size={18} />,
  payment_failed:         <AlertTriangle  size={18} />,
  balance_collected:      <DollarSign     size={18} />,
  guest_checked_in:       <LogIn          size={18} />,
  guest_checked_out:      <LogOut         size={18} />,
  checkin_reminder:       <Bell           size={18} />,
  cleaning_task_assigned: <Sparkles       size={18} />,
  cleaning_task_overdue:  <AlertTriangle  size={18} />,
  room_cleaned:           <CheckCircle2   size={18} />,
  maintenance_assigned:   <Wrench         size={18} />,
  maintenance_overdue:    <AlertTriangle  size={18} />,
  maintenance_completed:  <CheckCircle2   size={18} />,
  incident_reported:      <Shield         size={18} />,
  emergency_alert:        <AlertTriangle  size={18} />,
  system_alert:           <AlertCircle    size={18} />,
};

// ── Event → accent colour ─────────────────────────────────────────────────────
const EVENT_COLORS = {
  booking_created:        '#4f46e5',  // indigo
  booking_confirmed:      '#16a34a',  // green
  booking_cancelled:      '#dc2626',  // red
  booking_modified:       '#0ea5e9',  // sky
  deposit_received:       '#0ea5e9',  // sky
  full_payment_received:  '#16a34a',  // green
  payment_failed:         '#dc2626',  // red
  balance_collected:      '#16a34a',  // green
  guest_checked_in:       '#4f46e5',  // indigo
  guest_checked_out:      '#f59e0b',  // amber
  checkin_reminder:       '#f59e0b',  // amber
  cleaning_task_assigned: '#C9A84C',  // gold
  cleaning_task_overdue:  '#ef4444',  // red
  room_cleaned:           '#16a34a',  // green
  maintenance_assigned:   '#8b5cf6',  // violet
  maintenance_overdue:    '#ef4444',  // red
  maintenance_completed:  '#16a34a',  // green
  incident_reported:      '#f97316',  // orange
  emergency_alert:        '#dc2626',  // red
  system_alert:           '#dc2626',  // red
};

// ── Priority → badge style ────────────────────────────────────────────────────
const PRIORITY_STYLES = {
  urgent: { background: '#fef2f2', color: '#dc2626', label: 'URGENT' },
  high:   { background: '#fff7ed', color: '#ea580c', label: 'HIGH'   },
  medium: null,
  low:    null,
};

// ── Destination routing ───────────────────────────────────────────────────────
function getDestination(notification) {
  const { event, booking_id, recipient_type } = notification;

  // Housekeeping
  if (recipient_type === 'housekeeping') {
    if (event === 'cleaning_task_assigned') return '/staff/cleaning';
    if (event === 'cleaning_task_overdue')  return '/staff/cleaning';
    if (event === 'guest_checked_out')      return '/staff/cleaning';
    return null;
  }

  // Maintenance
  if (recipient_type === 'maintenance') {
    return '/staff/maintenance';
  }

  // Security
  if (recipient_type === 'security') {
    return '/staff/incidents';
  }

  // Admin
  if (recipient_type === 'admin') {
    if (event === 'payment_failed')   return '/admin/payments';
    if (event === 'system_alert')     return '/admin/dashboard';
    if (event === 'incident_reported') return '/admin/dashboard';
    return '/admin/dashboard';
  }

  // Manager
  if (recipient_type === 'manager') {
    if (event === 'incident_reported')     return '/admin/dashboard';
    if (event === 'cleaning_task_overdue') return '/admin/dashboard';
    if (event === 'maintenance_overdue')   return '/admin/dashboard';
    if (event === 'room_cleaned')          return '/admin/dashboard';
    if (event === 'maintenance_completed') return '/admin/dashboard';
    if (event === 'balance_collected')     return '/admin/payments';
    if (booking_id)                        return `/admin/bookings/${booking_id}`;
    return '/admin/dashboard';
  }

  // Front Desk — always routes to front desk pages, never admin pages
  if (recipient_type === 'front_desk') {
    if (event === 'payment_failed')        return '/staff/front-desk/payments';
    if (event === 'deposit_received')      return '/staff/front-desk/payments';
    if (event === 'full_payment_received') return '/staff/front-desk/payments';
    if (event === 'booking_created')       return '/staff/front-desk/today';
    if (event === 'booking_confirmed')     return '/staff/front-desk/today';
    if (event === 'booking_cancelled')     return '/staff/front-desk';
    if (event === 'booking_modified')      return '/staff/front-desk/today';
    if (event === 'guest_checked_out')     return '/staff/front-desk/rooms';
    if (event === 'guest_checked_in')      return '/staff/front-desk/rooms';
    if (event === 'room_cleaned')          return '/staff/front-desk/rooms';
    return '/staff/front-desk';
  }

  // Generic staff fallback
  if (recipient_type === 'staff') {
    if (event === 'cleaning_task_assigned') return '/staff/cleaning';
    return null;
  }

  // Guest
  if (recipient_type === 'guest' && booking_id) {
    return `/bookings/my/${booking_id}`;
  }

  return null;
}

// ── Relative time ─────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  try {
    const diff  = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60_000);
    const hours = Math.floor(mins  / 60);
    const days  = Math.floor(hours / 24);
    if (mins  <  1) return 'Just now';
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  <  7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric',
    });
  } catch { return ''; }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function NotificationItem({ notification, onClick, onClose }) {
  const isUnread   = notification.is_unread ?? notification.status === 'unread';
  const icon       = EVENT_ICONS[notification.event]  ?? <AlertCircle size={18} />;
  const color      = EVENT_COLORS[notification.event] ?? '#6b7280';
  const dest       = getDestination(notification);
  const priorityStyle = PRIORITY_STYLES[notification.priority] ?? null;

  const content = (
    <>
      {isUnread && <span className="notif-item-bar" />}

      <span className="notif-item-icon" style={{ background: `${color}18`, color }}>
        {icon}
      </span>

      <div className="notif-item-body">
        <div className="notif-item-title-row">
          <p className="notif-item-title">{notification.title}</p>
          {priorityStyle && (
            <span className="notif-item-priority" style={priorityStyle}>
              {priorityStyle.label}
            </span>
          )}
        </div>
        <p className="notif-item-desc">{notification.description}</p>
        <span className="notif-item-time">{timeAgo(notification.created_at)}</span>
      </div>

      {isUnread && <span className="notif-item-dot" style={{ background: color }} />}
    </>
  );

  const sharedClass = `notif-item${isUnread ? ' notif-item--unread' : ''}`;

  if (dest) {
    return (
      <li className={sharedClass} style={{ '--accent': color }}>
        <Link
          to={dest}
          className="notif-item-link"
          onClick={() => { onClick?.(); onClose?.(); }}
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li
      className={sharedClass}
      style={{ '--accent': color, cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {content}
    </li>
  );
}