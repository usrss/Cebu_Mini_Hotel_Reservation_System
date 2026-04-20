/**
 * src/features/adminPanel/reports/CustomReportPage.jsx
 *
 * Custom report generation page for Admin + Manager roles.
 * Route: /admin/reports  (add to AdminPanelRoutes.jsx)
 *
 * Tabs:
 *   1. Build        — configure and run an ad-hoc report
 *   2. Templates    — saved report configurations
 *   3. Schedules    — recurring scheduled reports
 *   4. History      — past execution log
 *
 * Integrates with:
 *   - /api/reports/meta/          (form options)
 *   - /api/reports/run/           (ad-hoc run)
 *   - /api/reports/templates/     (CRUD)
 *   - /api/reports/schedules/     (CRUD)
 *   - /api/reports/executions/    (history)
 *
 * Report types supported:
 *   bookings, revenue, occupancy, staff, food, payments
 *
 * Result panels are routed by report_type:
 *   payments → PaymentsResultPanel  (financial auditability, no revenue mixing)
 *   staff    → StaffResultPanel     (role-separated, leaderboard)
 *   *        → ReportResultPanel    (generic chart + table)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Play, Download, Save, Clock, History,
  FileText, Trash2, ChevronRight,
  CheckCircle2, AlertTriangle, RefreshCw,
  BarChart2, Calendar, ToggleLeft, ToggleRight,
  UtensilsCrossed, Users, TrendingUp, BedDouble,
  UserCog, ChevronDown, CreditCard,
} from 'lucide-react';
import {
  reportMetaApi,
  reportRunApi,
  reportTemplateApi,
  reportScheduleApi,
  reportExecutionApi,
  triggerBlobDownload,
} from '../../../services/reportsApi';
import ReportResultPanel    from './ReportResultPanel';
import PaymentsResultPanel  from './PaymentsResultPanel';
import StaffResultPanel     from './StaffResultPanel';
import SaveTemplateModal    from './SaveTemplateModal';
import ScheduleModal        from './ScheduleModal';
import './CustomReportPage.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'build',     label: 'Build',     icon: <BarChart2 size={14} /> },
  { id: 'templates', label: 'Templates', icon: <FileText size={14} />  },
  { id: 'schedules', label: 'Schedules', icon: <Calendar size={14} />  },
  { id: 'history',   label: 'History',   icon: <History size={14} />   },
];

// FIX: "food_drinks" renamed to "food" to match the backend ReportType enum value.
// Previously the key mismatch meant food reports got no icon/description in the
// type grid, and the meta lookup for metrics/group_by fell back to undefined.
const REPORT_TYPE_META = {
  bookings: { icon: <BedDouble size={15} />,       label: 'Bookings',      desc: 'Reservation trends & status'     },
  revenue:  { icon: <TrendingUp size={15} />,      label: 'Revenue',       desc: 'Income & payment summaries'      },
  occupancy:{ icon: <BedDouble size={15} />,       label: 'Occupancy',     desc: 'Room utilisation rates'          },
  staff:    { icon: <UserCog size={15} />,         label: 'Staff',         desc: 'Role-based performance metrics'  },
  food:     { icon: <UtensilsCrossed size={15} />, label: 'Food & Drinks', desc: 'F&B orders & revenue'            },
  payments: { icon: <CreditCard size={15} />,      label: 'Payments',      desc: 'Transaction flow & auditability' },
};

const FORMAT_LABELS = { json: 'In-App', csv: 'CSV', pdf: 'PDF', excel: 'Excel' };

const STATUS_COLORS = {
  success: 'var(--sf-green)',
  failed:  'var(--sf-red)',
  pending: 'var(--sf-amber)',
};

// Fix #1 — mirror MAX_DATE_RANGE_DAYS from backend serializers.py
const MAX_DATE_RANGE_DAYS = 366;

// Fix #3 — VALID_GROUP_BY_PER_TYPE is now served by GET /api/reports/meta/
// as valid_group_by_per_type. The constant below is the fallback used only
// if the API hasn't loaded yet (prevents the UI from being empty on first render).
// FIX: added "payments" entry and corrected "food_drinks" → "food".
const VALID_GROUP_BY_PER_TYPE_FALLBACK = {
  bookings:  ['day', 'week', 'month', 'room_type', 'status'],
  revenue:   ['day', 'week', 'month', 'room_type'],
  occupancy: ['room_type'],
  guests:    ['day', 'week', 'month'],
  staff:     ['day', 'week', 'month', 'staff', 'role'],
  food:      ['day', 'week', 'month', 'category'],
  payments:  ['day', 'week', 'month', 'payment_method', 'payment_status'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children, hint }) {
  return (
    <div className="crp-section-label-row">
      <p className="crp-section-label">{children}</p>
      {hint && <span className="crp-section-hint">{hint}</span>}
    </div>
  );
}

function MetricChip({ label, active, onClick }) {
  return (
    <button
      className={`crp-metric-chip${active ? ' crp-metric-chip--on' : ''}`}
      onClick={onClick}
      type="button"
    >
      {active && <CheckCircle2 size={10} />}
      {label.replace(/_/g, ' ')}
    </button>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder = 'Any' }) {
  return (
    <div className="crp-filter-item">
      <label className="crp-filter-label">{label}</label>
      <select
        className="sf-input crp-filter-select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: STATUS_COLORS[status] || 'var(--sf-text-muted)',
      padding: '2px 8px',
      background: status === 'success'
        ? 'var(--sf-green-bg)'
        : status === 'failed'
          ? 'var(--sf-red-bg)'
          : 'var(--sf-amber-bg)',
      borderRadius: 999,
    }}>
      {status}
    </span>
  );
}

// ─── Build Tab ────────────────────────────────────────────────────────────────

function BuildTab({ meta, onResult }) {
  const [reportType,   setReportType]   = useState('revenue');
  const [period,       setPeriod]       = useState('monthly');
  const [startDate,    setStartDate]    = useState('');
  const [endDate,      setEndDate]      = useState('');
  const [groupBy,      setGroupBy]      = useState('day');
  const [metrics,      setMetrics]      = useState([]);
  const [filters,      setFilters]      = useState({});
  const [exportFmt,    setExportFmt]    = useState('json');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [showSave,     setShowSave]     = useState(false);
  const [filtersOpen,  setFiltersOpen]  = useState(true);

  const availMetrics = meta?.metrics_by_type?.[reportType] || [];

  // Fix #3 — use the map served by /api/reports/meta/ (valid_group_by_per_type).
  // Fall back to the local constant only before the API response arrives.
  const groupByMap    = meta?.valid_group_by_per_type || VALID_GROUP_BY_PER_TYPE_FALLBACK;
  const validGroupBys = groupByMap[reportType] || (meta?.group_by_options || []);

  // All possible group_by options to render as buttons — union of all valid values
  // so the UI always shows every option and just disables the ones not valid for
  // the current report type.
  const allGroupByOptions = meta?.group_by_options ||
    [...new Set(Object.values(VALID_GROUP_BY_PER_TYPE_FALLBACK).flat())];

  // Reset metrics, filters, group_by when report type changes
  useEffect(() => {
    setMetrics([]);
    setFilters({});
    setGroupBy(prev =>
      validGroupBys.includes(prev) ? prev : (validGroupBys[0] || 'day')
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType]);

  const toggleMetric = (m) =>
    setMetrics(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );

  // Fix #1 — client-side date range validation before sending
  const validateDates = () => {
    if (period !== 'custom') return null;
    if (!startDate || !endDate) return 'Please select both a start and end date.';
    const s    = new Date(startDate);
    const e    = new Date(endDate);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    if (e < s)                       return 'End date must be after start date.';
    if (diff > MAX_DATE_RANGE_DAYS)
      return `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days (${diff} days selected).`;
    if (s > new Date())              return 'Start date cannot be in the future.';
    return null;
  };

  const buildConfig = () => ({
    period,
    ...(period === 'custom' ? { start_date: startDate, end_date: endDate } : {}),
    metrics,
    group_by: groupBy,
    filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  });

  const handleRun = async () => {
    const dateError = validateDates();
    if (dateError) { setError(dateError); return; }

    setLoading(true); setError(null);
    const config = buildConfig();
    try {
      if (exportFmt !== 'json') {
        const blob = await reportRunApi.download({ report_type: reportType, config, export_format: exportFmt });
        triggerBlobDownload(blob, `${reportType}_${period}.${exportFmt === 'excel' ? 'xlsx' : exportFmt}`);
      } else {
        const result = await reportRunApi.run({ report_type: reportType, config, export_format: 'json' });
        onResult(result);
      }
    } catch (err) {
      // Show backend field-level validation errors clearly
      const data = err.response?.data;
      if (data && typeof data === 'object' && !data.detail) {
        const msgs = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join(' | ');
        setError(msgs);
      } else {
        setError(data?.detail || err.message || 'Report generation failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fix #1 — live date range feedback
  const dateRangeHint = (() => {
    if (period !== 'custom' || !startDate || !endDate) return null;
    const diff = Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
    if (diff < 0) return null;
    const remaining = MAX_DATE_RANGE_DAYS - diff;
    if (diff > MAX_DATE_RANGE_DAYS)
      return { text: `${diff} days selected — exceeds ${MAX_DATE_RANGE_DAYS}-day limit`, warn: true };
    return { text: `${diff} days selected (${remaining} days remaining)`, warn: false };
  })();

  const ROOM_TYPES = [
    { value: 'standard',  label: 'Standard'  },
    { value: 'deluxe',    label: 'Deluxe'    },
    { value: 'suite',     label: 'Suite'     },
    { value: 'family',    label: 'Family'    },
    { value: 'penthouse', label: 'Penthouse' },
  ];

  const PAYMENT_STATUSES = [
    { value: 'pending',    label: 'Pending'    },
    { value: 'processing', label: 'Processing' },
    { value: 'paid',       label: 'Paid'       },
    { value: 'failed',     label: 'Failed'     },
    { value: 'cancelled',  label: 'Cancelled'  },
    { value: 'refunded',   label: 'Refunded'   },
    { value: 'expired',    label: 'Expired'    },
  ];

  const PAYMENT_METHODS = [
    { value: 'card',          label: 'Credit / Debit Card' },
    { value: 'gcash',         label: 'GCash'               },
    { value: 'bank_transfer', label: 'Bank Transfer'       },
    { value: 'paypal',        label: 'PayPal'              },
    { value: 'cash',          label: 'Cash (Walk-in)'      },
  ];

  const BOOKING_STATUSES = [
    { value: 'confirmed',   label: 'Confirmed'   },
    { value: 'checked_in',  label: 'Checked In'  },
    { value: 'checked_out', label: 'Checked Out' },
    { value: 'cancelled',   label: 'Cancelled'   },
    { value: 'expired',     label: 'Expired'     },
    { value: 'no_show',     label: 'No Show'     },
  ];

  const STAFF_ROLES = [
    { value: 'front_desk',    label: 'Front Desk'    },
    { value: 'housekeeping',  label: 'Housekeeping'  },
    { value: 'kitchen_staff', label: 'Kitchen Staff' },
  ];

  // FIX: merge meta.report_types (from API) with our local REPORT_TYPE_META so
  // that types known locally but absent from the API response (e.g. "payments"
  // when the backend omits it) are still rendered. The API list controls order;
  // locally-known extras are appended at the end.
  const reportTypes = (() => {
    const localList = Object.entries(REPORT_TYPE_META).map(([value, m]) => ({
      value,
      label: m.label,
    }));
    if (!meta?.report_types?.length) return localList;

    const apiValues = new Set(meta.report_types.map(r => (typeof r === 'string' ? r : r.value)));
    const apiList   = meta.report_types.map(r =>
      typeof r === 'string' ? { value: r, label: REPORT_TYPE_META[r]?.label ?? r } : r
    );
    // Append anything in our local list that the API didn't return
    const missing = localList.filter(l => !apiValues.has(l.value));
    return [...apiList, ...missing];
  })();

  return (
    <div className="crp-build">

      {/* ── Report Type ─────────────────────────────────────────── */}
      <div className="crp-section">
        <SectionLabel>Report Type</SectionLabel>
        <div className="crp-type-grid">
          {reportTypes.map(rt => {
            const rtMeta = REPORT_TYPE_META[rt.value];
            return (
              <button
                key={rt.value}
                className={`crp-type-btn${reportType === rt.value ? ' crp-type-btn--active' : ''}`}
                onClick={() => { setReportType(rt.value); setError(null); }}
                type="button"
              >
                {rtMeta?.icon && (
                  <span className="crp-type-icon">{rtMeta.icon}</span>
                )}
                <span className="crp-type-text">
                  <span className="crp-type-label">{rt.label}</span>
                  {rtMeta?.desc && (
                    <span className="crp-type-desc">{rtMeta.desc}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="crp-two-col">

        {/* ── Left column ─────────────────────────────────────────── */}
        <div>

          {/* Period */}
          <div className="crp-section">
            <SectionLabel>Time Period</SectionLabel>
            <div className="crp-period-row">
              {(meta?.period_options || ['daily', 'weekly', 'monthly', 'yearly', 'custom']).map(p => (
                <button
                  key={p}
                  className={`crp-period-btn${period === p ? ' crp-period-btn--active' : ''}`}
                  onClick={() => { setPeriod(p); setError(null); }}
                  type="button"
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {/* Fix #1 — custom dates with live range feedback */}
            {period === 'custom' && (
              <>
                <div className="crp-date-row">
                  <div>
                    <label className="crp-filter-label" style={{ marginBottom: 5, display: 'block' }}>Start Date</label>
                    <input
                      type="date"
                      className="sf-input"
                      value={startDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => { setStartDate(e.target.value); setError(null); }}
                    />
                  </div>
                  <div>
                    <label className="crp-filter-label" style={{ marginBottom: 5, display: 'block' }}>End Date</label>
                    <input
                      type="date"
                      className="sf-input"
                      value={endDate}
                      min={startDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => { setEndDate(e.target.value); setError(null); }}
                    />
                  </div>
                </div>
                {dateRangeHint && (
                  <p className={`crp-date-hint${dateRangeHint.warn ? ' crp-date-hint--warn' : ''}`}>
                    {dateRangeHint.warn && <AlertTriangle size={11} />}
                    {dateRangeHint.text}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Fix #3 — Group By filtered per report type */}
          <div className="crp-section">
            <SectionLabel
              hint={validGroupBys.length < 5 ? `Limited options for ${REPORT_TYPE_META[reportType]?.label || reportType}` : null}
            >
              Group By
            </SectionLabel>
            <div className="crp-period-row">
              {allGroupByOptions.map(g => {
                const allowed = validGroupBys.includes(g);
                return (
                  <button
                    key={g}
                    className={`crp-period-btn${groupBy === g ? ' crp-period-btn--active' : ''}${!allowed ? ' crp-period-btn--disabled' : ''}`}
                    onClick={() => allowed && setGroupBy(g)}
                    disabled={!allowed}
                    title={!allowed ? `'${g}' is not available for ${reportType} reports` : undefined}
                    type="button"
                  >
                    {g.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <div className="crp-section">
            <button
              className="crp-collapsible-header"
              onClick={() => setFiltersOpen(v => !v)}
              type="button"
            >
              <SectionLabel>Filters</SectionLabel>
              <span className={`crp-collapse-chevron${filtersOpen ? ' crp-collapse-chevron--open' : ''}`}>
                <ChevronDown size={13} />
              </span>
            </button>

            {filtersOpen && (
              <div className="crp-filters-body">
                <div className="crp-filters-row">
                  {/* Room Type — bookings, revenue, occupancy, payments */}
                  {['bookings', 'revenue', 'occupancy', 'payments'].includes(reportType) && (
                    <FilterSelect
                      label="Room Type"
                      value={filters.room_type || ''}
                      onChange={v => setFilters(f => ({ ...f, room_type: v || undefined }))}
                      options={ROOM_TYPES}
                    />
                  )}

                  {/* Booking Status — bookings only */}
                  {reportType === 'bookings' && (
                    <FilterSelect
                      label="Booking Status"
                      value={filters.status || ''}
                      onChange={v => setFilters(f => ({ ...f, status: v || undefined }))}
                      options={BOOKING_STATUSES}
                    />
                  )}

                  {/* Payment Status — revenue, bookings, payments */}
                  {['revenue', 'bookings', 'payments'].includes(reportType) && (
                    <FilterSelect
                      label="Payment Status"
                      value={filters.payment_status || ''}
                      onChange={v => setFilters(f => ({ ...f, payment_status: v || undefined }))}
                      options={PAYMENT_STATUSES}
                    />
                  )}

                  {/* Payment Method — payments only */}
                  {reportType === 'payments' && (
                    <FilterSelect
                      label="Payment Method"
                      value={filters.payment_method || ''}
                      onChange={v => setFilters(f => ({ ...f, payment_method: v || undefined }))}
                      options={PAYMENT_METHODS}
                    />
                  )}

                  {/* Staff Role — staff only */}
                  {reportType === 'staff' && (
                    <FilterSelect
                      label="Staff Role"
                      value={filters.role || ''}
                      onChange={v => setFilters(f => ({ ...f, role: v || undefined }))}
                      options={STAFF_ROLES}
                    />
                  )}

                  {/* Staff Member — staff only */}
                  {reportType === 'staff' && (
                    <div className="crp-filter-item">
                      <label className="crp-filter-label">Staff Member</label>
                      <input
                        type="text"
                        className="sf-input crp-filter-select"
                        placeholder="Name or ID…"
                        value={filters.staff_id || ''}
                        onChange={e => setFilters(f => ({ ...f, staff_id: e.target.value || undefined }))}
                      />
                    </div>
                  )}

                  {/* No filters for this type */}
                  {!['bookings', 'revenue', 'occupancy', 'payments', 'staff'].includes(reportType) && (
                    <p className="crp-filter-none">
                      No additional filters available for this report type.
                    </p>
                  )}
                </div>

                {Object.values(filters).some(Boolean) && (
                  <button
                    className="crp-clear-btn"
                    onClick={() => setFilters({})}
                    type="button"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────── */}
        <div>

          {/* Metrics */}
          <div className="crp-section">
            <SectionLabel
              hint={metrics.length === 0 ? 'All metrics included by default' : `${metrics.length} selected`}
            >
              Metrics
            </SectionLabel>

            {availMetrics.length > 0 ? (
              <>
                <div className="crp-metrics-grid">
                  {availMetrics.map(m => (
                    <MetricChip
                      key={m}
                      label={m}
                      active={metrics.includes(m)}
                      onClick={() => toggleMetric(m)}
                    />
                  ))}
                </div>
                {metrics.length > 0 && (
                  <button
                    className="crp-clear-btn"
                    onClick={() => setMetrics([])}
                    type="button"
                  >
                    Clear selection (show all)
                  </button>
                )}
              </>
            ) : (
              <p className="crp-filter-none">
                Metrics will load after selecting a report type.
              </p>
            )}
          </div>

          {/* Export format */}
          <div className="crp-section">
            <SectionLabel>Export Format</SectionLabel>
            <div className="crp-period-row">
              {Object.entries(FORMAT_LABELS).map(([val, lbl]) => (
                <button
                  key={val}
                  className={`crp-period-btn${exportFmt === val ? ' crp-period-btn--active' : ''}`}
                  onClick={() => setExportFmt(val)}
                  type="button"
                >
                  {lbl}
                </button>
              ))}
            </div>
            {exportFmt !== 'json' && (
              <p className="crp-export-note">
                File will download directly. A notification will confirm when ready.
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="crp-error">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="crp-actions">
        <button
          className="sf-btn sf-btn-primary crp-run-btn"
          onClick={handleRun}
          disabled={loading}
          type="button"
        >
          {loading
            ? <><RefreshCw size={13} className="crp-spin" /> Generating…</>
            : <><Play size={13} /> Run Report</>
          }
        </button>
        <button
          className="sf-btn"
          onClick={() => setShowSave(true)}
          disabled={!reportType}
          type="button"
        >
          <Save size={13} /> Save as Template
        </button>
      </div>

      {showSave && (
        <SaveTemplateModal
          reportType={reportType}
          config={buildConfig()}
          onClose={() => setShowSave(false)}
          onSaved={() => setShowSave(false)}
        />
      )}
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab({ onRunResult }) {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [running,   setRunning]   = useState(null);
  const [showSched, setShowSched] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reportTemplateApi.list();
      setTemplates(Array.isArray(data) ? data : data.results || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRun = async (tpl) => {
    setRunning(tpl.id);
    try {
      const result = await reportTemplateApi.run(tpl.id, { export_format: 'json' });
      onRunResult(result, tpl.name);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to run report.');
    } finally { setRunning(null); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await reportTemplateApi.remove(id);
      setTemplates(t => t.filter(x => x.id !== id));
    } catch {}
  };

  if (loading) return <div className="crp-loading">Loading templates…</div>;
  if (!templates.length) return (
    <div className="crp-empty">
      <FileText size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
      <p style={{ fontWeight: 600, color: 'var(--sf-text-primary)' }}>No saved templates yet.</p>
      <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 4 }}>
        Build a report and click "Save as Template" to reuse it later.
      </p>
    </div>
  );

  return (
    <div className="crp-list">
      {templates.map(tpl => (
        <div key={tpl.id} className="crp-list-item">
          <div className="crp-list-main">
            <div className="crp-list-name">
              {tpl.name}
              {tpl.is_shared && (
                <span className="crp-shared-badge">Shared</span>
              )}
            </div>
            <div className="crp-list-meta">
              {tpl.report_type_display} · Updated {timeAgo(tpl.updated_at)}
            </div>
          </div>
          <div className="crp-list-actions">
            <button
              className="sf-btn sf-btn-primary crp-sm-btn"
              onClick={() => handleRun(tpl)}
              disabled={running === tpl.id}
              type="button"
            >
              {running === tpl.id
                ? <RefreshCw size={11} className="crp-spin" />
                : <Play size={11} />
              }
              Run
            </button>
            <button
              className="sf-btn crp-sm-btn"
              onClick={() => setShowSched(tpl)}
              type="button"
            >
              <Clock size={11} /> Schedule
            </button>
            <button
              className="crp-icon-btn crp-icon-btn--danger"
              onClick={() => handleDelete(tpl.id)}
              title="Delete"
              type="button"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {showSched && (
        <ScheduleModal
          template={showSched}
          onClose={() => setShowSched(null)}
          onSaved={() => setShowSched(null)}
        />
      )}
    </div>
  );
}

// ─── Schedules Tab ────────────────────────────────────────────────────────────

function SchedulesTab() {
  const [schedules, setSchedules] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reportScheduleApi.list();
      setSchedules(Array.isArray(data) ? data : data.results || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id) => {
    try {
      const res = await reportScheduleApi.toggle(id);
      setSchedules(s => s.map(x => x.id === id ? { ...x, is_active: res.is_active } : x));
    } catch {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this schedule?')) return;
    try {
      await reportScheduleApi.remove(id);
      setSchedules(s => s.filter(x => x.id !== id));
    } catch {}
  };

  if (loading) return <div className="crp-loading">Loading schedules…</div>;
  if (!schedules.length) return (
    <div className="crp-empty">
      <Calendar size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
      <p style={{ fontWeight: 600, color: 'var(--sf-text-primary)' }}>No scheduled reports yet.</p>
      <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 4 }}>
        Go to Templates and click "Schedule" on any saved template.
      </p>
    </div>
  );

  return (
    <div className="crp-list">
      {schedules.map(s => (
        <div key={s.id} className={`crp-list-item${!s.is_active ? ' crp-list-item--muted' : ''}`}>
          <div className="crp-list-main">
            <div className="crp-list-name">{s.template_name}</div>
            <div className="crp-list-meta">
              {s.frequency_display} · {s.export_format_display}
              {s.next_run && ` · Next: ${new Date(s.next_run).toLocaleDateString('en-PH')}`}
              {s.last_run && ` · Last: ${timeAgo(s.last_run)}`}
            </div>
          </div>
          <div className="crp-list-actions">
            <button
              className="crp-icon-btn"
              onClick={() => handleToggle(s.id)}
              title={s.is_active ? 'Deactivate' : 'Activate'}
              type="button"
            >
              {s.is_active
                ? <ToggleRight size={18} style={{ color: 'var(--sf-green)' }} />
                : <ToggleLeft  size={18} style={{ color: 'var(--sf-text-muted)' }} />
              }
            </button>
            <button
              className="crp-icon-btn crp-icon-btn--danger"
              onClick={() => handleDelete(s.id)}
              title="Delete"
              type="button"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ onViewResult, setActiveTab }) {
  const [executions,  setExecutions]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [dlError,     setDlError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reportExecutionApi.list();
      setExecutions(Array.isArray(data) ? data : data.results || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (exec) => {
    setDownloading(exec.id);
    setDlError(null);

    if (exec.status === 'failed') {
      setDlError(`Cannot download: Report generation failed. ${exec.error_message || ''}`);
      setDownloading(null);
      return;
    }

    const fmt = exec.export_format === 'json' ? 'csv' : exec.export_format;

    try {
      const blob = await reportRunApi.download({
        report_type: exec.report_type,
        config: exec.config_snapshot || {},
        export_format: fmt,
      });

      if (!blob || blob.size === 0) {
        setDlError('Generated file is empty');
        return;
      }

      const ext = fmt === 'excel' ? 'xlsx' : fmt;
      triggerBlobDownload(blob, `${exec.report_type}_${exec.id}.${ext}`);
    } catch (err) {
      let msg = err.message || 'Generation failed.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          msg = json.detail || json.error || text;
        } catch {
          msg = `Server error ${err.response?.status}`;
        }
      } else if (err.response?.data?.detail) {
        msg = err.response.data.detail;
      }
      setDlError(`Failed: ${msg}`);
    } finally {
      setDownloading(null);
    }
  };

  const handleView = async (exec) => {
    try {
      const detail = await reportExecutionApi.detail(exec.id);
      onViewResult(detail);
    } catch {}
  };

  const handleRetry = async (exec) => {
    setDownloading(exec.id);
    setDlError(null);

    try {
      const result = await reportRunApi.run({
        report_type: exec.report_type,
        config: exec.config_snapshot || {},
        export_format: 'json',
      });
      onViewResult(result);
      setActiveTab('build');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Retry failed';
      setDlError(`Retry failed: ${msg}`);
    } finally {
      setDownloading(null);
    }
  };

  if (loading) return <div className="crp-loading">Loading history…</div>;
  if (!executions.length) return (
    <div className="crp-empty">
      <History size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
      <p style={{ fontWeight: 600, color: 'var(--sf-text-primary)' }}>No report history yet.</p>
    </div>
  );

  return (
    <div className="crp-history">
      {dlError && (
        <div className="crp-error" style={{ marginBottom: 12 }}>
          <AlertTriangle size={13} /> {dlError}
        </div>
      )}
      <table className="sf-table crp-hist-table">
        <thead>
          <tr>
            <th>Report</th>
            <th>Format</th>
            <th>Status</th>
            <th>Triggered By</th>
            <th>Run At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {executions.map(e => (
            <tr key={e.id}>
              <td>
                <span style={{ fontWeight: 600, color: 'var(--sf-text-primary)' }}>
                  {e.report_type_display}
                </span>
                {e.is_scheduled && (
                  <span className="crp-sched-tag">scheduled</span>
                )}
              </td>
              <td style={{ textTransform: 'uppercase', fontSize: 10, fontWeight: 700, color: 'var(--sf-text-muted)' }}>
                {e.export_format}
              </td>
              <td>
                <StatusBadge status={e.status} />
                {e.status === 'failed' && e.error_message && (
                  <span
                    style={{
                      fontSize: 9, color: 'var(--sf-red)', display: 'block',
                      maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', marginTop: 4,
                    }}
                    title={e.error_message}
                  >
                    {e.error_message.substring(0, 50)}…
                  </span>
                )}
              </td>
              <td style={{ fontSize: 12, color: 'var(--sf-text-muted)' }}>
                {e.triggered_by_email || '—'}
              </td>
              <td style={{ fontSize: 12, color: 'var(--sf-text-muted)' }}>
                {timeAgo(e.started_at)}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  {e.status === 'success' && (
                    <>
                      {e.export_format === 'json' && e.result_data && (
                        <button
                          className="crp-icon-btn"
                          title="View result"
                          onClick={() => handleView(e)}
                          type="button"
                        >
                          <ChevronRight size={13} />
                        </button>
                      )}
                      <button
                        className="crp-icon-btn"
                        title={`Download ${e.export_format === 'json' ? 'CSV' : e.export_format.toUpperCase()}`}
                        onClick={() => handleDownload(e)}
                        disabled={downloading === e.id}
                        type="button"
                      >
                        {downloading === e.id
                          ? <RefreshCw size={13} className="crp-spin" />
                          : <Download size={13} />
                        }
                      </button>
                    </>
                  )}
                  {e.status === 'failed' && e.config_snapshot && (
                    <button
                      className="crp-icon-btn"
                      title="Retry this report"
                      onClick={() => handleRetry(e)}
                      disabled={downloading === e.id}
                      type="button"
                    >
                      {downloading === e.id
                        ? <RefreshCw size={13} className="crp-spin" />
                        : <RefreshCw size={13} />
                      }
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomReportPage() {
  const [activeTab,   setActiveTab]   = useState('build');
  const [meta,        setMeta]        = useState(null);
  const [result,      setResult]      = useState(null);
  const [resultTitle, setResultTitle] = useState('');

  useEffect(() => {
    reportMetaApi.get().then(setMeta).catch(() => {});
  }, []);

  const handleResult = (data, title = '') => {
    setResult(data);
    setResultTitle(title);
  };

  const handleViewHistoryResult = (execution) => {
    if (execution.result_data) {
      setResult({ execution_id: execution.id, data: execution.result_data });
      setResultTitle(execution.report_type_display || 'Report Result');
      setActiveTab('build');
    }
  };

  return (
    <div className="sf-page">
      <div className="sf-inner">

        {/* Header */}
        <div className="sf-page-header">
          <p className="sf-eyebrow">Analytics</p>
          <h1 className="sf-page-title">Custom Reports</h1>
          <p className="sf-page-subtitle">
            Build, save, and schedule reports with custom metrics and filters.
          </p>

        </div>

        {/* Tabs */}
        <div className="crp-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`crp-tab${activeTab === tab.id ? ' crp-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="crp-body">
          {activeTab === 'build' && (
            <BuildTab meta={meta} onResult={handleResult} />
          )}
          {activeTab === 'templates' && (
            <TemplatesTab onRunResult={(r, title) => { handleResult(r, title); setActiveTab('build'); }} />
          )}
          {activeTab === 'schedules' && <SchedulesTab />}
          {activeTab === 'history'   && (
            <HistoryTab
              onViewResult={handleViewHistoryResult}
              setActiveTab={setActiveTab}
            />
          )}
        </div>

        {/* Result panel — routed by report_type */}
        {result && activeTab === 'build' && (() => {
          const reportType = result?.data?.meta?.report_type
            || result?.meta?.report_type
            || '';
          if (reportType === 'payments') {
            return (
              <PaymentsResultPanel
                result={result}
                title={resultTitle}
                onClose={() => setResult(null)}
              />
            );
          }
          if (reportType === 'staff') {
            return (
              <StaffResultPanel
                result={result}
                title={resultTitle}
                onClose={() => setResult(null)}
              />
            );
          }
          return (
            <ReportResultPanel
              result={result}
              title={resultTitle}
              onClose={() => setResult(null)}
            />
          );
        })()}
      </div>
    </div>
  );
}