/**
 * NotificationsPage.jsx
 * =====================
 * Role-aware full notifications page.
 *
 * Staff (admin/manager/housekeeping/etc.) → renders inside their layout
 *   with staff-appropriate styling and no broken booking links.
 *
 * Guests → renders the original guest-styled hero version.
 *
 * Accessible via /notifications route for all users.
 */

import { useState, useEffect } from 'react';
import { Bell, CheckCheck, Filter, ArrowLeft } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { isAuthenticated, getStoredUser } from '../../services/api';
import NotificationItem from './NotificationItem';
import AdminLayout from '../adminPanel/layout/AdminLayout';
import StaffLayout from '../staff/StaffLayout';
import './NotificationsPage.css';

const FILTER_OPTIONS = [
  { value: 'all',    label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read',   label: 'Read' },
];

// ── Role helpers ──────────────────────────────────────────────────────────────

function getRole() {
  const user = getStoredUser();
  return user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);
}

function isStaffUser() {
  return !!getRole();
}

function getBackRoute(role) {
  const staffHomeMap = {
    admin:        '/admin/dashboard',
    manager:      '/admin/dashboard',
    receptionist: '/admin/dashboard',
    front_desk:   '/staff/front-desk',
    housekeeping: '/staff/cleaning',
    maintenance:  '/staff/maintenance',
    security:     '/staff/incidents',
  };
  return staffHomeMap[role] ?? '/dashboard';
}

function LayoutWrapper({ role, children }) {
  if (['admin', 'manager', 'receptionist', 'front_desk'].includes(role)) {
    return <AdminLayout>{children}</AdminLayout>;
  }
  if (['housekeeping', 'maintenance', 'security'].includes(role)) {
    return <StaffLayout>{children}</StaffLayout>;
  }
  return <>{children}</>;
}

// ── Shared notification list content ─────────────────────────────────────────

function NotificationContent({ isStaff }) {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, error, markAsRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState('all');
  const role     = getRole();
  const backRoute = getBackRoute(role);

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return n.status === 'unread';
    if (filter === 'read')   return n.status === 'read';
    return true;
  });

  function handleItemClick(n) {
    if (n.status === 'unread') markAsRead(n.id);
  }

  if (isStaff) {
    // ── Staff version — matches sf-page luxury dark theme ─────────────────
    return (
      <div className="sf-page">
        <div className="sf-inner">

          {/* Header */}
          <div className="sf-toprow">
            <div className="sf-toprow-left">
              <p className="sf-eyebrow">Staff</p>
              <h1>Notifications</h1>
              <p>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {unreadCount > 0 && (
                <button className="sf-btn sf-btn-primary" onClick={markAllRead}>
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
              <Link to={backRoute} className="sf-btn">
                <ArrowLeft size={13} /> Back
              </Link>
            </div>
          </div>

          {/* Filter bar */}
          <div className="sf-filter-bar">
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 2,
              textTransform: 'uppercase', color: 'var(--white-dim)',
            }}>
              Filter:
            </span>
            {FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                className={`sf-btn${filter === value ? ' sf-btn-primary' : ''}`}
                style={{ padding: '6px 14px', fontSize: 10 }}
                onClick={() => setFilter(value)}
              >
                {label}
                {value === 'unread' && unreadCount > 0 && (
                  <span style={{
                    marginLeft: 6,
                    background: 'var(--red)',
                    color: '#fff',
                    borderRadius: '50%',
                    padding: '1px 5px',
                    fontSize: 9,
                    fontWeight: 700,
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div className="sf-loading"><div className="sf-spinner" /><p>Loading…</p></div>
          ) : error ? (
            <div className="sf-error"><p>{error}</p></div>
          ) : filtered.length === 0 ? (
            <div className="sf-card" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--white-dim)' }}>
              <Bell size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 13, letterSpacing: 1 }}>
                {filter !== 'all' ? 'No notifications match this filter.' : 'No notifications yet.'}
              </p>
              {filter !== 'all' && (
                <button className="sf-btn" style={{ marginTop: 14 }} onClick={() => setFilter('all')}>
                  Show all
                </button>
              )}
            </div>
          ) : (
            <div className="sf-card" style={{ padding: 0, overflow: 'hidden' }}>
              <p style={{
                fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                color: 'var(--white-dim)', padding: '14px 20px 10px',
                borderBottom: '1px solid var(--gold-border)',
              }}>
                {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {filtered.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onClick={() => handleItemClick(n)}
                  />
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ── Guest version — original hero styling ─────────────────────────────────
  return (
    <div className="notif-page">
      <div className="notif-page-hero">
        <div className="hero-background" />
        <div className="hero-content">
          <div className="hero-icon"><Bell size={32} /></div>
          <h1 className="hero-title">Notifications</h1>
          <p className="hero-subtitle">Stay up to date with your bookings and payments</p>
        </div>
      </div>

      <div className="notif-page-container">
        <div className="notif-page-toolbar">
          <div className="notif-filter-pills">
            <Filter size={14} className="filter-icon" />
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
              <CheckCheck size={15} /> Mark all as read
            </button>
          )}
        </div>

        {loading ? (
          <GuestLoadingSkeleton />
        ) : error ? (
          <GuestErrorState message={error} />
        ) : filtered.length === 0 ? (
          <GuestEmptyState filter={filter} onClear={() => setFilter('all')} />
        ) : (
          <div className="notif-page-list-wrapper">
            <p className="notif-count">
              <span className="count-number">{filtered.length}</span>{' '}
              notification{filtered.length !== 1 ? 's' : ''}
            </p>
            <ul className="notif-page-list">
              {filtered.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={() => handleItemClick(n)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

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

// ── Guest helpers ─────────────────────────────────────────────────────────────

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
      <div className="notif-empty-icon-wrap"><Bell size={40} /></div>
      <h3>{filter !== 'all' ? 'No notifications match this filter' : 'No notifications yet'}</h3>
      <p>
        {filter !== 'all'
          ? 'Try switching to "All" to see every notification.'
          : 'Notifications will appear here when there is activity on your bookings.'}
      </p>
      {filter !== 'all' && (
        <button className="btn btn-primary" onClick={onClear}>Show All</button>
      )}
    </div>
  );
}

function GuestErrorState({ message }) {
  return (
    <div className="notif-error-page">
      <h3>Something went wrong</h3>
      <p>{message || 'Failed to load notifications. Please try again.'}</p>
    </div>
  );
}