// src/features/dashboard/Dashboard.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getCurrentUser, logoutUser, getStoredUser,
  isFirstLogin, clearFirstLoginFlag, isAuthenticated,
} from '../../services/api';
import {
  BookOpen, Settings, LogOut, ArrowRight,
  Users, Bed, Maximize2, MapPin, Phone, Clock,
  CheckCircle2, Tag, Star, Building2,
  Bell, BellOff, CheckCheck, Loader2,
  CalendarCheck, CreditCard, XCircle, AlertCircle,
} from 'lucide-react';
import { useRooms } from '../hooks/useRooms';
import './Dashboard.css';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function authHeaders() {
  const token = localStorage.getItem('accessToken'); // FIX: was 'access_token'
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function timeAgo(dateStr) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(mins  / 60);
    const days  = Math.floor(hours / 24);
    if (mins  < 1)   return 'Just now';
    if (mins  < 60)  return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days  < 7)   return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

// ─────────────────────────────────────────────────────────────
// Notification icon + colour per event type (gold-friendly)
// ─────────────────────────────────────────────────────────────
const EVENT_META = {
  booking_created:   { icon: <CalendarCheck size={15} />, color: '#C9A84C' },
  deposit_received:  { icon: <CreditCard    size={15} />, color: '#60A5FA' },
  booking_confirmed: { icon: <CheckCircle2  size={15} />, color: '#6EE7B7' },
  booking_cancelled: { icon: <XCircle       size={15} />, color: '#F87171' },
  checkin_reminder:  { icon: <Bell          size={15} />, color: '#FCD34D' },
};
function eventMeta(event) {
  return EVENT_META[event] ?? { icon: <AlertCircle size={15} />, color: '#C9A84C' };
}

// ─────────────────────────────────────────────────────────────
// useNotifications — live polling hook (30 s interval)
// ─────────────────────────────────────────────────────────────
const API_BASE = '/api/notifications';
const POLL_MS  = 30_000;

