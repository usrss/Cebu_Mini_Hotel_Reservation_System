/**
 * src/features/staff/StaffLayout.jsx
 *
 * Sidebar layout for operational staff roles:
 *   housekeeping, maintenance, security
 *
 * Redesigned: Modern light theme — clean, minimal, professional.
 */

import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  LogOut, Menu, X, ClipboardList,
  Wrench, Shield, Calendar, Activity, Plus, Settings,
  FileText, AlertOctagon,
} from 'lucide-react';
import { logoutUser, getStoredUser } from '../../services/api';
import { ROLE_LABELS } from './services/staffApi';
import NotificationBell from '../notifications/NotificationBell';
import { usePresenceHeartbeat } from './hooks/usePresenceHeartbeat';
import './Staff.css';

const NAV_BY_ROLE = {
  housekeeping: [
    { key: 'tasks',     label: 'My Tasks',       icon: <ClipboardList size={17} />, to: '/staff/cleaning'                },
    { key: 'report-mt', label: 'Report Issue',   icon: <Wrench size={17} />,        to: '/staff/report-maintenance'      },
    { key: 'my-reqs',   label: 'My Requests',    icon: <FileText size={17} />,      to: '/staff/my-maintenance-requests' },
    { key: 'report-inc',label: 'Report Incident',icon: <AlertOctagon size={17} />,  to: '/staff/report-incident'         },
    { key: 'my-inc',    label: 'My Incidents',   icon: <Shield size={17} />,        to: '/staff/my-incidents'            },
    { key: 'shifts',    label: 'My Shifts',      icon: <Calendar size={17} />,      to: '/staff/my-shifts'               },
    { key: 'activity',  label: 'Activity Log',   icon: <Activity size={17} />,      to: '/staff/my-activity-logs'        },
  ],
  maintenance: [
    { key: 'tasks',    label: 'My Tasks',    icon: <Wrench size={17} />,   to: '/staff/maintenance'     },
    { key: 'shifts',   label: 'My Shifts',   icon: <Calendar size={17} />, to: '/staff/my-shifts'       },
    { key: 'activity', label: 'Activity Log',icon: <Activity size={17} />, to: '/staff/my-activity-logs'},
  ],
  security: [
    { key: 'incidents', label: 'Incidents',    icon: <Shield size={17} />,   to: '/staff/incidents'       },
    { key: 'new',       label: 'Log Incident', icon: <Plus size={17} />,    to: '/staff/incidents/new'   },
    { key: 'shifts',    label: 'My Shifts',    icon: <Calendar size={17} />,to: '/staff/my-shifts'       },
    { key: 'activity',  label: 'Activity Log', icon: <Activity size={17} />,to: '/staff/my-activity-logs'},
  ],
  kitchen_staff: [
    { key: 'kitchen',  label: 'Orders',       icon: <ClipboardList size={17} />, to: '/staff/kitchen'          },
    { key: 'shifts',   label: 'My Shifts',    icon: <Calendar size={17} />,      to: '/staff/my-shifts'        },
    { key: 'activity', label: 'Activity Log', icon: <Activity size={17} />,      to: '/staff/my-activity-logs' },
  ],
};

export const STAFF_ROLE_HOME = {
  housekeeping:  '/staff/cleaning',
  maintenance:   '/staff/maintenance',
  security:      '/staff/incidents',
  kitchen_staff: '/staff/kitchen',
};

function PresenceDot({ status }) {
  const color = {
    online:  '#0D9488',
    idle:    '#D97706',
    offline: '#BEC2D0',
  }[status] || '#BEC2D0';
  return (
    <span style={{
      display: 'inline-block',
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: color,
      marginLeft: 6,
      flexShrink: 0,
      boxShadow: status === 'online' ? `0 0 4px ${color}` : 'none',
    }} />
  );
}

