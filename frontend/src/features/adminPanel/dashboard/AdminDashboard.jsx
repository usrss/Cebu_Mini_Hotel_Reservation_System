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

  // Refresh business KPIs after financial changes (refunds).
  useEffect(() => {
    const handler = () => load(true);
    window.addEventListener('revenue-updated', handler);
    return () => window.removeEventListener('revenue-updated', handler);
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

        </div>
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

    </div>
  );
}