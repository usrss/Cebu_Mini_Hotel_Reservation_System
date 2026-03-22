import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Users, CreditCard, Star, BarChart2, Home,
  LogOut, Settings, ChevronLeft, ChevronRight,
  Menu, X, Building2, Shield, Wrench, BedDouble,
  LineChart, UserCog, ClipboardList, ChevronDown,
  MessageSquare,
} from 'lucide-react';
import { logoutUser, getStoredUser } from '../../../services/api';
import NotificationBell from '../../notifications/NotificationBell';
import { usePresenceHeartbeat } from '../../staff/hooks/usePresenceHeartbeat';
import './AdminLayout.css';

// ── Nav structure ─────────────────────────────────────────────────────────────
const NAV_STRUCTURE = [
  {
    type: 'link',
    key: 'dashboard',
    label: 'Dashboard',
    icon: <Home size={18} />,
    to: '/admin/dashboard',
    roles: ['admin','manager','receptionist','front_desk','housekeeping','maintenance','security'],
  },
  {
    type: 'link',
    key: 'analytics',
    label: 'Analytics',
    icon: <LineChart size={18} />,
    to: '/admin/analytics',
    roles: ['admin','manager'],
  },
  {
    type: 'link',
    key: 'staff',
    label: 'Staff',
    icon: <UserCog size={18} />,
    to: '/admin/staff',
    roles: ['admin'],
  },
  {
    type: 'link',
    key: 'guests',
    label: 'Guests',
    icon: <Users size={18} />,
    to: '/admin/guests',
    roles: ['admin','manager','receptionist','front_desk'],
  },
  {
    type: 'group',
    key: 'payments-group',
    label: 'Payments',
    icon: <CreditCard size={18} />,
    roles: ['admin','manager','front_desk'],
    children: [
      { key:'payments', label:'All Payments', to:'/admin/payments',         roles:['admin','manager','front_desk'] },
      { key:'revenue',  label:'Revenue',      to:'/admin/payments/revenue', roles:['admin','manager'] },
    ],
  },
  {
    type: 'group',
    key: 'reviews-group',
    label: 'Reviews',
    icon: <Star size={18} />,
    roles: ['admin','manager'],
    children: [
      { key:'reviews',      label:'Moderate',   to:'/admin/reviews',       roles:['admin','manager'] },
      { key:'review-stats', label:'Statistics', to:'/admin/reviews/stats', roles:['admin','manager'] },
    ],
  },
  {
    type: 'link',
    key: 'rooms',
    label: 'Rooms',
    icon: <BedDouble size={18} />,
    to: '/admin/rooms',
    roles: ['admin','manager','housekeeping','maintenance'],
  },
{
    type: 'group',
    key: 'operations-group',
    label: 'Operations',
    icon: <ClipboardList size={18} />,
    roles: ['admin', 'manager'],
    children: [
      { key: 'housekeeping',         label: 'Housekeeping',     to: '/staff/cleaning',               roles: ['admin', 'manager'] },
      { key: 'maintenance',          label: 'Maintenance Tasks', to: '/staff/maintenance',           roles: ['admin', 'manager'] },
      { key: 'maintenance-requests', label: 'Maint. Requests',  to: '/staff/maintenance-requests',   roles: ['admin', 'manager'] },
      { key: 'incidents',            label: 'Incidents',        to: '/staff/incidents',              roles: ['admin', 'manager'] },
      { key: 'monitoring',           label: 'Staff Monitoring', to: '/staff/monitoring',             roles: ['admin', 'manager'] }
    ],
  },
  // ── Support Tickets ──────────────────────────────────────────────────────
  {
    type: 'link',
    key: 'support',
    label: 'Support Tickets',
    icon: <MessageSquare size={18} />,
    to: '/admin/support',
    roles: ['admin', 'manager'],
  },
];

const ROLE_LABELS = {
  admin:'Administrator', manager:'Manager', receptionist:'Receptionist',
  front_desk:'Front Desk', housekeeping:'Housekeeping',
  maintenance:'Maintenance', security:'Security',
};
const ROLE_ICONS = {
  admin:        <Shield size={11} />,
  manager:      <Building2 size={11} />,
  receptionist: <Users size={11} />,
  front_desk:   <Users size={11} />,
  housekeeping: <BedDouble size={11} />,
  maintenance:  <Wrench size={11} />,
  security:     <Shield size={11} />,
};

