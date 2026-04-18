/**
 * Navbar.jsx — Cebu Mini Hotel
 * Shared top navigation for all guest-facing pages.
 *
 * FIX: useNotifications() was wrapped in try/catch which violates Rules of Hooks —
 * hooks cannot be called conditionally or inside try/catch. This caused the hook
 * to silently break the entire notifications state tree, making bell badge, filter
 * pills, and markAsRead all non-functional. Moved the auth guard to a wrapper
 * component so the hook is always called unconditionally when rendered.
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logoutUser, isAuthenticated, getStoredUser } from '../../services/api';
import { useNotifications } from '../../features/hooks/useNotifications';
import './Navbar.css';

/* ── SVG Icons ────────────────────────────────────────────── */
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function RoomsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  );
}

function BookingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
    </svg>
  );
}

function FoodIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
      <path d="M7 2v20"/>
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}


function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M20 12h-2M6 12H4M17.66 17.66l-1.41-1.41M7.76 7.76L6.34 6.34M12 20v-2M12 6V4"/>
    </svg>
  );
}

/* ── Tabs config ─────────────────────────────────────────── */
const GUEST_TABS = [
  { label: 'Home',     path: '/dashboard',  icon: HomeIcon },
  { label: 'Rooms',    path: '/rooms',       icon: RoomsIcon },
  { label: 'My Bookings', path: '/bookings/my', icon: BookingsIcon },
  { label: 'Food & Drinks', path: '/food',       icon: FoodIcon  },

];

/* ── Inner navbar that always calls useNotifications ────────
   Separated from the outer component so the hook is called
   unconditionally — never inside a condition or try/catch.
   ─────────────────────────────────────────────────────────── */
function NavbarInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = getStoredUser();

  // Hook always called here — no try/catch, no condition
  const { unreadCount } = useNotifications();

  const isActive = (path) => location.pathname.startsWith(path);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      try { await logoutUser(); } catch { /* ignored */ }
      window.location.href = '/login';
    }
  };

  return (
    <nav className="cmh-navbar">
      <div className="cmh-navbar-inner">
        {/* Brand */}
        <Link to="/dashboard" className="cmh-navbar-brand">
          <span className="cmh-navbar-brand-name">Cebu Mini Hotel</span>
          <span className="cmh-navbar-brand-sub">Luxury · Cebu City</span>
        </Link>

        {/* Center tabs */}
        <div className="cmh-navbar-tabs">
          {GUEST_TABS.map(({ label, path, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`cmh-nav-tab${isActive(path) ? ' cmh-nav-tab--active' : ''}`}
            >
              <Icon />
              {label}
            </Link>
          ))}
          {user?.is_staff && (
            <Link
              to="/admin/rooms"
              className={`cmh-nav-tab${isActive('/admin') ? ' cmh-nav-tab--active' : ''}`}
            >
              <AdminIcon />
              Admin
            </Link>
          )}
        </div>

        {/* Right actions */}
        <div className="cmh-navbar-actions">
          {/* Notifications bell */}
          <Link to="/notifications" className="cmh-navbar-icon-btn" title="Notifications">
            <BellIcon />
            {unreadCount > 0 && (
              <span className="cmh-navbar-notif-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          {/* Account */}
          <Link to="/settings" className="cmh-navbar-icon-btn" title="Account Settings">
            <UserIcon />
          </Link>

          <div className="cmh-navbar-divider" />

          {/* Logout */}
          <button
            className="cmh-navbar-icon-btn"
            onClick={handleLogout}
            title="Log out"
          >
            <LogoutIcon />
          </button>

          {/* Mobile hamburger */}
          <button
            className="cmh-navbar-mobile-toggle"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`cmh-navbar-mobile-menu${mobileOpen ? ' open' : ''}`}>
        {GUEST_TABS.map(({ label, path, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className={`cmh-navbar-mobile-tab${isActive(path) ? ' cmh-navbar-mobile-tab--active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            <Icon />
            {label}
          </Link>
        ))}
        {user?.is_staff && (
          <Link
            to="/admin/rooms"
            className="cmh-navbar-mobile-tab"
            onClick={() => setMobileOpen(false)}
          >
            <AdminIcon />
            Admin Panel
          </Link>
        )}
        <Link
          to="/notifications"
          className="cmh-navbar-mobile-tab"
          onClick={() => setMobileOpen(false)}
        >
          <BellIcon />
          Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}
        </Link>
        <Link
          to="/settings"
          className="cmh-navbar-mobile-tab"
          onClick={() => setMobileOpen(false)}
        >
          <UserIcon />
          Account
        </Link>
        <button
          className="cmh-navbar-mobile-tab"
          onClick={() => { setMobileOpen(false); handleLogout(); }}
        >
          <LogoutIcon />
          Log Out
        </button>
      </div>
    </nav>
  );
}

/* ── Public Navbar component ─────────────────────────────────
   Guards unauthenticated users — renders login/register buttons
   instead of mounting NavbarInner (which calls useNotifications).
   This keeps the hook always called unconditionally within its
   component, satisfying Rules of Hooks.
   ─────────────────────────────────────────────────────────── */
export default function Navbar() {
  const authed = isAuthenticated();

  if (!authed) {
    return (
      <nav className="cmh-navbar">
        <div className="cmh-navbar-inner">
          <Link to="/" className="cmh-navbar-brand">
            <span className="cmh-navbar-brand-name">Cebu Mini Hotel</span>
            <span className="cmh-navbar-brand-sub">Luxury · Cebu City</span>
          </Link>
          <div className="cmh-navbar-actions">
            <Link to="/login"    className="cmh-navbar-btn cmh-navbar-btn--outline">Log In</Link>
            <Link to="/register" className="cmh-navbar-btn cmh-navbar-btn--filled">Register</Link>
          </div>
        </div>
      </nav>
    );
  }

  // Only mount NavbarInner (which calls useNotifications) when authenticated
  return <NavbarInner />;
}