export default function StaffLayout({ children }) {
  const location = useLocation();
  const user     = getStoredUser();
  const role     = user?.staff_profile?.effective_role ?? null;
  usePresenceHeartbeat();

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

  const sidebarStyle = {
    width: 240,
    background: '#FFFFFF',
    boxShadow: '2px 0 16px rgba(15,17,23,0.06)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0, bottom: 0, left: 0,
    zIndex: 600,
    transition: 'transform 0.22s ease',
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F5F6FA' }}>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(15,17,23,0.45)',
            backdropFilter: 'blur(4px)',
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sl-sidebar${mobileOpen ? ' open' : ''}`}
        style={sidebarStyle}
      >
        {/* Brand */}
        <div style={{
          padding: '0 18px',
          height: 64,
          borderBottom: '1px solid #F0F1F5',
          display: 'flex',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#0F1117',
            letterSpacing: '0.01em',
          }}>
            Cebu Mini Hotel
          </span>
        </div>

        {/* Staff badge */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #F0F1F5',
          background: '#F5F6FA',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
        }}>
          <div style={{
            width: 38, height: 38,
            background: 'rgba(59,91,219,0.10)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#3B5BDB', flexShrink: 0,
          }}>
            {initials || displayName[0]?.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: '#0F1117',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              display: 'flex', alignItems: 'center',
            }}>
              {displayName}
              <PresenceDot status={onlineStatus} />
            </div>
            <div style={{
              fontSize: 10, color: '#3B5BDB',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontWeight: 700, marginTop: 2,
            }}>
              {ROLE_LABELS[role] ?? role}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#BEC2D0',
            padding: '10px 8px 6px',
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
                  padding: '9px 10px',
                  borderRadius: 8,
                  color: active ? '#3B5BDB' : '#8A8FA3',
                  background: active ? 'rgba(59,91,219,0.08)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  transition: 'all 0.18s',
                  marginBottom: 1,
                }}
              >
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '8px 10px',
          borderTop: '1px solid #F0F1F5',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <Link
            to={settingsHref}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 8,
              color: '#8A8FA3', textDecoration: 'none',
              fontSize: 13, fontWeight: 500,
              transition: 'all 0.18s',
            }}
          >
            <Settings size={16} />
            <span>Settings</span>
          </Link>

          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 8,
              color: 'rgba(220,38,38,0.7)',
              background: 'none', border: 'none',
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer', width: '100%',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.18s',
            }}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile topbar */}
      <header className="sl-mobile-topbar">
        <button
          onClick={() => setMobileOpen(v => !v)}
          style={{
            background: '#F0F1F5',
            border: 'none',
            borderRadius: 8,
            color: '#8A8FA3',
            width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: '#0F1117',
        }}>
          Cebu Mini Hotel
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationBell />
          <Link
            to={settingsHref}
            style={{
              width: 32, height: 32,
              background: 'rgba(59,91,219,0.10)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#3B5BDB',
              textDecoration: 'none',
            }}
          >
            {initials || displayName[0]?.toUpperCase()}
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="sl-main">
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
          background: #FFFFFF;
          border-bottom: 1px solid #F0F1F5;
          padding: 10px 16px;
          align-items: center;
          justify-content: space-between;
          font-family: 'DM Sans', sans-serif;
        }
        .sl-topbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 0 28px;
          height: 56px;
          background: #FFFFFF;
          box-shadow: 0 1px 0 #F0F1F5;
          position: sticky;
          top: 0;
          z-index: 100;
          flex-shrink: 0;
        }
        .sl-topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sl-main {
          margin-left: 240px;
          flex: 1;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        @media (max-width: 768px) {
          .sl-mobile-topbar { display: flex !important; }
          .sl-sidebar        { transform: translateX(-100%); }
          .sl-sidebar.open   { transform: translateX(0); box-shadow: 4px 0 24px rgba(15,17,23,0.15); }
          .sl-main           { margin-left: 0 !important; padding-top: 56px; }
          .sl-topbar         { display: none; }
        }
      `}</style>
    </div>
  );
}