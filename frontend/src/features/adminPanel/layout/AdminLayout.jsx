import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Users, CreditCard, Star, BarChart2, Home,
  LogOut, Settings, ChevronLeft, ChevronRight,
  Menu, X, Building2, Shield, Wrench, BedDouble,
  LineChart, UserCog,
} from 'lucide-react';
import { logoutUser, getStoredUser } from '../../../services/api';
import './AdminLayout.css';

const NAV_ITEMS = [
  {
    key:'dashboard', label:'Dashboard', icon:<Home size={18} />, to:'/admin/dashboard',
    roles:['admin','manager','receptionist','front_desk','housekeeping','maintenance','security'],
  },
  {
    key:'analytics', label:'Analytics', icon:<LineChart size={18} />, to:'/admin/analytics',
    roles:['admin','manager'],
  },
  {
    key:'staff', label:'Staff', icon:<UserCog size={18} />, to:'/admin/staff',
    roles:['admin'],   // Admin only
  },
  {
    key:'guests', label:'Guests', icon:<Users size={18} />, to:'/admin/guests',
    roles:['admin','manager','receptionist','front_desk'],
  },
  {
    key:'payments', label:'Payments', icon:<CreditCard size={18} />, to:'/admin/payments',
    roles:['admin','manager','front_desk'],
  },
  {
    key:'revenue', label:'Revenue', icon:<BarChart2 size={18} />, to:'/admin/payments/revenue',
    roles:['admin','manager'],
  },
  {
    key:'reviews', label:'Reviews', icon:<Star size={18} />, to:'/admin/reviews',
    roles:['admin','manager'],
  },
  {
    key:'rooms', label:'Rooms', icon:<BedDouble size={18} />, to:'/admin/rooms',
    roles:['admin','manager','housekeeping','maintenance'],
  },
];

const ROLE_LABELS = {
  admin:'Administrator', manager:'Manager', receptionist:'Receptionist',
  front_desk:'Front Desk', housekeeping:'Housekeeping',
  maintenance:'Maintenance', security:'Security',
};
const ROLE_ICONS = {
  admin:<Shield size={11} />, manager:<Building2 size={11} />,
  receptionist:<Users size={11} />, front_desk:<Users size={11} />,
  housekeeping:<BedDouble size={11} />, maintenance:<Wrench size={11} />,
  security:<Shield size={11} />,
};

export default function AdminLayout({ children }) {
  const location = useLocation();
  const user     = getStoredUser();
  const role     = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);

  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const visibleNav = NAV_ITEMS.filter(item => item.roles.includes(role));

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try { await logoutUser(); } catch {}
      window.location.href = '/login';
    }
  };

  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Staff';
  const initials    = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  return (
    <div className={`al-root${collapsed?' al-collapsed':''}${mobileOpen?' al-mobile-open':''}`}>

      {mobileOpen && <div className="al-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className="al-sidebar">
        {/* Brand */}
        <div className="al-brand">
          <div className="al-brand-icon">⟡</div>
          {!collapsed && <span className="al-brand-name">CEBU MINI HOTEL</span>}
          <button className="al-collapse-btn" onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand' : 'Collapse'}>
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
          <div className="al-nav-label">{!collapsed && 'NAVIGATION'}</div>
          {visibleNav.map(item => {
            const active = location.pathname === item.to ||
              (item.to !== '/admin/dashboard' && location.pathname.startsWith(item.to));
            return (
              <Link key={item.key} to={item.to}
                className={`al-nav-item${active?' al-nav-active':''}`}
                title={collapsed ? item.label : undefined}>
                <span className="al-nav-icon">{item.icon}</span>
                {!collapsed && <span className="al-nav-label-text">{item.label}</span>}
                {collapsed  && <span className="al-nav-tooltip">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="al-sidebar-footer">
          <Link to="/settings?from=admin" className="al-footer-btn"
            title={collapsed ? 'Settings' : undefined}>
            <Settings size={16} />
            {!collapsed && <span>Settings</span>}
            {collapsed  && <span className="al-nav-tooltip">Settings</span>}
          </Link>
          <button className="al-footer-btn al-footer-btn--danger"
            onClick={handleLogout} title={collapsed ? 'Logout' : undefined}>
            <LogOut size={16} />
            {!collapsed && <span>Logout</span>}
            {collapsed  && <span className="al-nav-tooltip">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="al-main">
        <header className="al-mobile-topbar">
          <button className="al-mobile-menu-btn" onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="al-mobile-brand">CEBU MINI HOTEL</span>
          <div className="al-mobile-avatar">{initials || displayName[0]?.toUpperCase()}</div>
        </header>
        <div className="al-content">{children}</div>
      </div>
    </div>
  );
}