/**
 * src/features/staff/monitoring/StaffMonitoringPage.jsx
 *
 * Real-time staff presence monitoring for Admin + Manager.
 * Polls GET /api/staff/monitoring/ every 15 seconds.
 *
 * The backend StaffMonitoringView sweeps stale presences on every request —
 * any staff member with last_seen_at older than 3 minutes is auto-marked offline
 * before the response is returned, so the data is always fresh.
 *
 * Route: /staff/monitoring
 * Layout: AdminLayout (via StaffRoutes.jsx)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Wifi, WifiOff, Clock, Users, RefreshCw } from 'lucide-react';
import { monitoringApi, ROLE_LABELS, ONLINE_STATUS_LABELS } from '../services/staffApi';
import '../Staff.css';
import './StaffMonitoringPage.css';

const POLL_MS       = 15_000;  // refresh every 15 seconds
const STALE_WARN_MS = 120_000; // warn if last_seen_at > 2 min (close to server's 3 min threshold)

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s    = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function statusColor(status) {
  return {
    online:  'var(--green)',
    idle:    'var(--amber)',
    offline: 'rgba(248,246,240,0.2)',
  }[status] ?? 'rgba(248,246,240,0.2)';
}

function StatusDot({ status, size = 10 }) {
  return (
    <span
      className="sm-dot"
      style={{
        width: size, height: size,
        background: statusColor(status),
        boxShadow: status === 'online'
          ? `0 0 6px ${statusColor(status)}`
          : 'none',
      }}
    />
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, icon }) {
  return (
    <div className="sm-summary-card">
      <div className="sm-summary-icon" style={{ color }}>{icon}</div>
      <div className="sm-summary-value" style={{ color }}>{value}</div>
      <div className="sm-summary-label">{label}</div>
    </div>
  );
}

// ── Staff member row ──────────────────────────────────────────────────────────

function MemberRow({ member }) {
  const lastSeen     = member.last_seen_at;
  const isStale      = lastSeen && (Date.now() - new Date(lastSeen).getTime()) > STALE_WARN_MS;
  const status       = member.online_status ?? 'offline';
  const name         = member.user?.full_name || member.user?.email || '—';
  const initials     = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const role         = member.effective_role ?? member.role;
  const currentTask  = member.current_task;

  return (
    <div className={`sm-member-row${status === 'offline' ? ' sm-member-row--offline' : ''}`}>
      <div className="sm-member-left">
        <div className="sm-avatar">
          {initials}
          <StatusDot status={status} size={9} />
        </div>
        <div className="sm-member-info">
          <span className="sm-member-name">{name}</span>
          {member.employee_id && (
            <span className="sm-member-id">#{member.employee_id}</span>
          )}
          {currentTask && (
            <span className="sm-member-task">{currentTask}</span>
          )}
        </div>
      </div>

      <div className="sm-member-right">
        <span
          className="sm-status-badge"
          style={{
            color: statusColor(status),
            borderColor: statusColor(status),
            background: status === 'online'
              ? 'rgba(110,231,183,0.08)'
              : status === 'idle'
              ? 'rgba(252,211,77,0.08)'
              : 'rgba(248,246,240,0.04)',
          }}
        >
          <StatusDot status={status} size={6} />
          {ONLINE_STATUS_LABELS[status] ?? status}
        </span>
        <span
          className="sm-last-seen"
          style={isStale && status !== 'offline' ? { color: 'var(--amber)' } : {}}
        >
          <Clock size={10} />
          {timeAgo(lastSeen)}
        </span>
      </div>
    </div>
  );
}

// ── Role group ────────────────────────────────────────────────────────────────

function RoleGroup({ roleKey, roleData }) {
  const [open, setOpen] = useState(true);
  const members  = roleData.members ?? [];
  const online   = members.filter(m => m.online_status === 'online').length;
  const idle     = members.filter(m => m.online_status === 'idle').length;
  const offline  = members.filter(m => m.online_status === 'offline').length;

  if (members.length === 0) return null;

  return (
    <div className="sm-role-group">
      <button className="sm-role-header" onClick={() => setOpen(v => !v)}>
        <div className="sm-role-left">
          <span className="sm-role-name">
            {ROLE_LABELS[roleKey] ?? roleKey}
          </span>
          <span className="sm-role-count">{members.length} staff</span>
        </div>
        <div className="sm-role-pills">
          {online > 0 && (
            <span className="sm-role-pill sm-role-pill--online">
              <StatusDot status="online" size={6} /> {online}
            </span>
          )}
          {idle > 0 && (
            <span className="sm-role-pill sm-role-pill--idle">
              <StatusDot status="idle" size={6} /> {idle}
            </span>
          )}
          {offline > 0 && (
            <span className="sm-role-pill sm-role-pill--offline">
              <StatusDot status="offline" size={6} /> {offline}
            </span>
          )}
          <span className="sm-role-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="sm-role-members">
          {members.map(m => (
            <MemberRow key={m.id} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StaffMonitoringPage() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [pulse,      setPulse]      = useState(false);  // visual tick on refresh
  const timerRef = useRef(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const result = await monitoringApi.overview();
      setData(result);
      setLastUpdate(new Date());
      // Brief pulse animation to show data refreshed
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    } catch (err) {
      if (!silent) setError(err.response?.data?.detail || err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // ── Filter by search ────────────────────────────────────────────────────────
  const filterMembers = (members) => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(m =>
      (m.user?.full_name ?? '').toLowerCase().includes(q) ||
      (m.user?.email     ?? '').toLowerCase().includes(q) ||
      (m.employee_id     ?? '').toLowerCase().includes(q) ||
      (m.current_task    ?? '').toLowerCase().includes(q)
    );
  };

  // ── Derived totals ──────────────────────────────────────────────────────────
  const totalActive  = data?.total_active ?? 0;
  const totalOnline  = data?.total_online ?? 0;
  const byRole       = data?.by_role      ?? {};

  // Count idle and offline across all roles
  let totalIdle = 0, totalOffline = 0;
  Object.values(byRole).forEach(rd => {
    (rd.members ?? []).forEach(m => {
      if (m.online_status === 'idle')    totalIdle++;
      if (m.online_status === 'offline') totalOffline++;
    });
  });

  // Apply search filter to each role's members
  const filteredByRole = Object.fromEntries(
    Object.entries(byRole).map(([k, v]) => [
      k,
      { ...v, members: filterMembers(v.members ?? []) },
    ])
  );

  if (loading) return (
    <div className="sf-page">
      <div className="sf-loading"><div className="sf-spinner" /><p>Loading staff…</p></div>
    </div>
  );

  if (error) return (
    <div className="sf-page">
      <div className="sf-error"><p>{error}</p></div>
    </div>
  );

  return (
    <div className="sf-page">
      <div className="sf-inner">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Admin Panel</p>
            <h1>Staff Monitoring</h1>
            <p style={{ fontSize: 12, color: 'var(--white-dim)', margin: 0 }}>
              {totalActive} active staff · updates every 15s
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastUpdate && (
              <span
                className={`sm-refresh-note${pulse ? ' sm-refresh-note--pulse' : ''}`}
              >
                <RefreshCw size={11} />
                {lastUpdate.toLocaleTimeString('en-PH', {
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}
              </span>
            )}
            <button className="sf-btn" onClick={() => load()}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Summary cards ──────────────────────────────────────────────── */}
        <div className="sm-summary-grid">
          <SummaryCard
            label="Total Staff"
            value={totalActive}
            color="var(--gold)"
            icon={<Users size={18} />}
          />
          <SummaryCard
            label="Online"
            value={totalOnline}
            color="var(--green)"
            icon={<Wifi size={18} />}
          />
          <SummaryCard
            label="Idle"
            value={totalIdle}
            color="var(--amber)"
            icon={<Clock size={18} />}
          />
          <SummaryCard
            label="Offline"
            value={totalOffline}
            color="rgba(248,246,240,0.3)"
            icon={<WifiOff size={18} />}
          />
        </div>

        {/* ── Online presence bar ─────────────────────────────────────────── */}
        {totalActive > 0 && (
          <div className="sm-presence-bar-wrap">
            <div className="sm-presence-bar">
              {totalOnline > 0 && (
                <div
                  className="sm-presence-segment sm-presence-segment--online"
                  style={{ width: `${(totalOnline / totalActive) * 100}%` }}
                  title={`${totalOnline} online`}
                />
              )}
              {totalIdle > 0 && (
                <div
                  className="sm-presence-segment sm-presence-segment--idle"
                  style={{ width: `${(totalIdle / totalActive) * 100}%` }}
                  title={`${totalIdle} idle`}
                />
              )}
              {totalOffline > 0 && (
                <div
                  className="sm-presence-segment sm-presence-segment--offline"
                  style={{ width: `${(totalOffline / totalActive) * 100}%` }}
                  title={`${totalOffline} offline`}
                />
              )}
            </div>
            <div className="sm-presence-legend">
              <span><StatusDot status="online"  size={7} /> Online {totalOnline}</span>
              <span><StatusDot status="idle"    size={7} /> Idle {totalIdle}</span>
              <span><StatusDot status="offline" size={7} /> Offline {totalOffline}</span>
            </div>
          </div>
        )}

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <div className="sf-filter-bar" style={{ marginBottom: 20 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <Search size={13} style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--white-dim)',
              pointerEvents: 'none',
            }} />
            <input
              className="sf-input"
              style={{ paddingLeft: 34 }}
              placeholder="Search by name, email, ID or task…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <button className="sf-filter-clear" onClick={() => setSearch('')}>
              Clear
            </button>
          )}
        </div>

        {/* ── Role groups ────────────────────────────────────────────────── */}
        <div className="sm-groups">
          {Object.entries(filteredByRole).map(([roleKey, roleData]) => (
            <RoleGroup
              key={roleKey}
              roleKey={roleKey}
              roleData={roleData}
            />
          ))}
        </div>

      </div>
    </div>
  );
}