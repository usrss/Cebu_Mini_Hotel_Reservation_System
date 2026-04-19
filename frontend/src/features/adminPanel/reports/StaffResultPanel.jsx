/**
 * src/features/adminPanel/reports/StaffResultPanel.jsx
 *
 * Dedicated result renderer for report_type = "staff".
 *
 * Displays:
 *   - Role-separated performance sections (Front Desk / Housekeeping / Kitchen)
 *   - Per-role metric cards
 *   - Leaderboard (top performers, sorted by total tasks)
 *   - Full data table grouped by role
 *   - Export buttons (CSV, PDF, Excel)
 *
 * RULES enforced:
 *   - Staff are NEVER aggregated across roles into a single metric
 *   - Each role section shows only its own relevant metrics
 *   - Leaderboard is per-role, not cross-role
 *
 * Backend contract (rows[]):
 *   Each row must include: email, role, + role-specific metric fields.
 *   role values: "front_desk" | "housekeeping" | "kitchen_staff"
 *
 * Props:
 *   result  — raw API response { data: { summary, rows, meta } }
 *   title   — string label
 *   onClose — () => void
 */

import { useState } from 'react';
import {
  X, Download, AlertTriangle,
  Users, BedDouble, UtensilsCrossed, Wrench, ShieldAlert,
  Trophy, TrendingUp, Clock, CheckCircle2,
  XCircle, AlertOctagon, Info,
} from 'lucide-react';
import { reportExecutionApi, triggerBlobDownload } from '../../../services/reportsApi';

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  front_desk: {
    label:   'Front Desk',
    icon:    <Users size={15} />,
    color:   'var(--sf-blue)',
    bg:      'var(--sf-blue-bg)',
    metrics: [
      { key: 'check_ins_handled',       label: 'Check-ins Handled',     icon: <CheckCircle2 size={13} />, color: 'var(--sf-green)'  },
      { key: 'check_outs_handled',      label: 'Check-outs Handled',    icon: <CheckCircle2 size={13} />, color: 'var(--sf-green)'  },
      { key: 'bookings_created',        label: 'Bookings Created',      icon: <TrendingUp size={13} />,   color: 'var(--sf-blue)'   },
      { key: 'cancellations_processed', label: 'Cancellations Handled', icon: <XCircle size={13} />,      color: 'var(--sf-red)'    },
      { key: 'avg_check_in_time',       label: 'Avg Check-in Time',     icon: <Clock size={13} />,        color: 'var(--sf-amber)', fmt: 'min' },
    ],
    scoreKeys: ['check_ins_handled', 'check_outs_handled', 'bookings_created'],
  },
  housekeeping: {
    label:   'Housekeeping',
    icon:    <BedDouble size={15} />,
    color:   'var(--sf-green)',
    bg:      'var(--sf-green-bg)',
    metrics: [
      { key: 'rooms_cleaned',           label: 'Rooms Cleaned',         icon: <CheckCircle2 size={13} />, color: 'var(--sf-green)'  },
      { key: 'avg_cleaning_time',       label: 'Avg Cleaning Time',     icon: <Clock size={13} />,        color: 'var(--sf-amber)', fmt: 'min' },
      { key: 'rooms_cleaned_per_shift', label: 'Rooms / Shift',         icon: <TrendingUp size={13} />,   color: 'var(--sf-blue)'   },
      { key: 'delayed_cleanings',       label: 'Delayed Cleanings',     icon: <AlertOctagon size={13} />, color: 'var(--sf-red)'    },
    ],
    scoreKeys: ['rooms_cleaned', 'rooms_cleaned_per_shift'],
  },
  maintenance: {
    label:   'Maintenance',
    icon:    <Wrench size={15} />,
    color:   'var(--sf-purple, #7C3AED)',
    bg:      'var(--sf-purple-bg, rgba(124,58,237,0.08))',
    metrics: [
      { key: 'orders_completed',     label: 'Tasks Completed',    icon: <CheckCircle2 size={13} />, color: 'var(--sf-green)'  },
      { key: 'pending_orders',       label: 'Pending Tasks',      icon: <Clock size={13} />,        color: 'var(--sf-amber)'  },
      { key: 'cancelled_orders',     label: 'Cancelled Tasks',    icon: <XCircle size={13} />,      color: 'var(--sf-red)'    },
    ],
    scoreKeys: ['orders_completed'],
  },
  security: {
    label:   'Security',
    icon:    <ShieldAlert size={15} />,
    color:   'var(--sf-red)',
    bg:      'var(--sf-red-bg)',
    metrics: [
      { key: 'incidents_logged',    label: 'Incidents Logged',    icon: <ShieldAlert size={13} />,  color: 'var(--sf-red)'    },
      { key: 'incidents_resolved',  label: 'Incidents Resolved',  icon: <CheckCircle2 size={13} />, color: 'var(--sf-green)'  },
      { key: 'high_severity',       label: 'High / Critical',     icon: <AlertOctagon size={13} />, color: 'var(--sf-red)'    },
      { key: 'avg_resolution_time', label: 'Avg Resolution Time', icon: <Clock size={13} />,        color: 'var(--sf-amber)', fmt: 'min' },
    ],
    scoreKeys: ['incidents_logged', 'incidents_resolved'],
  },
  kitchen_staff: {
    label:   'Kitchen Staff',
    icon:    <UtensilsCrossed size={15} />,
    color:   'var(--sf-amber)',
    bg:      'var(--sf-amber-bg)',
    metrics: [
      { key: 'orders_completed',        label: 'Orders Completed',      icon: <CheckCircle2 size={13} />, color: 'var(--sf-green)'  },
      { key: 'avg_preparation_time',    label: 'Avg Prep Time',         icon: <Clock size={13} />,        color: 'var(--sf-amber)', fmt: 'min' },
      { key: 'pending_orders',          label: 'Pending Orders',        icon: <Clock size={13} />,        color: 'var(--sf-blue)'   },
      { key: 'cancelled_orders',        label: 'Cancelled Orders',      icon: <XCircle size={13} />,      color: 'var(--sf-red)'    },
    ],
    scoreKeys: ['orders_completed'],
  },
};

