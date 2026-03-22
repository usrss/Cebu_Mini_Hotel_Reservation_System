/**
 * src/features/staff/StaffLayout.jsx
 *
 * Sidebar layout for operational staff roles:
 *   housekeeping, maintenance, security
 *
 * NotificationBell is mounted in the sidebar footer so all operational
 * staff (especially housekeeping) see their task assignment notifications.
 */

import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  LogOut, Menu, X, ClipboardList,
  Wrench, Shield, Calendar, Activity, Plus, Settings,
} from 'lucide-react';
import { logoutUser, getStoredUser } from '../../services/api';
import { FileText, AlertOctagon } from 'lucide-react';
import { ROLE_LABELS } from './services/staffApi';
import NotificationBell from '../notifications/NotificationBell';
import { usePresenceHeartbeat } from './hooks/usePresenceHeartbeat';
import './Staff.css';

// ─── Nav items per role ───────────────────────────────────────────────────────

const NAV_BY_ROLE = {
  housekeeping: [
    { key: 'tasks',    label: 'My Tasks',     icon: <ClipboardList size={17} />, to: '/staff/cleaning'                  },
    { key: 'report-mt',label: 'Report Issue', icon: <Wrench size={17} />,        to: '/staff/report-maintenance'        },
    { key: 'my-reqs',  label: 'My Requests',  icon: <FileText size={17} />,      to: '/staff/my-maintenance-requests'   },
    { key: 'report-inc',label:'Report Incident',icon:<AlertOctagon size={17} />, to: '/staff/report-incident'           },
    { key: 'my-inc',   label: 'My Incidents', icon: <Shield size={17} />,        to: '/staff/my-incidents'              },
    { key: 'shifts',   label: 'My Shifts',    icon: <Calendar size={17} />,      to: '/staff/my-shifts'                 },
    { key: 'activity', label: 'Activity Log', icon: <Activity size={17} />,      to: '/staff/my-activity-logs'          },
  ],
  maintenance: [
    { key: 'tasks',    label: 'My Tasks',     icon: <Wrench size={17} />,        to: '/staff/maintenance'               },
    { key: 'shifts',   label: 'My Shifts',    icon: <Calendar size={17} />,      to: '/staff/my-shifts'                 },
    { key: 'activity', label: 'Activity Log', icon: <Activity size={17} />,      to: '/staff/my-activity-logs'          },
  ],
  security: [
    { key: 'incidents',  label: 'Incidents',     icon: <Shield size={17} />,     to: '/staff/incidents'                 },
    { key: 'new',        label: 'Log Incident',  icon: <Plus size={17} />,       to: '/staff/incidents/new'             },
    { key: 'shifts',     label: 'My Shifts',     icon: <Calendar size={17} />,   to: '/staff/my-shifts'                 },
    { key: 'activity',   label: 'Activity Log',  icon: <Activity size={17} />,   to: '/staff/my-activity-logs'          },
  ],
};

export const STAFF_ROLE_HOME = {
  housekeeping: '/staff/cleaning',
  maintenance:  '/staff/maintenance',
  security:     '/staff/incidents',
};

function PresenceDot({ status }) {
  const color = {
    online:  'var(--green)',
    idle:    'var(--amber)',
    offline: 'rgba(248,246,240,0.2)',
  }[status] || 'rgba(248,246,240,0.2)';
  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 8,
      borderRadius: '50%',
      background: color,
      marginLeft: 6,
      flexShrink: 0,
    }} />
  );
}