// ── NavGroup ──────────────────────────────────────────────────────────────────
function NavGroup({ item, role, collapsed, location }) {
  const visibleChildren = item.children.filter(c => c.roles.includes(role));
  if (visibleChildren.length === 0) return null;

  const isChildActive = visibleChildren.some(
    c => location.pathname === c.to || location.pathname.startsWith(c.to + '/')
  );

  const [open, setOpen] = useState(isChildActive);

  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [location.pathname]);

  if (collapsed) {
    return (
      <div className="al-nav-item al-nav-group-collapsed">
        <span className={`al-nav-icon${isChildActive ? ' al-nav-icon--active' : ''}`}>
          {item.icon}
        </span>
        <span className="al-nav-tooltip al-nav-tooltip--group">
          <span className="al-nav-tooltip-title">{item.label}</span>
          {visibleChildren.map(c => (
            <Link
              key={c.key}
              to={c.to}
              className={`al-nav-tooltip-child${location.pathname === c.to ? ' active' : ''}`}
            >
              {c.label}
            </Link>
          ))}
        </span>
      </div>
    );
  }

  return (
    <div className="al-nav-group">
      <button
        className={`al-nav-item al-nav-group-btn${isChildActive ? ' al-nav-active' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <span className="al-nav-icon">{item.icon}</span>
        <span className="al-nav-label-text">{item.label}</span>
        <span className={`al-nav-chevron${open ? ' al-nav-chevron--open' : ''}`}>
          <ChevronDown size={13} />
        </span>
      </button>

      <div className={`al-nav-children${open ? ' al-nav-children--open' : ''}`}>
        {visibleChildren.map(child => {
          const active = location.pathname === child.to ||
            location.pathname.startsWith(child.to + '/');
          return (
            <Link
              key={child.key}
              to={child.to}
              className={`al-nav-child${active ? ' al-nav-child--active' : ''}`}
            >
              <span className="al-nav-child-dot" />
              {child.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── NavLink ───────────────────────────────────────────────────────────────────
function NavLink({ item, collapsed, location }) {
  const active = location.pathname === item.to ||
    (item.to !== '/admin/dashboard' && location.pathname.startsWith(item.to + '/'));

  return (
    <Link
      to={item.to}
      className={`al-nav-item${active ? ' al-nav-active' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <span className="al-nav-icon">{item.icon}</span>
      {!collapsed && <span className="al-nav-label-text">{item.label}</span>}
      {collapsed  && <span className="al-nav-tooltip">{item.label}</span>}
    </Link>
  );
}

// ── AdminLayout ───────────────────────────────────────────────────────────────
export default function AdminLayout({ children }) {
  const location = useLocation();
  const user     = getStoredUser();
  const role     = user?.staff_profile?.effective_role || (user?.is_staff ? 'admin' : null);
  usePresenceHeartbeat();

  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Staff';
  const initials    = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try { await logoutUser(); } catch {}
      window.location.href = '/login';
    }
  };

  const visibleNav = NAV_STRUCTURE.filter(item => item.roles.includes(role));

  return (
    <div className={`al-root${collapsed ? ' al-collapsed' : ''}${mobileOpen ? ' al-mobile-open' : ''}`}>

      {mobileOpen && <div className="al-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className="al-sidebar">

        {/* Brand */}
        <div className="al-brand">
          <div className="al-brand-icon">⟡</div>
          {!collapsed && <span className="al-brand-name">CEBU MINI HOTEL</span>}
          <button
            className="al-collapse-btn"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Staff badge */}
        {!collapsed ? (
          <div className="al-staff-badge">
            <div className="al-staff-avatar">{initials || displayName[0]?.toUpperCase()}</div>
            <div className="al-staff-info">
              <span className="al-staff-name">{displayName}</span>
              <span className="al-staff-role">{ROLE_ICONS[role]}{ROLE_LABELS[role] ?? role}</span>
            </div>
          </div>
        ) : (
          <div className="al-staff-avatar-only" title={displayName}>
            {initials || displayName[0]?.toUpperCase()}
          </div>
        )}

        {/* Nav */}
        <nav className="al-nav">
          {!collapsed && <div className="al-nav-label">NAVIGATION</div>}

          {visibleNav.map(item =>
            item.type === 'group' ? (
              <NavGroup
                key={item.key}
                item={item}
                role={role}
                collapsed={collapsed}
                location={location}
              />
            ) : (
              <NavLink
                key={item.key}
                item={item}
                collapsed={collapsed}
                location={location}
              />
            )
          )}
        </nav>

        {/* Footer */}
        <div className="al-sidebar-footer">
          <Link
            to="/settings?from=admin"
            className="al-footer-btn"
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings size={16} />
            {!collapsed && <span>Settings</span>}
            {collapsed  && <span className="al-nav-tooltip">Settings</span>}
          </Link>
          <button
            className="al-footer-btn al-footer-btn--danger"
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut size={16} />
            {!collapsed && <span>Logout</span>}
            {collapsed  && <span className="al-nav-tooltip">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="al-main">
        {/* Desktop topbar — notification bell top-right */}
        <div className="al-topbar">
          <div className="al-topbar-right">
            <NotificationBell />
          </div>
        </div>

        {/* Mobile topbar */}
        <header className="al-mobile-topbar">
          <button className="al-mobile-menu-btn" onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="al-mobile-brand">CEBU MINI HOTEL</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            <div className="al-mobile-avatar">{initials || displayName[0]?.toUpperCase()}</div>
          </div>
        </header>
        <div className="al-content">{children}</div>
      </div>
    </div>
  );
}