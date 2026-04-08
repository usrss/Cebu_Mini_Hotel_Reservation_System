/**
 * NotificationsPage.jsx — Cebu Mini Hotel
 *
 * Changes in this revision:
 *  - Hero section completely removed (no dark banner, no bell icon, no watermark)
 *  - Page title is a simple inline header inside the container
 *  - All pointer-event blocking elements eliminated
 *  - Filter pills, mark-all, and individual row clicks all work
 *  - Modal opens on any row click and marks notification as read simultaneously
 *  - Escape key closes modal
 */

import { useState, useEffect } from 'react';
import {
  Bell, CheckCheck, X,
  CalendarCheck, CreditCard, CheckCircle2, XCircle,
  AlertCircle, Sparkles, Wrench, Shield,
  LogIn, LogOut, AlertTriangle, DollarSign, RefreshCw, Clock,
  Hash, ArrowRight,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { isAuthenticated, getStoredUser } from '../../services/api';
import AdminLayout from '../adminPanel/layout/AdminLayout';
import StaffLayout from '../staff/StaffLayout';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
import './NotificationsPage.css';

/* ── Event → icon map ─────────────────────────────────── */
const EVENT_ICONS = {
  booking_created:        CalendarCheck,
  booking_confirmed:      CheckCircle2,
  booking_cancelled:      XCircle,
  booking_modified:       RefreshCw,
  deposit_received:       CreditCard,
  full_payment_received:  DollarSign,
  payment_failed:         AlertTriangle,
  balance_collected:      DollarSign,
  guest_checked_in:       LogIn,
  guest_checked_out:      LogOut,
  checkin_reminder:       Bell,
  cleaning_task_assigned: Sparkles,
  cleaning_task_overdue:  AlertTriangle,
  room_cleaned:           CheckCircle2,
  maintenance_assigned:   Wrench,
  maintenance_overdue:    AlertTriangle,
  maintenance_completed:  CheckCircle2,
  incident_reported:      Shield,
  emergency_alert:        AlertTriangle,
  system_alert:           AlertCircle,
};

const EVENT_COLORS = {
  booking_created:        '#4f46e5',
  booking_confirmed:      '#16a34a',
  booking_cancelled:      '#dc2626',
  booking_modified:       '#0ea5e9',
  deposit_received:       '#0ea5e9',
  full_payment_received:  '#16a34a',
  payment_failed:         '#dc2626',
  balance_collected:      '#16a34a',
  guest_checked_in:       '#4f46e5',
  guest_checked_out:      '#C9A84C',
  checkin_reminder:       '#C9A84C',
  cleaning_task_assigned: '#C9A84C',
  cleaning_task_overdue:  '#ef4444',
  room_cleaned:           '#16a34a',
  maintenance_assigned:   '#8b5cf6',
  maintenance_overdue:    '#ef4444',
  maintenance_completed:  '#16a34a',
  incident_reported:      '#f97316',
  emergency_alert:        '#dc2626',
  system_alert:           '#dc2626',
};

/* ── Relative time ───────────────────────────────────── */
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
    return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

/* ══════════════════════════════════════════════════════
   NOTIFICATION DETAIL MODAL
   ══════════════════════════════════════════════════════ */
function NotificationDetailModal({ notification, onClose }) {
  const IconComponent = EVENT_ICONS[notification.event] ?? Bell;
  const color    = EVENT_COLORS[notification.event] ?? '#6b7280';
  const isUnread = notification.status === 'unread' || notification.is_unread === true;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      className="ndm-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ndm-modal" role="dialog" aria-modal="true" aria-labelledby="ndm-title">

        {/* Navy header */}
        <div className="ndm-header">
          <div className="ndm-icon-wrap" style={{ background: `${color}22`, color }}>
            <IconComponent size={22} />
          </div>
          <div className="ndm-header-text">
            <p className="ndm-eyebrow">Notification Detail</p>
            <h3 className="ndm-title" id="ndm-title">{notification.title}</h3>
          </div>
          <button className="ndm-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="ndm-body">
          <div className="ndm-status-row">
            <span className={`ndm-status-badge ${isUnread ? 'ndm-status-unread' : 'ndm-status-read'}`}>
              {isUnread
                ? <><Bell size={10} /> Unread</>
                : <><CheckCircle2 size={10} /> Read</>}
            </span>
            <span className="ndm-time">
              <Clock size={12} /> {timeAgo(notification.created_at)}
            </span>
          </div>

          <div className="ndm-desc-box">
            <p className="ndm-description">
              {notification.description || notification.message || 'No details available.'}
            </p>
          </div>

          <div className="ndm-meta">
            {notification.booking_id && (
              <div className="ndm-meta-row">
                <Hash size={13} className="ndm-meta-icon" />
                <span className="ndm-meta-label">Booking</span>
                <span className="ndm-meta-value">#{notification.booking_id}</span>
              </div>
            )}
            {notification.event && (
              <div className="ndm-meta-row">
                <AlertCircle size={13} className="ndm-meta-icon" />
                <span className="ndm-meta-label">Event</span>
                <span className="ndm-meta-value" style={{ textTransform: 'capitalize' }}>
                  {notification.event.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {notification.priority && notification.priority !== 'medium' && (
              <div className="ndm-meta-row">
                <AlertTriangle size={13} className="ndm-meta-icon" />
                <span className="ndm-meta-label">Priority</span>
                <span className={`ndm-priority-badge ndm-priority-${notification.priority}`}>
                  {notification.priority.toUpperCase()}
                </span>
              </div>
            )}
            <div className="ndm-meta-row">
              <Clock size={13} className="ndm-meta-icon" />
              <span className="ndm-meta-label">Received</span>
              <span className="ndm-meta-value">
                {new Date(notification.created_at).toLocaleString('en-PH', {
                  dateStyle: 'medium', timeStyle: 'short',
                })}
              </span>
            </div>
          </div>

          {notification.booking_id && (
            <Link
              to={`/bookings/my/${notification.booking_id}`}
              className="ndm-action-link"
              onClick={onClose}
            >
              View Booking Details <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   NOTIFICATION ROW
   ══════════════════════════════════════════════════════ */
function NotificationRow({ notification, onClick }) {
  const IconComponent = EVENT_ICONS[notification.event] ?? Bell;
  const color    = EVENT_COLORS[notification.event] ?? '#6b7280';
  const isUnread = notification.status === 'unread' || notification.is_unread === true;

  return (
    <div
      className={`notif-row${isUnread ? ' notif-row--unread' : ''}`}
      onClick={() => onClick(notification)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(notification)}
    >
      {isUnread && <span className="notif-row-bar" style={{ background: color }} />}

      <span className="notif-row-icon" style={{ background: `${color}18`, color }}>
        <IconComponent size={18} />
      </span>

      <div className="notif-row-body">
        <div className="notif-row-title-row">
          <p className="notif-row-title">{notification.title}</p>
          <span className="notif-row-time">{timeAgo(notification.created_at)}</span>
        </div>
        <p className="notif-row-desc">{notification.description}</p>
      </div>

      {isUnread && (
        <span className="notif-row-dot" style={{ background: color }} />
      )}
    </div>
  );
}

/* ── Role helpers ─────────────────────────────────────── */
function getRole() {
  const user = getStoredUser();
  return user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);
}

function isStaffUser() { return !!getRole(); }

function LayoutWrapper({ role, children }) {
  if (['admin', 'manager', 'receptionist', 'front_desk'].includes(role)) {
    return <AdminLayout>{children}</AdminLayout>;
  }
  if (['housekeeping', 'maintenance', 'security'].includes(role)) {
    return <StaffLayout>{children}</StaffLayout>;
  }
  return <>{children}</>;
}

const FILTER_OPTIONS = [
  { value: 'all',    label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read',   label: 'Read' },
];

/* ══════════════════════════════════════════════════════
   SHARED LIST CONTENT
   ══════════════════════════════════════════════════════ */
function NotificationListContent({ loading, error, filtered, filter, setFilter, onItemClick }) {
  if (loading) return <GuestLoadingSkeleton />;
  if (error)   return <GuestErrorState message={error} />;
  if (filtered.length === 0) {
    return <GuestEmptyState filter={filter} onClear={() => setFilter('all')} />;
  }

  return (
    <div className="notif-page-list-wrapper">
      <p className="notif-count">
        <span className="count-number">{filtered.length}</span>
        {' '}notification{filtered.length !== 1 ? 's' : ''}
      </p>
      <div className="notif-page-list">
        {filtered.map((n) => (
          <NotificationRow key={n.id} notification={n} onClick={onItemClick} />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN CONTENT
   ══════════════════════════════════════════════════════ */
function NotificationContent({ isStaff }) {
  const { notifications, unreadCount, loading, error, markAsRead, markAllRead } = useNotifications();
  const [filter,   setFilter]   = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return n.status === 'unread';
    if (filter === 'read')   return n.status === 'read';
    return true;
  });

  const handleItemClick = (notification) => {
    // Mark read first (optimistic — hook updates local state immediately)
    if (notification.status === 'unread' || notification.is_unread === true) {
      markAsRead(notification.id);
    }
    // Open modal
    setSelected(notification);
  };

  const closeModal = () => setSelected(null);

  const toolbar = (
    <div className="notif-page-toolbar">
      <div className="notif-filter-pills">
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            className={`notif-filter-pill${filter === value ? ' active' : ''}`}
            onClick={() => setFilter(value)}
          >
            {label}
            {value === 'unread' && unreadCount > 0 && (
              <span className="pill-badge">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {unreadCount > 0 && (
        <button className="notif-mark-all-page-btn" onClick={markAllRead}>
          <CheckCheck size={14} /> Mark all as read
        </button>
      )}
    </div>
  );

  /* ── Staff layout ── */
  if (isStaff) {
    return (
      <div className="sf-page">
        <div className="sf-inner">
          <div className="sf-toprow">
            <div className="sf-toprow-left">
              <p className="sf-eyebrow">Staff</p>
              <h1>Notifications</h1>
              <p>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
            </div>
          </div>
          {toolbar}
          <NotificationListContent
            loading={loading} error={error}
            filtered={filtered} filter={filter} setFilter={setFilter}
            onItemClick={handleItemClick}
          />
        </div>
        {selected && <NotificationDetailModal notification={selected} onClose={closeModal} />}
      </div>
    );
  }

  /* ── Guest layout — NO hero, NO watermark ── */
  return (
    <div className="notif-page">
      <Navbar />

      <div className="notif-page-container">
        {/* Simple page header */}
        <div className="notif-page-header">
          <div>
            <span className="notif-page-eyebrow">Your Account</span>
            <h1 className="notif-page-title">Notifications</h1>
          </div>
          {unreadCount > 0 && (
            <span className="notif-unread-summary">{unreadCount} unread</span>
          )}
        </div>

        {toolbar}

        <NotificationListContent
          loading={loading} error={error}
          filtered={filtered} filter={filter} setFilter={setFilter}
          onItemClick={handleItemClick}
        />
      </div>

      <Footer />

      {selected && <NotificationDetailModal notification={selected} onClose={closeModal} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   PAGE ENTRY POINT
   ══════════════════════════════════════════════════════ */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const staff    = isStaffUser();
  const role     = getRole();

  useEffect(() => {
    if (!isAuthenticated()) navigate('/login', { replace: true });
  }, [navigate]);

  if (!isAuthenticated()) return null;

  if (staff) {
    return (
      <LayoutWrapper role={role}>
        <NotificationContent isStaff={true} />
      </LayoutWrapper>
    );
  }

  return <NotificationContent isStaff={false} />;
}

/* ── Loading skeleton ─────────────────────────────────── */
function GuestLoadingSkeleton() {
  return (
    <div className="notif-skeleton-list">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="notif-skeleton-row">
          <div className="skeleton notif-sk-icon" />
          <div className="notif-sk-body">
            <div className="skeleton notif-sk-title" />
            <div className="skeleton notif-sk-desc" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GuestEmptyState({ filter, onClear }) {
  return (
    <div className="notif-empty-page">
      <div className="notif-empty-icon-wrap"><Bell size={28} /></div>
      <h3>{filter !== 'all' ? 'No notifications match this filter' : 'No notifications yet'}</h3>
      <p>
        {filter !== 'all'
          ? 'Try switching to "All" to see every notification.'
          : 'Notifications will appear here when there is activity on your bookings.'}
      </p>
      {filter !== 'all' && (
        <button className="btn btn-primary" onClick={onClear} style={{ marginTop: 8 }}>
          Show All
        </button>
      )}
    </div>
  );
}

function GuestErrorState({ message }) {
  return (
    <div className="notif-error-page">
      <div className="notif-empty-icon-wrap"><AlertCircle size={28} /></div>
      <h3>Something went wrong</h3>
      <p>{message || 'Failed to load notifications. Please try again.'}</p>
    </div>
  );
}