// ─── Role detection helpers ───────────────────────────────────────────────────

/**
 * Infer a staff member's role from their row data.
 *
 * Priority order:
 *   1. Explicit `role` / `staff_role` / `role_display` field from the backend.
 *      The backend now always sends `role` so this branch should always win.
 *   2. Metric-based inference — uses > 0 (not != null) because the backend
 *      seeds every row with 0 for all fields. Using != null would cause every
 *      row to match the first heuristic regardless of actual role.
 *   3. null — row is skipped.
 */
function detectRole(row) {
  // 1. Explicit field — backend always sends this now
  const explicit =
    row.role ??
    row.staff_role ??
    row.role_display ??
    null;

  // Accept if it maps to a known ROLE_CONFIG key
  if (explicit && ROLE_CONFIG[explicit]) return explicit;

  // 2. Metric-based inference — MUST use > 0, not != null,
  //    because the backend seeds all numeric fields with 0.
  if ((row.rooms_cleaned ?? 0) > 0 || (row.avg_cleaning_time ?? 0) > 0)
    return 'housekeeping';

  if ((row.check_ins_handled ?? 0) > 0 || (row.check_outs_handled ?? 0) > 0 ||
      (row.bookings_created ?? 0) > 0)
    return 'front_desk';

  if ((row.incidents_logged ?? 0) > 0 || (row.incidents_resolved ?? 0) > 0)
    return 'security';

  // Distinguish maintenance vs kitchen_staff by checking the explicit role string.
  // Since 'maintenance' is now in ROLE_CONFIG, line 116 above already handles it.
  // This branch is a safety net for rows where explicit role is present but
  // doesn't map to ROLE_CONFIG (e.g. 'admin', 'manager' — skip those).
  if (explicit) return null; // known role but no panel section — skip
  if ((row.orders_completed ?? 0) > 0) return 'kitchen_staff';

  // 3. Nothing matched — skip this row
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVal(val, fmt) {
  if (val == null) return '—';
  if (fmt === 'min') return `${Number(val).toFixed(1)} min`;
  if (typeof val === 'number') return Number.isInteger(val) ? val.toLocaleString() : Number(val).toFixed(1);
  return String(val);
}

function scoreOf(row, scoreKeys) {
  return scoreKeys.reduce((sum, k) => sum + (Number(row[k]) || 0), 0);
}

// ─── Role section ─────────────────────────────────────────────────────────────

function RoleSection({ roleKey, rows }) {
  const cfg = ROLE_CONFIG[roleKey];
  if (!cfg || rows.length === 0) return null;

  // Aggregate totals across all staff in this role
  const totals = {};
  cfg.metrics.forEach(m => {
    const vals = rows.map(r => Number(r[m.key] || 0));
    totals[m.key] = m.fmt === 'min'
      ? vals.reduce((a, b) => a + b, 0) / (vals.filter(v => v > 0).length || 1) // avg for time fields
      : vals.reduce((a, b) => a + b, 0);
  });

  // Sorted leaderboard for this role
  const leaderboard = [...rows].sort(
    (a, b) => scoreOf(b, cfg.scoreKeys) - scoreOf(a, cfg.scoreKeys)
  );

  return (
    <div className="srp-role-section">
      {/* Role header */}
      <div className="srp-role-header" style={{ borderLeftColor: cfg.color }}>
        <span className="srp-role-icon" style={{ color: cfg.color, background: cfg.bg }}>
          {cfg.icon}
        </span>
        <div>
          <h3 className="srp-role-title">{cfg.label}</h3>
          <p className="srp-role-count">{rows.length} staff member{rows.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Aggregate metric chips */}
      <div className="srp-metrics-row">
        {cfg.metrics.map(m => (
          <div key={m.key} className="srp-metric-chip">
            <span className="srp-metric-icon" style={{ color: m.color }}>{m.icon}</span>
            <div>
              <p className="srp-metric-val" style={{ color: m.color }}>
                {fmtVal(totals[m.key], m.fmt)}
                {m.fmt === 'min' && <span className="srp-metric-avg-tag">avg</span>}
              </p>
              <p className="srp-metric-label">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="srp-leaderboard">
        <p className="srp-leaderboard-title">
          <Trophy size={11} /> Top Performers
        </p>
        <div className="srp-leaderboard-list">
          {leaderboard.map((row, idx) => {
            const score = scoreOf(row, cfg.scoreKeys);
            const best  = scoreOf(leaderboard[0], cfg.scoreKeys);
            const pct   = best > 0 ? Math.round((score / best) * 100) : 0;
            return (
              <div key={row.email || idx} className="srp-lb-row">
                <span className="srp-lb-rank" style={{
                  color:      idx === 0 ? '#D97706' : '#7A7987',
                  fontWeight: idx < 2 ? 700 : 500,
                }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                </span>
                <div className="srp-lb-info">
                  <span className="srp-lb-name">{row.name || row.email || `Staff ${idx + 1}`}</span>
                  <div className="srp-lb-bar-track">
                    <div
                      className="srp-lb-bar-fill"
                      style={{ width: `${pct}%`, background: cfg.color }}
                    />
                  </div>
                </div>
                <span className="srp-lb-score" style={{ color: cfg.color }}>{score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-staff table */}
      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table className="sf-table">
          <thead>
            <tr>
              <th>Staff</th>
              {cfg.metrics.map(m => <th key={m.key}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row, i) => (
              <tr key={i}>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--sf-text-primary)' }}>
                    {row.name || row.email || `Staff ${i + 1}`}
                  </span>
                  {row.email && row.name && (
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--sf-text-muted)' }}>
                      {row.email}
                    </span>
                  )}
                </td>
                {cfg.metrics.map(m => (
                  <td key={m.key} style={{ color: m.color, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtVal(row[m.key], m.fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Aggregate-only fallback ───────────────────────────────────────────────────

/**
 * Shown when the backend returns summary totals but no per-staff rows[].
 * This happens when the service only computes aggregate counts and doesn't
 * include one object per staff member with a role field.
 */
function AggregateSummaryFallback({ summary }) {
  const entries = Object.entries(summary).filter(
    ([k]) => !['period_start', 'period_end'].includes(k)
  );

  return (
    <div style={{ padding: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '14px 16px',
          background: 'rgba(37,99,235,0.06)',
          borderRadius: 10,
          marginBottom: 20,
          color: 'var(--sf-text-muted)',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <Info size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--sf-blue)' }} />
        <span>
          The staff report returned aggregate totals only — no per-staff breakdown was included
          in <code>rows[]</code>. The role sections and leaderboard require the backend service
          to return one row per staff member with a <code>role</code> field
          (<code>front_desk</code> | <code>housekeeping</code> | <code>kitchen_staff</code>)
          and the relevant metric fields for that role.
        </span>
      </div>

      {entries.length > 0 && (
        <div className="srp-summary-band" style={{ borderRadius: 10, border: '1px solid var(--sf-surface-3)' }}>
          {entries.map(([k, v]) => (
            <div key={k} className="srp-summary-item">
              <p className="srp-summary-label">{k.replace(/_/g, ' ')}</p>
              <p className="srp-summary-val">
                {typeof v === 'number' ? v.toLocaleString() : String(v ?? '—')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StaffResultPanel({ result, title, onClose }) {
  const [downloading,   setDownloading]   = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [activeRole,    setActiveRole]    = useState(null); // null = all

  const data        = result?.data || result;
  const executionId = result?.execution_id;
  const summary     = data?.summary || {};
  const rows        = data?.rows    || [];
  const meta        = data?.meta    || {};

  const handleDownload = async (format) => {
    setDownloading(format);
    setDownloadError(null);
    try {
      if (!executionId) { setDownloadError('No execution ID available.'); return; }
      const blob = await reportExecutionApi.download(executionId, format);
      if (!blob || blob.size === 0) { setDownloadError('Server returned an empty file.'); return; }
      const ext = format === 'excel' ? 'xlsx' : format;
      triggerBlobDownload(blob, `staff_performance_${meta.start_date || 'export'}.${ext}`);
    } catch (err) {
      let msg = err.message || 'Download failed.';
      if (err.response?.data instanceof Blob) {
        try { const t = await err.response.data.text(); msg = JSON.parse(t).detail || t; } catch {}
      } else if (err.response?.data?.detail) {
        msg = err.response.data.detail;
      }
      setDownloadError(`Download failed (${format.toUpperCase()}): ${msg}`);
    } finally {
      setDownloading(null);
    }
  };

  // ── Group rows by role ──────────────────────────────────────────────────────
  //
  // FIX: The original code fell back to 'front_desk' for any unrecognised row,
  // which silently dumped housekeeping and kitchen staff into the wrong section
  // and showed completely wrong metrics for them.
  //
  // Now: detectRole() tries explicit field aliases first, then infers from
  // which metric fields are present. Rows with no recognisable role are skipped
  // entirely rather than corrupting the front_desk section.
  const byRole = {};
  rows.forEach(row => {
    const role = detectRole(row);
    if (!role) return; // skip unrecognisable rows
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(row);
  });

  const presentRoles   = Object.keys(ROLE_CONFIG).filter(r => byRole[r]?.length > 0);
  const displayRoles   = activeRole ? [activeRole] : presentRoles;
  const hasPerStaffRows = presentRoles.length > 0;

  return (
    <div className="crp-result srp-root">

      {/* Header */}
      <div className="crp-result-header">
        <div>
          <p className="crp-result-eyebrow">Staff Performance Report</p>
          <h2 className="crp-result-title">{title || 'Staff Performance'}</h2>
          {meta.start_date && (
            <p className="crp-result-sub">
              {meta.start_date} → {meta.end_date}
              {meta.cached && <span className="crp-cached-tag">cached</span>}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {executionId && ['csv', 'pdf', 'excel'].map(fmt => (
            <button
              key={fmt}
              className="sf-btn crp-sm-btn"
              onClick={() => handleDownload(fmt)}
              disabled={!!downloading}
              type="button"
            >
              <Download size={11} />
              {downloading === fmt ? '…' : fmt.toUpperCase()}
            </button>
          ))}
          <button className="crp-icon-btn" onClick={onClose} title="Close" type="button">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Download error */}
      {downloadError && (
        <div className="crp-error" style={{ margin: '0 20px 12px' }}>
          <AlertTriangle size={13} /> {downloadError}
        </div>
      )}

      {/* Summary band */}
      <div className="srp-summary-band">
        <div className="srp-summary-item">
          <p className="srp-summary-label">Period</p>
          <p className="srp-summary-val">
            {summary.period_start
              ? `${summary.period_start} → ${summary.period_end}`
              : `${meta.start_date || '—'} → ${meta.end_date || '—'}`}
          </p>
        </div>
        <div className="srp-summary-item">
          <p className="srp-summary-label">Total Staff</p>
          <p className="srp-summary-val">{hasPerStaffRows ? rows.length : '—'}</p>
        </div>
        {summary.total_check_ins != null && (
          <div className="srp-summary-item">
            <p className="srp-summary-label">Total Check-ins</p>
            <p className="srp-summary-val" style={{ color: 'var(--sf-green)' }}>
              {summary.total_check_ins}
            </p>
          </div>
        )}
        {summary.total_cleaning_done != null && (
          <div className="srp-summary-item">
            <p className="srp-summary-label">Rooms Cleaned</p>
            <p className="srp-summary-val" style={{ color: 'var(--sf-blue)' }}>
              {summary.total_cleaning_done}
            </p>
          </div>
        )}
        {summary.total_maintenance_done != null && (
          <div className="srp-summary-item">
            <p className="srp-summary-label">Maintenance Done</p>
            <p className="srp-summary-val" style={{ color: 'var(--sf-amber)' }}>
              {summary.total_maintenance_done}
            </p>
          </div>
        )}
        {summary.total_incidents_logged != null && summary.total_incidents_logged > 0 && (
          <div className="srp-summary-item">
            <p className="srp-summary-label">Incidents Logged</p>
            <p className="srp-summary-val" style={{ color: 'var(--sf-red)' }}>
              {summary.total_incidents_logged}
            </p>
          </div>
        )}
      </div>

      {/* Role filter tabs — only shown when per-staff rows exist */}
      {hasPerStaffRows && presentRoles.length > 1 && (
        <div className="srp-role-tabs">
          <button
            className={`srp-role-tab${!activeRole ? ' srp-role-tab--active' : ''}`}
            onClick={() => setActiveRole(null)}
            type="button"
          >
            All Roles
          </button>
          {presentRoles.map(r => (
            <button
              key={r}
              className={`srp-role-tab${activeRole === r ? ' srp-role-tab--active' : ''}`}
              onClick={() => setActiveRole(r)}
              style={activeRole === r ? { borderBottomColor: ROLE_CONFIG[r]?.color } : {}}
              type="button"
            >
              {ROLE_CONFIG[r]?.icon}
              {ROLE_CONFIG[r]?.label}
            </button>
          ))}
        </div>
      )}

      {/* Role sections or aggregate fallback */}
      {hasPerStaffRows ? (
        <div className="srp-sections">
          {displayRoles.length > 0
            ? displayRoles.map(r => (
                <RoleSection key={r} roleKey={r} rows={byRole[r] || []} />
              ))
            : (
              <div className="crp-no-data">
                No staff performance data for the selected period.
              </div>
            )
          }
        </div>
      ) : (
        <AggregateSummaryFallback summary={summary} />
      )}
    </div>
  );
}