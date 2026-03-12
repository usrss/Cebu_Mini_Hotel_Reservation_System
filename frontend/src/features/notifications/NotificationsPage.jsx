/**
 * NotificationsPage.jsx
 * =====================
 * Full-page notifications view.
 * Accessible via /notifications route.
 * Mirrors the styling patterns of MyBookingsPage.jsx.
 */

import { useState, useEffect } from 'react';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { isAuthenticated } from '../../services/api';  // ← adjust path if needed
import NotificationItem from './NotificationItem';
import './NotificationsPage.css';

const FILTER_OPTIONS = [
  { value: 'all',    label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read',   label: 'Read' },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, error, markAsRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState('all');

  // Guard — redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated()) navigate('/login', { replace: true });
  }, [navigate]);

  // Don't render anything while redirecting
  if (!isAuthenticated()) return null;

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return n.status === 'unread';
    if (filter === 'read')   return n.status === 'read';
    return true;
  });

  function handleItemClick(n) {
    if (n.status === 'unread') markAsRead(n.id);
  }

  return (
    <div className="notif-page">
      {/* Hero — mirrors MyBookingsPage hero */}
      <div className="notif-page-hero">
        <div className="hero-background" />
        <div className="hero-content">
          <div className="hero-icon"><Bell size={32} /></div>
          <h1 className="hero-title">Notifications</h1>
          <p className="hero-subtitle">Stay up to date with your bookings and payments</p>
        </div>
      </div>

      {/* Main content */}
      <div className="notif-page-container">
        {/* Toolbar */}
        <div className="notif-page-toolbar">
          {/* Filter pills */}
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

          {/* Mark all read */}
          {unreadCount > 0 && (
            <button className="notif-mark-all-page-btn" onClick={markAllRead}>
              <CheckCheck size={15} />
              Mark all as read
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState message={error} />
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} onClear={() => setFilter('all')} />
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

// ── Skeleton ─────────────────────────────────────────────────────────────────
function LoadingSkeleton() {
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

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ filter, onClear }) {
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

// ── Error state ───────────────────────────────────────────────────────────────
function ErrorState({ message }) {
  return (
    <div className="notif-error-page">
      <h3>Something went wrong</h3>
      <p>{message || 'Failed to load notifications. Please try again.'}</p>
    </div>
  );
}