export default function StaffLayout({ children }) {
  const location = useLocation();
  const user     = getStoredUser();
  const role     = user?.staff_profile?.effective_role ?? null;
  usePresenceHeartbeat();   // handles the full presence lifecycle

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const navItems     = NAV_BY_ROLE[role] ?? [];
  const displayName  = user?.first_name || user?.full_name?.split(' ')[0] || 'Staff';
  const initials     = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');
  const onlineStatus = user?.staff_profile?.online_status ?? 'offline';
  const settingsHref = `/settings?from=staff&role=${role}`;

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try { await logoutUser(); } catch {}
      window.location.href = '/login';
    }
  };

  const isActive = (to) => {
    if (to === '/staff/incidents') return location.pathname === '/staff/incidents';
    return location.pathname === to || location.pathname.startsWith(to);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--navy)' }}>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(3px)',
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sl-sidebar${mobileOpen ? ' open' : ''}`}
        style={{
          width: 220,
          background: 'var(--navy-mid)',
          borderRight: '1px solid var(--gold-border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0, bottom: 0, left: 0,
          zIndex: 600,
          transition: 'transform 0.22s ease',
        }}
      >
        {/* Brand */}
        <div style={{
          padding: '20px 18px 16px',
          borderBottom: '1px solid var(--gold-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, var(--gold), transparent)',
          }} />
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: 'var(--gold)' }}>
            ⟡
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 2.5,
            textTransform: 'uppercase', color: 'var(--white)',
          }}>
            Cebu Mini Hotel
          </span>
        </div>

        {/* Staff badge */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--gold-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
        }}>
          <div style={{
            width: 38, height: 38,
            background: 'var(--gold-dim)',
            border: '1px solid var(--gold-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Playfair Display', serif",
            fontSize: 15, color: 'var(--gold)',
            flexShrink: 0,
          }}>
            {initials || displayName[0]?.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--white)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              display: 'flex', alignItems: 'center',
            }}>
              {displayName}
              <PresenceDot status={onlineStatus} />
            </div>
            <div style={{
              fontSize: 9, color: 'var(--gold)',
              letterSpacing: 1.5, textTransform: 'uppercase',
              marginTop: 2,
            }}>
              {ROLE_LABELS[role] ?? role}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '14px 0', overflowY: 'auto' }}>
          <div style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 2.5,
            textTransform: 'uppercase',
            color: 'rgba(248,246,240,0.25)',
            padding: '0 18px 10px',
          }}>
            Navigation
          </div>

          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.key}
                to={item.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 18px',
                  color: active ? 'var(--gold)' : 'var(--white-dim)',
                  background: active ? 'var(--gold-dim)' : 'transparent',
                  borderLeft: `2px solid ${active ? 'var(--gold)' : 'transparent'}`,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  letterSpacing: 0.2,
                  transition: 'all 0.18s',
                }}
              >
                <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer — Settings + Logout */}
        <div style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--gold-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <Link
            to={settingsHref}
            className="sf-btn"
            style={{ width: '100%', justifyContent: 'center', fontSize: 9, textDecoration: 'none' }}
          >
            <Settings size={13} /> Settings
          </Link>

          <button
            onClick={handleLogout}
            className="sf-btn sf-btn-danger"
            style={{ width: '100%', justifyContent: 'center', fontSize: 9 }}
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </aside>

      {/* Mobile topbar */}
      <header className="sl-mobile-topbar">
        <button
          onClick={() => setMobileOpen(v => !v)}
          style={{
            background: 'none', border: 'none',
            color: 'var(--gold)', cursor: 'pointer', padding: 4,
          }}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
          color: 'var(--white)', textTransform: 'uppercase',
        }}>
          Cebu Mini Hotel
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationBell />
          <Link
            to={settingsHref}
            style={{
              width: 32, height: 32,
              background: 'var(--gold-dim)',
              border: '1px solid var(--gold-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: 'var(--gold)',
              textDecoration: 'none',
            }}
            title="Settings"
          >
            {initials || displayName[0]?.toUpperCase()}
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="sl-main">
        {/* Desktop topbar — notification bell top-right */}
        <div className="sl-topbar">
          <div className="sl-topbar-right">
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>

      <style>{`
        .sl-sidebar {
          transform: translateX(0);
        }
        .sl-mobile-topbar {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 550;
          background: var(--navy-mid);
          border-bottom: 1px solid var(--gold-border);
          padding: 10px 16px;
          align-items: center;
          justify-content: space-between;
        }
        .sl-main {
          margin-left: 220px;
          flex: 1;
          min-height: 100vh;
        }
        @media (max-width: 768px) {
          .sl-mobile-topbar { display: flex !important; }
          .sl-sidebar        { transform: translateX(-100%); }
          .sl-sidebar.open   { transform: translateX(0); }
          .sl-main           { margin-left: 0 !important; padding-top: 56px; }
        }
      `}</style>
    </div>
  );
}