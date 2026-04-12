/**
 * FrontDeskLayout.jsx
 *
 * Sidebar layout wrapper for all Front Desk pages.
 * Matches the AdminLayout luxury dark gold theme exactly.
 * All classes prefixed fdl- to avoid collision with fd- (FrontDesk.css).
 *
 * RBAC: front_desk, admin, manager
 *
 * FIX: Added "Support Tickets" nav item so Front Desk staff can see and
 *      respond to guest support tickets routed to the FRONT_DESK tier.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Home, ClipboardList, BedDouble, Calendar,
  UserCheck, CreditCard, LogOut, Settings,
  ChevronLeft, ChevronRight, Menu, X,
  Users, Shield, LayoutDashboard, Wrench, AlertOctagon, FileText,
  MessageSquare,UtensilsCrossed ,
} from 'lucide-react';
import { logoutUser, getStoredUser } from '../../../services/api';
import NotificationBell from '../../notifications/NotificationBell';
import { usePresenceHeartbeat } from '../hooks/usePresenceHeartbeat';

import './FrontDeskLayout.css';

// ── Navigation items visible in the Front Desk sidebar ───────────────────────
const NAV_ITEMS = [
  {
    key: 'fd-dashboard',
    label: 'Dashboard',
    icon: <Home size={18} />,
    to: '/staff/front-desk',
    exact: true,
  },

  {
    key: 'food-orders',
    label: 'Food Orders',
    icon: <UtensilsCrossed size={17} />,
    to: '/staff/front-desk/food-orders'

  },
  {
    key: 'checkin',
    label: 'Guest Check-In',
    icon: <UserCheck size={18} />,
    to: '/staff/check-in',
  },
  {
    key: 'today',
    label: "Today's Arrivals",
    icon: <Calendar size={18} />,
    to: '/staff/front-desk/today',
  },
  {
    key: 'rooms',
    label: 'Room Status Board',
    icon: <BedDouble size={18} />,
    to: '/staff/front-desk/rooms',
  },
  {
    key: 'walkin',
    label: 'Walk-In Booking',
    icon: <ClipboardList size={18} />,
    to: '/staff/front-desk/walk-in',
  },
  {
    key: 'payments',
    label: 'Payments',
    icon: <CreditCard size={18} />,
    to: '/staff/front-desk/payments',
  },
  // ── Support Tickets (ADDED) ─────────────────────────────────────────────────
  // Front Desk staff must be able to see and respond to guest support tickets
  // that are routed to the FRONT_DESK tier. Without this nav item they have
  // no way to reach the support queue.
  {
    key: 'support-tickets',
    label: 'Support Tickets',
    icon: <MessageSquare size={18} />,
    to: '/staff/front-desk/support',
  },
];

// ── Reporting section nav items ───────────────────────────────────────────────
const REPORTING_ITEMS = [
  {
    key: 'report-maintenance',
    label: 'Report Issue',
    icon: <Wrench size={18} />,
    to: '/staff/report-maintenance',
  },
  {
    key: 'my-maintenance-requests',
    label: 'My Requests',
    icon: <FileText size={18} />,
    to: '/staff/my-maintenance-requests',
  },
  {
    key: 'report-incident',
    label: 'Report Incident',
    icon: <AlertOctagon size={18} />,
    to: '/staff/report-incident',
  },
  {
    key: 'my-incidents',
    label: 'My Incidents',
    icon: <Shield size={18} />,
    to: '/staff/my-incidents',
  },
];

// ── Secondary nav items ───────────────────────────────────────────────────────
const SECONDARY_ITEMS = [
  {
    key: 'shifts',
    label: 'My Shifts',
    icon: <Calendar size={18} />,
    to: '/staff/my-shifts',
  },
  {
    key: 'activity',
    label: 'Activity Log',
    icon: <ClipboardList size={18} />,
    to: '/staff/my-activity-logs',
  },
];

// ── Role display helpers ──────────────────────────────────────────────────────
const ROLE_LABELS = {
  admin:        'Administrator',
  manager:      'Manager',
  front_desk:   'Front Desk',
  receptionist: 'Receptionist',
};
const ROLE_ICONS = {
  admin:        <Shield size={11} />,
  manager:      <Users  size={11} />,
  front_desk:   <Users  size={11} />,
  receptionist: <Users  size={11} />,
};

// ── Layout component ──────────────────────────────────────────────────────────
export default function FrontDeskLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user     = getStoredUser();
  const role     = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);
  usePresenceHeartbeat();

  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try { await logoutUser(); } catch {}
      window.location.href = '/login';
    }
  };

  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Staff';
  const initials    = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  function isActive(item) {
    if (item.exact) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + '/');
  }

  function NavItem({ item }) {
    const active = isActive(item);
    return (
      <Link
        to={item.to}
        className={`fdl-nav-item${active ? ' fdl-nav-active' : ''}`}
        title={collapsed ? item.label : undefined}
      >
        <span className="fdl-nav-icon">{item.icon}</span>
        {!collapsed && <span className="fdl-nav-label-text">{item.label}</span>}
        {collapsed  && <span className="fdl-nav-tooltip">{item.label}</span>}
      </Link>
    );
  }

  return (
    <div className={`fdl-root${collapsed ? ' fdl-collapsed' : ''}${mobileOpen ? ' fdl-mobile-open' : ''}`}>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fdl-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className="fdl-sidebar">

        {/* Brand */}
        <div className="fdl-brand">
          <div className="fdl-brand-icon">⟡</div>
          {!collapsed && <span className="fdl-brand-name">CEBU MINI HOTEL</span>}
          <button
            className="fdl-collapse-btn"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Staff badge */}
        {!collapsed ? (
          <div className="fdl-staff-badge">
            <div className="fdl-staff-avatar">{initials || displayName[0]?.toUpperCase()}</div>
            <div className="fdl-staff-info">
              <span className="fdl-staff-name">{displayName}</span>
              <span className="fdl-staff-role">
                {ROLE_ICONS[role]}
                {ROLE_LABELS[role] ?? role}
              </span>
            </div>
          </div>
        ) : (
          <div className="fdl-staff-avatar-only" title={displayName}>
            {initials || displayName[0]?.toUpperCase()}
          </div>
        )}

        {/* Primary nav + Support Tickets */}
        <nav className="fdl-nav">
          <div className="fdl-nav-label">{!collapsed && 'FRONT DESK'}</div>

          {NAV_ITEMS.map(item => (
            <NavItem key={item.key} item={item} />
          ))}

          {/* Divider + reporting section */}
          <div className="fdl-nav-divider" style={{ margin: '10px 0' }} />
          <div className="fdl-nav-label">{!collapsed && 'REPORTING'}</div>

          {REPORTING_ITEMS.map(item => (
            <NavItem key={item.key} item={item} />
          ))}

          {/* Divider + secondary items */}
          <div className="fdl-nav-divider" style={{ margin: '10px 0' }} />
          <div className="fdl-nav-label">{!collapsed && 'MY ACCOUNT'}</div>

          {SECONDARY_ITEMS.map(item => (
            <NavItem key={item.key} item={item} />
          ))}

          {/* Back to Admin Panel — only for admin / manager */}
          {['admin', 'manager'].includes(role) && (
            <>
              <div className="fdl-nav-divider" style={{ margin: '10px 0' }} />
              <Link
                to="/admin/dashboard"
                className="fdl-nav-item"
                title={collapsed ? 'Admin Panel' : undefined}
              >
                <span className="fdl-nav-icon"><LayoutDashboard size={18} /></span>
                {!collapsed && <span className="fdl-nav-label-text">Admin Panel</span>}
                {collapsed  && <span className="fdl-nav-tooltip">Admin Panel</span>}
              </Link>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="fdl-sidebar-footer">
          <Link
            to="/settings?from=frontdesk"
            className="fdl-footer-btn"
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings size={16} />
            {!collapsed && <span>Settings</span>}
            {collapsed  && <span className="fdl-nav-tooltip">Settings</span>}
          </Link>
          <button
            className="fdl-footer-btn fdl-footer-btn--danger"
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut size={16} />
            {!collapsed && <span>Logout</span>}
            {collapsed  && <span className="fdl-nav-tooltip">Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="fdl-main">

        {/* Desktop topbar — notification bell top-right */}
        <div className="fdl-topbar">
          <div className="fdl-topbar-right">
            <NotificationBell />
          </div>
        </div>

        {/* Mobile topbar */}
        <header className="fdl-mobile-topbar">
          <button className="fdl-mobile-menu-btn" onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="fdl-mobile-brand">FRONT DESK</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            <div className="fdl-mobile-avatar">
              {initials || displayName[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        <div className="fdl-content">{children}</div>
      </div>
    </div>
  );
}