function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false); // FIX: false — no spinner for guests
  const intervalRef = useRef(null);

  const fetch_ = useCallback(async () => {
    // FIX: guard — skip if not logged in
    if (!localStorage.getItem('accessToken')) {
      setLoading(false);
      return;
    }
    try {
      const res  = await fetch(`${API_BASE}/`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setNotifications(list);
      setUnreadCount(list.filter(n => n.status === 'unread').length);
    } catch (_) {
      // silently ignore — never crash the dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/${id}/read/`, {
        method: 'PATCH', headers: authHeaders(),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setNotifications(prev => prev.map(n => n.id === id ? updated : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (_) {}
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/mark-all-read/`, {
        method: 'PATCH', headers: authHeaders(),
      });
      setNotifications(prev => prev.map(n => ({ ...n, status: 'read', is_unread: false })));
      setUnreadCount(0);
    } catch (_) {}
  }, []);

  useEffect(() => {
    // FIX: guard — don't start polling if not logged in
    if (!localStorage.getItem('accessToken')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch_();
    intervalRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetch_]);

  return { notifications, unreadCount, loading, markAsRead, markAllRead };
}

// ─────────────────────────────────────────────────────────────
// NotificationItem
// ─────────────────────────────────────────────────────────────
function NotificationItem({ notification, onRead }) {
  const isUnread = notification.status === 'unread';
  const { icon, color } = eventMeta(notification.event);

  function handleClick() {
    if (isUnread) onRead(notification.id);
  }

  return (
    <li
      className={`db-notif-item${isUnread ? ' db-notif-item--unread' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      style={{ '--nc': color }}
    >
      {isUnread && <span className="db-notif-bar" />}

      <span className="db-notif-icon-bubble" style={{ background: `${color}1A`, color }}>
        {icon}
      </span>

      <div className="db-notif-body">
        <p className="db-notif-title">{notification.title}</p>
        <p className="db-notif-desc">{notification.description}</p>
        <span className="db-notif-time">{timeAgo(notification.created_at)}</span>
      </div>

      {isUnread && <span className="db-notif-dot" style={{ background: color }} />}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────
// NotificationPanel (dropdown)
// ─────────────────────────────────────────────────────────────
function NotificationPanel({ notifications, loading, unreadCount, onRead, onMarkAll, onClose }) {
  const navigate = useNavigate();

  function handleItemClick(n) {
    if (n.status === 'unread') onRead(n.id);
    if (n.booking_id) {
      navigate(`/bookings/my/${n.booking_id}`);
      onClose();
    }
  }

  return (
    <div className="db-notif-panel" role="dialog" aria-label="Notifications">
      {/* Header */}
      <div className="db-notif-panel-header">
        <div className="db-notif-panel-title-row">
          <Bell size={14} />
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="db-notif-panel-badge">{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button className="db-notif-mark-all" onClick={onMarkAll}>
            <CheckCheck size={13} /> Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="db-notif-panel-body">
        {loading ? (
          <div className="db-notif-loading">
            <Loader2 size={20} className="db-notif-spinner" />
            <span>Loading…</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="db-notif-empty">
            <BellOff size={28} />
            <p>No notifications yet</p>
          </div>
        ) : (
          <ul className="db-notif-list">
            {notifications.map(n => (
              <NotificationItem key={n.id} notification={n} onRead={() => handleItemClick(n)} />
            ))}
          </ul>
        )}
      </div>

      {/* Footer link */}
      <div className="db-notif-panel-footer">
        <Link to="/notifications" className="db-notif-view-all" onClick={onClose}>
          View all notifications <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NotificationBell — the nav button + panel wrapper
// ─────────────────────────────────────────────────────────────
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const { notifications, unreadCount, loading, markAsRead, markAllRead } = useNotifications();

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="db-notif-wrapper" ref={wrapRef}>
      <button
        className="db-nav-icon-btn db-notif-btn"
        onClick={() => setOpen(v => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="db-notif-badge" aria-live="polite">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <span className="db-nav-tooltip">Notifications</span>
      </button>

      {open && (
        <NotificationPanel
          notifications={notifications}
          loading={loading}
          unreadCount={unreadCount}
          onRead={markAsRead}
          onMarkAll={markAllRead}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DashboardRoomCard
// ─────────────────────────────────────────────────────────────
function DashboardRoomCard({ room }) {
  const {
    id, room_number, room_type_display, bed_type_display, capacity,
    price_per_night, discounted_price, discount_percentage,
    status, status_display, size_sqm, primary_image,
  } = room;

  const hasDiscount    = Number(discount_percentage) > 0;
  const effectivePrice = hasDiscount ? discounted_price : price_per_night;

  return (
    <Link to={`/rooms/${id}`} className="db-room-card">
      <div className="db-room-img-wrap">
        {primary_image?.image_url ? (
          <img
            src={primary_image.image_url}
            alt={`${room_type_display} Room ${room_number}`}
            className="db-room-card-img"
          />
        ) : (
          <div className="db-room-img-placeholder"><Bed size={36} /></div>
        )}
        <div className="db-room-overlay" />
        <div className="db-room-number-badge">Room {room_number}</div>
        <div className={`db-room-status-badge status-${status}`}>{status_display}</div>
        {hasDiscount && (
          <div className="db-discount-badge">
            <Tag size={10} /> {Number(discount_percentage)}% OFF
          </div>
        )}
      </div>
      <div className="db-room-body">
        <h3 className="db-room-type">{room_type_display} Room</h3>
        <div className="db-room-specs">
          <span className="db-room-spec"><Users size={12} />{capacity} {capacity === 1 ? 'Guest' : 'Guests'}</span>
          <span className="db-room-spec"><Bed size={12} />{bed_type_display}</span>
          {size_sqm && <span className="db-room-spec"><Maximize2 size={12} />{size_sqm} m²</span>}
        </div>
        <div className="db-room-footer">
          <div className="db-room-price">
            {hasDiscount && <div className="db-price-original">₱{formatPrice(price_per_night)}</div>}
            <div className="db-price-amount">₱{formatPrice(effectivePrice)}</div>
            <div className="db-price-per">/ night</div>
          </div>
          <span className="db-room-cta">View <ArrowRight size={13} /></span>
        </div>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// NavIconBtn
// ─────────────────────────────────────────────────────────────
function NavIconBtn({ icon, label, to, onClick, danger }) {
  const cls = `db-nav-icon-btn${danger ? ' danger' : ''}`;
  if (to) {
    return (
      <Link to={to} className={cls} title={label}>
        {icon}
        <span className="db-nav-tooltip">{label}</span>
      </Link>
    );
  }
  return (
    <button className={cls} onClick={onClick} title={label}>
      {icon}
      <span className="db-nav-tooltip">{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Dashboard (main)
// ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [user,        setUser]        = useState(getStoredUser());
  const [loading,     setLoading]     = useState(true);
  const [showWelcome, setShowWelcome] = useState(isFirstLogin());

  const { rooms, loading: roomsLoading, error: roomsError } = useRooms({});

  const recommended = rooms
    ? [...rooms]
        .filter(r => r.status === 'available')
        .sort((a, b) => Number(b.discount_percentage) - Number(a.discount_percentage))
        .slice(0, 3)
    : [];

  useEffect(() => {
    fetchUserData();
    if (showWelcome) {
      setTimeout(() => { setShowWelcome(false); clearFirstLoginFlag(); }, 5000);
    }
  }, []);

  const fetchUserData = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (error) {
      if (error.response?.status === 401) navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try { await logoutUser(); } catch {}
      window.location.href = '/login';
    }
  };

  if (loading) {
    return (
      <div className="db-page">
        <div className="db-loading">
          <div className="db-spinner" />
          <p>Loading your experience</p>
        </div>
      </div>
    );
  }

  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Guest';

  return (
    <div className="db-page">

      {/* ── Welcome Banner ── */}
      {showWelcome && (
        <div className="db-welcome-banner">
          <div className="db-welcome-text">
            <h2>Welcome to Cebu Mini Hotel, {displayName}</h2>
            <p>Your account has been created. We look forward to hosting you.</p>
          </div>
          <button
            className="db-welcome-close"
            onClick={() => { setShowWelcome(false); clearFirstLoginFlag(); }}
          >×</button>
        </div>
      )}

      {/* ── Top Bar ── */}
      <header className="db-topbar">
        {/* Brand */}
        <div className="db-topbar-brand" onClick={() => navigate('/')}>
          <div className="db-brand-icon">⟡</div>
          <span className="db-brand-name">CEBU MINI HOTEL</span>
        </div>

        {/* Greeting */}
        <span className="db-topbar-greeting">
          Welcome back, <strong>{displayName}</strong>
        </span>

        {/* Icon nav */}
        <nav className="db-icon-nav">
          <NavIconBtn icon={<Building2 size={18} />} label="Rooms"            to="/rooms" />
          <NavIconBtn icon={<BookOpen  size={18} />} label="My Bookings"      to="/bookings/my" />
          <NavIconBtn icon={<Star      size={18} />} label="Reviews"          onClick={() => alert('Coming soon!')} />
          <NavIconBtn icon={<Settings  size={18} />} label="Account Settings" to="/settings" />
          {user?.is_staff && (
            <NavIconBtn icon={<Bed size={18} />} label="Manage Rooms" to="/admin/rooms" />
          )}

          {/* ── Notification Bell — only for authenticated users ── */}
          {isAuthenticated() && <NotificationBell />}

          <div className="db-nav-divider" />
          <NavIconBtn icon={<LogOut size={18} />} label="Logout" onClick={handleLogout} danger />
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="db-main">

        <div className="db-page-header">
          <p className="db-eyebrow">Guest Dashboard</p>
          <h1 className="db-page-title">Good to have you back</h1>
          <p className="db-page-subtitle">Explore our rooms and manage your reservations.</p>
          <div className="db-divider" />
        </div>

        {/* Profile + Stats */}
        <div className="db-top-row">
          <div className="db-card db-profile-card">
            <div className="db-card-label">Your Profile</div>
            <div className="db-profile-inner">
              <div className="db-avatar">
                {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="db-profile-info">
                <h2>{user?.full_name || user?.email}</h2>
                <p>{user?.email}</p>
                <div className="db-badges">
                  <span className="db-badge db-badge-gold">
                    <CheckCircle2 size={11} />
                    {user?.is_verified ? 'Verified' : 'Pending'}
                  </span>
                  <span className="db-badge db-badge-muted">
                    {user?.auth_provider === 'google'   ? 'Google'   :
                     user?.auth_provider === 'facebook' ? 'Facebook' : 'Email'}
                  </span>
                </div>
              </div>
            </div>
            <div className="db-member-since">
              Member since {new Date(user?.date_joined).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            </div>
          </div>

          <div className="db-card db-stats-card">
            <div className="db-card-label">Your Stats</div>
            <div className="db-stats-grid">
              {[
                { value: '0',   label: 'Total Bookings' },
                { value: '0',   label: 'Nights Stayed'  },
                { value: '0',   label: 'Reviews Left'   },
                { value: 'New', label: 'Member Status'  },
              ].map(s => (
                <div className="db-stat" key={s.label}>
                  <div className="db-stat-value">{s.value}</div>
                  <div className="db-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recommended Rooms */}
        <section className="db-rooms-section">
          <div className="db-section-head">
            <div>
              <p className="db-eyebrow">Hand-picked for you</p>
              <h2 className="db-section-title">Recommended Rooms</h2>
            </div>
            <Link to="/rooms" className="db-btn-view-all">
              Browse All <ArrowRight size={14} />
            </Link>
          </div>

          {roomsLoading && (
            <div className="db-rooms-loading">
              <div className="db-spinner" />
              <p>Finding the best rooms…</p>
            </div>
          )}
          {roomsError && (
            <div className="db-rooms-message">Unable to load rooms. Please try again.</div>
          )}
          {!roomsLoading && !roomsError && recommended.length === 0 && (
            <div className="db-rooms-message">No rooms available right now.</div>
          )}
          {!roomsLoading && !roomsError && recommended.length > 0 && (
            <div className="db-rooms-grid">
              {recommended.map(room => (
                <DashboardRoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </section>

        {/* Activity + Hotel Info */}
        <div className="db-bottom-row">
          <div className="db-card">
            <div className="db-card-label">Recent Activity</div>
            <div className="db-activity-list">
              <div className="db-activity-item">
                <div className="db-activity-dot"><CheckCircle2 size={14} /></div>
                <div>
                  <p className="db-activity-title">Account Created</p>
                  <p className="db-activity-time">{new Date(user?.date_joined).toLocaleString()}</p>
                </div>
              </div>
              {user?.last_login && user.last_login !== user.date_joined && (
                <div className="db-activity-item">
                  <div className="db-activity-dot"><LogOut size={14} /></div>
                  <div>
                    <p className="db-activity-title">Last Login</p>
                    <p className="db-activity-time">{new Date(user.last_login).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="db-card">
            <div className="db-card-label">Hotel Information</div>
            <div className="db-hotel-info">
              <div className="db-hotel-info-item"><MapPin size={13} /><span>123 Colon St., Cebu City, 6000</span></div>
              <div className="db-hotel-info-item"><Phone  size={13} /><span>+63 32 123 4567</span></div>
              <div className="db-hotel-info-item"><Clock  size={13} /><span>Check-in 2:00 PM · Check-out 12:00 PM</span></div>
              <div className="db-hotel-hotel-info-divider" />
              <div className="db-hotel-policy">
                <h4>Cancellation Policy</h4>
                <p>Free cancellation up to 48 hours before check-in. Cancellations within 48 hours are subject to a one-night charge.</p>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}