/**
 * AdminDashboard.jsx
 *
 * Rebuilt for admin/manager roles.
 * Pulls real operational data from GET /api/staff/dashboard/ (analyticsApi.dashboard)
 * and supplements with guest count + revenue from adminApi.
 *
 * Changes:
 *   - Removed "Staff Online" status strip (now 3 strips, not 4)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate }      from 'react-router-dom';
import {
  BedDouble, Users, CreditCard, Star,
  Wrench, Shield, ClipboardList, TrendingUp,
  ArrowRight, AlertTriangle, CheckCircle2,
  Clock, RefreshCw, FileText,
} from 'lucide-react';
import { getStoredUser }                   from '../../../services/api';
import { analyticsApi, guestApi,
         paymentApi, reviewApi }           from '../../../services/adminApi';
import './AdminDashboard.css';

const POLL_MS = 60_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n)  { return n != null ? Number(n).toLocaleString() : '—'; }
function fmtPhp(n) {
  if (n == null) return '—';
  return `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

const ROLE_LABELS = {
  admin:        'Administrator',
  manager:      'Manager',
  receptionist: 'Receptionist',
  front_desk:   'Front Desk',
  housekeeping: 'Housekeeping',
  maintenance:  'Maintenance',
  security:     'Security',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color, onClick, alert }) {
  return (
    <div
      className={`ad-stat-card${onClick ? ' ad-stat-card--link' : ''}${alert ? ' ad-stat-card--alert' : ''}`}
      onClick={onClick}
      style={alert ? { borderColor: 'var(--red-border)' } : {}}
    >
      <div className="ad-stat-icon" style={{ color }}>{icon}</div>
      <div className="ad-stat-body">
        <div className="ad-stat-value">{value}</div>
        <div className="ad-stat-label">{label}</div>
        {sub && <div className="ad-stat-sub" style={alert ? { color: 'var(--red)' } : {}}>{sub}</div>}
      </div>
      {onClick && <ArrowRight size={14} className="ad-stat-arrow" />}
    </div>
  );
}

function StatusStrip({ label, items }) {
  return (
    <div className="ad-strip">
      <div className="ad-strip-label">{label}</div>
      <div className="ad-strip-items">
        {items.map((item, i) => (
          <div key={i} className="ad-strip-item">
            <div className="ad-strip-dot" style={{ background: item.color }} />
            <span className="ad-strip-value" style={{ color: item.color }}>{item.value}</span>
            <span className="ad-strip-name">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityItem({ log }) {
  const time = new Date(log.created_at).toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit',
  });
  const date = new Date(log.created_at).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric',
  });

  return (
    <div className="ad-activity-item">
      <div className="ad-activity-bar" />
      <div className="ad-activity-body">
        <p className="ad-activity-action">{log.action_type?.replace(/_/g, ' ')}</p>
        <p className="ad-activity-desc">{log.description}</p>
        <p className="ad-activity-meta">
          {log.staff_name} · {date} {time}
        </p>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, desc, to, color }) {
  const navigate = useNavigate();
  return (
    <button className="ad-quick-link" onClick={() => navigate(to)}>
      <span className="ad-quick-icon" style={{ color }}>{icon}</span>
      <div className="ad-quick-body">
        <span className="ad-quick-label">{label}</span>
        <span className="ad-quick-desc">{desc}</span>
      </div>
      <ArrowRight size={14} className="ad-quick-arrow" />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate    = useNavigate();
  const user        = getStoredUser();
  const role        = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);
  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Staff';
  const isAdmin     = role === 'admin';

  // ── State ──────────────────────────────────────────────────────────────────
  const [dash,       setDash]       = useState(null);
  const [guestCount, setGuestCount] = useState(null);
  const [pendingPay, setPendingPay] = useState(null);
  const [avgRating,  setAvgRating]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const results = await Promise.allSettled([
        analyticsApi.dashboard(),
        guestApi.list({ page: 1 }),
        paymentApi.list({ status: 'pending', page: 1 }),
        reviewApi.stats(),
      ]);

      if (results[0].status === 'fulfilled') setDash(results[0].value);
      if (results[1].status === 'fulfilled') {
        const d = results[1].value;
        setGuestCount(d.count ?? (Array.isArray(d.results) ? d.results.length : null));
      }
      if (results[2].status === 'fulfilled') {
        const d = results[2].value;
        setPendingPay(d.count ?? (Array.isArray(d.results) ? d.results.length : null));
      }
      if (results[3].status === 'fulfilled') {
        const d = results[3].value;
        setAvgRating(d.avg_rating ? Number(d.avg_rating).toFixed(1) : null);
      }

      setLastUpdate(new Date());
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const d              = dash;
  const totalRooms     = d?.rooms?.total         ?? 0;
  const availRooms     = d?.rooms?.available     ?? 0;
  const occupiedRooms  = d?.rooms?.occupied      ?? 0;
  const cleaningRooms  = d?.rooms?.cleaning      ?? 0;
  const maintRooms     = d?.rooms?.maintenance   ?? 0;

  const checkedIn      = d?.bookings?.checked_in       ?? 0;
  const confirmedBooks = d?.bookings?.confirmed         ?? 0;
  const checkoutToday  = d?.bookings?.checked_out_today ?? 0;
  const createdToday   = d?.bookings?.created_today     ?? 0;

  const cleaningDirty  = d?.tasks?.cleaning_dirty       ?? 0;
  const cleaningInProg = d?.tasks?.cleaning_in_progress ?? 0;
  const maintPending   = d?.tasks?.maintenance_pending  ?? 0;
  const maintInProg    = d?.tasks?.maintenance_in_progress ?? 0;
  const pendingReqs    = d?.pending_maintenance_requests ?? 0;

  const revenueToday   = d?.revenue_today ?? null;
  const recentActivity = d?.recent_activity ?? [];

  const occupancyPct = totalRooms
    ? Math.round((occupiedRooms / totalRooms) * 100)
    : 0;

  const activeTasks    = cleaningDirty + cleaningInProg + maintPending + maintInProg;
  const tasksAlert     = activeTasks > 10;
  const pendingReqAlert = pendingReqs > 0;

  // ── Greeting ───────────────────────────────────────────────────────────────
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const val = (v) => loading ? '…' : v;

  return (
    <div className="ad-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="ad-header">
        <div>
          <p className="ad-eyebrow">Admin Panel</p>
          <h1 className="ad-title">{greeting}, {displayName}</h1>
          <p className="ad-subtitle">
            {ROLE_LABELS[role] ?? 'Staff'} · {new Date().toLocaleDateString('en-PH', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
          <div className="ad-divider" />
        </div>
        {lastUpdate && (
          <div className="ad-refresh-note">
            <RefreshCw size={11} />
            Updated {lastUpdate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
      </div>

      {/* ── Operational KPIs ───────────────────────────────────────────────── */}
      <div className="ad-section-label">Operations</div>
      <div className="ad-kpis" style={{ marginBottom: 14 }}>
        <KpiCard
          icon={<BedDouble size={22} />}
          label="Available Rooms"
          value={val(availRooms)}
          sub={`${occupancyPct}% occupied · ${totalRooms} total`}
          color="var(--green)"
          onClick={() => navigate('/admin/rooms')}
        />
        <KpiCard
          icon={<Users size={22} />}
          label="Checked In"
          value={val(checkedIn)}
          sub={`${confirmedBooks} confirmed · ${createdToday} new today`}
          color="#60A5FA"
          onClick={() => navigate('/admin/guests')}
        />
        <KpiCard
          icon={<ClipboardList size={22} />}
          label="Active Tasks"
          value={val(activeTasks)}
          sub={`${cleaningDirty + cleaningInProg} cleaning · ${maintPending + maintInProg} maintenance`}
          color={tasksAlert ? 'var(--red)' : 'var(--amber)'}
          alert={tasksAlert}
          onClick={() => navigate('/staff/cleaning')}
        />
        <KpiCard
          icon={<FileText size={22} />}
          label="Pending Requests"
          value={val(pendingReqs)}
          sub={pendingReqs > 0 ? 'Awaiting review' : 'All reviewed'}
          color={pendingReqAlert ? 'var(--red)' : 'var(--green)'}
          alert={pendingReqAlert}
          onClick={() => navigate('/staff/maintenance-requests')}
        />
      </div>

      {/* ── Business KPIs ──────────────────────────────────────────────────── */}
      <div className="ad-section-label">Business</div>
      <div className="ad-kpis">
        <KpiCard
          icon={<Users size={22} />}
          label="Total Guests"
          value={val(fmt(guestCount))}
          sub="Registered accounts"
          color="var(--gold)"
          onClick={() => navigate('/admin/guests')}
        />
        <KpiCard
          icon={<TrendingUp size={22} />}
          label="Revenue Today"
          value={val(fmtPhp(revenueToday))}
          sub="Confirmed paid bookings"
          color="var(--green)"
          onClick={() => navigate('/admin/payments/revenue')}
        />
        <KpiCard
          icon={<CreditCard size={22} />}
          label="Pending Payments"
          value={val(pendingPay)}
          sub="Awaiting confirmation"
          color="#60A5FA"
          onClick={() => navigate('/admin/payments')}
        />
        <KpiCard
          icon={<Star size={22} />}
          label="Avg Rating"
          value={val(avgRating ? `${avgRating} ★` : '—')}
          sub="Guest reviews"
          color="var(--amber)"
          onClick={() => navigate('/admin/reviews/stats')}
        />
      </div>

      {/* ── Status strips — Staff Online strip REMOVED ──────────────────────── */}
      <div className="ad-strips" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatusStrip
          label="Rooms"
          items={[
            { name: 'Available',    value: availRooms,    color: 'var(--green)' },
            { name: 'Occupied',     value: occupiedRooms, color: '#60A5FA'      },
            { name: 'Cleaning',     value: cleaningRooms, color: 'var(--amber)' },
            { name: 'Maintenance',  value: maintRooms,    color: 'var(--red)'   },
          ]}
        />
        <StatusStrip
          label="Tasks"
          items={[
            { name: 'Clean Pending',   value: cleaningDirty,  color: 'var(--red)'   },
            { name: 'Cleaning',        value: cleaningInProg, color: 'var(--amber)' },
            { name: 'Maint. Pending',  value: maintPending,   color: '#60A5FA'      },
            { name: 'Maint. Active',   value: maintInProg,    color: 'var(--green)' },
          ]}
        />
        <StatusStrip
          label="Today's Bookings"
          items={[
            { name: 'Checked Out', value: checkoutToday, color: 'var(--green)' },
            { name: 'Checked In',  value: checkedIn,     color: '#60A5FA'      },
            { name: 'New',         value: createdToday,  color: 'var(--gold)'  },
          ]}
        />
      </div>

      {/* ── Two column: activity + quick actions ───────────────────────────── */}
      <div className="ad-bottom-grid">

        {/* Recent activity */}
        <div className="ad-card">
          <div className="ad-card-header">
            <p className="ad-card-eyebrow">Live Feed</p>
            <h2 className="ad-card-title">Recent Activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <p className="ad-empty">No recent activity.</p>
          ) : (
            <div className="ad-activity-list">
              {recentActivity.slice(0, 12).map((log) => (
                <ActivityItem key={log.id} log={log} />
              ))}
            </div>
          )}
          <button
            className="ad-view-all"
            onClick={() => navigate('/staff/activity-logs')}
          >
            View full log <ArrowRight size={12} />
          </button>
        </div>

        {/* Quick actions */}
        <div className="ad-card">
          <div className="ad-card-header">
            <p className="ad-card-eyebrow">Shortcuts</p>
            <h2 className="ad-card-title">Quick Actions</h2>
          </div>
          <div className="ad-quick-list">

            {pendingReqs > 0 && (
              <QuickAction
                icon={<AlertTriangle size={16} />}
                label={`${pendingReqs} Maintenance Request${pendingReqs !== 1 ? 's' : ''} Pending`}
                desc="Review and convert to tasks"
                to="/staff/maintenance-requests"
                color="var(--red)"
              />
            )}
            {cleaningDirty > 0 && (
              <QuickAction
                icon={<AlertTriangle size={16} />}
                label={`${cleaningDirty} Room${cleaningDirty !== 1 ? 's' : ''} Need Cleaning`}
                desc="Assign or monitor housekeeping"
                to="/staff/cleaning"
                color="var(--amber)"
              />
            )}
            {checkoutToday > 0 && (
              <QuickAction
                icon={<Clock size={16} />}
                label={`${checkoutToday} Check-Out${checkoutToday !== 1 ? 's' : ''} Today`}
                desc="Rooms need to be turned over"
                to="/staff/cleaning"
                color="#60A5FA"
              />
            )}

            <QuickAction
              icon={<ClipboardList size={16} />}
              label="Housekeeping Dashboard"
              desc="View all cleaning tasks and status"
              to="/staff/cleaning"
              color="var(--gold)"
            />
            <QuickAction
              icon={<Wrench size={16} />}
              label="Maintenance Tasks"
              desc="Active repairs and assignments"
              to="/staff/maintenance"
              color="var(--gold)"
            />
            <QuickAction
              icon={<Shield size={16} />}
              label="Incident Logs"
              desc="Security reports and incidents"
              to="/staff/incidents"
              color="var(--gold)"
            />
            {isAdmin && (
              <QuickAction
                icon={<Users size={16} />}
                label="Staff Management"
                desc="Accounts, roles, shifts"
                to="/staff/members"
                color="var(--gold)"
              />
            )}
            <QuickAction
              icon={<TrendingUp size={16} />}
              label="Analytics"
              desc="Revenue, occupancy, booking trends"
              to="/admin/analytics"
              color="var(--gold)"
            />
            <QuickAction
              icon={<CheckCircle2 size={16} />}
              label="Staff Reports"
              desc="Performance and activity reports"
              to="/staff/reports"
              color="var(--gold)"
            />
          </div>
        </div>
      </div>

    </div>
  );
}