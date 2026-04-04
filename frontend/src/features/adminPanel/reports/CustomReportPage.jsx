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
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Play, Download, Save, Clock, History,
  FileText, Plus, Trash2, ChevronRight,
  CheckCircle2, AlertTriangle, RefreshCw,
  BarChart2, Calendar, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  reportMetaApi,
  reportRunApi,
  reportTemplateApi,
  reportScheduleApi,
  reportExecutionApi,
  triggerBlobDownload,
} from '../../../services/reportsApi';
import ReportResultPanel  from './ReportResultPanel';
import SaveTemplateModal  from './SaveTemplateModal';
import ScheduleModal      from './ScheduleModal';
import './CustomReportPage.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'build',     label: 'Build',     icon: <BarChart2 size={14} /> },
  { id: 'templates', label: 'Templates', icon: <FileText size={14} />  },
  { id: 'schedules', label: 'Schedules', icon: <Calendar size={14} />  },
  { id: 'history',   label: 'History',   icon: <History size={14} />   },
];

const FORMAT_LABELS = { json: 'In-App', csv: 'CSV', pdf: 'PDF', excel: 'Excel' };
const STATUS_COLORS = {
  success: 'var(--green)',
  failed:  'var(--red)',
  pending: 'var(--amber)',
};

// Fix #1 — mirror MAX_DATE_RANGE_DAYS from backend serializers.py
const MAX_DATE_RANGE_DAYS = 366;

// Fix #3 — VALID_GROUP_BY_PER_TYPE is now served by GET /api/reports/meta/
// as valid_group_by_per_type. The constant below is the fallback used only
// if the API hasn't loaded yet (prevents the UI from being empty on first render).
const VALID_GROUP_BY_PER_TYPE_FALLBACK = {
  bookings:  ['day', 'week', 'month', 'room_type', 'status'],
  revenue:   ['day', 'week', 'month', 'room_type'],
  occupancy: ['room_type'],
  guests:    ['day', 'week', 'month'],
  staff:     ['day', 'week', 'month'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  if (typeof n === 'number') {
    if (Math.abs(n) >= 1000) return Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
    return Number(n).toFixed(Number.isInteger(n) ? 0 : 2);
  }
  return String(n);
}

function currency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

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

function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 2.5,
      textTransform: 'uppercase', color: 'rgba(212,175,55,0.5)',
      marginBottom: 8,
    }}>
      {children}
    </p>
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

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="crp-filter-item">
      <label className="crp-filter-label">{label}</label>
      <select className="sf-input crp-filter-select" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Any</option>
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
      color: STATUS_COLORS[status] || 'var(--white-dim)',
      padding: '2px 7px',
      border: `1px solid ${STATUS_COLORS[status] || 'var(--gold-border)'}`,
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

  const availMetrics  = meta?.metrics_by_type?.[reportType] || [];
  // Fix #3 — use the map served by /api/reports/meta/ (valid_group_by_per_type).
  // Fall back to the local constant only before the API response arrives.
  const groupByMap    = meta?.valid_group_by_per_type || VALID_GROUP_BY_PER_TYPE_FALLBACK;
  const validGroupBys = groupByMap[reportType] || (meta?.group_by_options || []);

  // Reset metrics, filters, group_by when report type changes
  useEffect(() => {
    setMetrics([]);
    setFilters({});
    setGroupBy(prev =>
      validGroupBys.includes(prev) ? prev : (validGroupBys[0] || 'day')
    );
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
    if (e < s)                    return 'End date must be after start date.';
    if (diff > MAX_DATE_RANGE_DAYS)
      return `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days (${diff} days selected).`;
    if (s > new Date())           return 'Start date cannot be in the future.';
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

  return (
    <div className="crp-build">

      {/* Report Type */}
      <div className="crp-section">
        <SectionLabel>Report Type</SectionLabel>
        <div className="crp-type-grid">
          {(meta?.report_types || []).map(rt => (
            <button
              key={rt.value}
              className={`crp-type-btn${reportType === rt.value ? ' crp-type-btn--active' : ''}`}
              onClick={() => setReportType(rt.value)}
              type="button"
            >
              <span className="crp-type-label">{rt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="crp-two-col">

        {/* Left column */}
        <div>
          {/* Period */}
          <div className="crp-section">
            <SectionLabel>Period</SectionLabel>
            <div className="crp-period-row">
              {(meta?.period_options || []).map(p => (
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
                    <label className="crp-filter-label">Start Date</label>
                    <input
                      type="date"
                      className="sf-input"
                      value={startDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => { setStartDate(e.target.value); setError(null); }}
                    />
                  </div>
                  <div>
                    <label className="crp-filter-label">End Date</label>
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
            <SectionLabel>
              Group By
              {validGroupBys.length < 5 && (
                <span style={{ color: 'rgba(212,175,55,0.35)', fontWeight: 400, marginLeft: 6 }}>
                  · limited for {reportType}
                </span>
              )}
            </SectionLabel>
            <div className="crp-period-row">
              {(meta?.group_by_options || []).map(g => {
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
            <SectionLabel>Filters (Optional)</SectionLabel>
            <div className="crp-filters-row">
              <FilterSelect
                label="Room Type"
                value={filters.room_type || ''}
                onChange={v => setFilters(f => ({ ...f, room_type: v || undefined }))}
                options={ROOM_TYPES}
              />
              {reportType === 'bookings' && (
                <FilterSelect
                  label="Status"
                  value={filters.status || ''}
                  onChange={v => setFilters(f => ({ ...f, status: v || undefined }))}
                  options={[
                    { value: 'confirmed',   label: 'Confirmed'   },
                    { value: 'checked_in',  label: 'Checked In'  },
                    { value: 'checked_out', label: 'Checked Out' },
                    { value: 'cancelled',   label: 'Cancelled'   },
                    { value: 'expired',     label: 'Expired'     },
                    { value: 'no_show',     label: 'No Show'     },
                  ]}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right column — Metrics */}
        <div>
          <div className="crp-section">
            <SectionLabel>
              Metrics
              {metrics.length > 0
                ? ` — ${metrics.length} selected`
                : ' — all (default)'}
            </SectionLabel>
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
              <p style={{ fontSize: 10, color: 'rgba(248,246,240,0.35)', marginTop: 8 }}>
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
        <button className="sf-btn sf-btn-primary crp-run-btn" onClick={handleRun} disabled={loading}>
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
      <FileText size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
      <p>No saved templates yet.</p>
      <p style={{ fontSize: 12, color: 'var(--white-dim)' }}>
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
            >
              <Clock size={11} /> Schedule
            </button>
            <button
              className="crp-icon-btn crp-icon-btn--danger"
              onClick={() => handleDelete(tpl.id)}
              title="Delete"
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
      <Calendar size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
      <p>No scheduled reports yet.</p>
      <p style={{ fontSize: 12, color: 'var(--white-dim)' }}>
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
            >
              {s.is_active
                ? <ToggleRight size={18} style={{ color: 'var(--green)' }} />
                : <ToggleLeft  size={18} style={{ color: 'var(--white-dim)' }} />
              }
            </button>
            <button
              className="crp-icon-btn crp-icon-btn--danger"
              onClick={() => handleDelete(s.id)}
              title="Delete"
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

function HistoryTab({ onViewResult }) {
  const [executions,   setExecutions]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [downloading,  setDownloading]  = useState(null); // tracks which exec is downloading
  const [dlError,      setDlError]      = useState(null);

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

    // Use the format the execution was originally run with.
    // If it was json (in-app), default to csv for the re-download.
    const fmt = exec.export_format === 'json' ? 'csv' : exec.export_format;

    try {
      const blob = await reportExecutionApi.download(exec.id, fmt);

      // Validate we actually got a file and not an error response
      if (!blob || blob.size === 0) {
        setDlError(`Execution #${exec.id}: empty file returned.`);
        return;
      }

      const ext = fmt === 'excel' ? 'xlsx' : fmt;
      triggerBlobDownload(blob, `${exec.report_type}_${exec.id}.${ext}`);
    } catch (err) {
      const msg = err.response?.data?.detail
        || err.response?.statusText
        || err.message
        || 'Download failed.';
      setDlError(`Execution #${exec.id}: ${msg}`);
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

  if (loading) return <div className="crp-loading">Loading history…</div>;
  if (!executions.length) return (
    <div className="crp-empty">
      <History size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
      <p>No report history yet.</p>
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
            <th>Duration</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {executions.map(e => (
            <tr key={e.id}>
              <td>
                <span style={{ fontWeight: 500, color: 'var(--gold)' }}>
                  {e.report_type_display}
                </span>
                {e.is_scheduled && (
                  <span className="crp-sched-tag">scheduled</span>
                )}
              </td>
              <td style={{ textTransform: 'uppercase', fontSize: 10 }}>
                {e.export_format}
              </td>
              <td><StatusBadge status={e.status} /></td>
              <td style={{ fontSize: 11, color: 'var(--white-dim)' }}>
                {e.triggered_by_email || '—'}
              </td>
              <td style={{ fontSize: 11, color: 'var(--white-dim)' }}>
                {timeAgo(e.started_at)}
              </td>
              <td style={{ fontSize: 11 }}>
                {e.duration_seconds != null ? `${e.duration_seconds}s` : '—'}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  {e.status === 'success' && (
                    <>
                      <button
                        className="crp-icon-btn"
                        title="View result"
                        onClick={() => handleView(e)}
                      >
                        <ChevronRight size={13} />
                      </button>
                      <button
                        className="crp-icon-btn"
                        title={`Download ${e.export_format === 'json' ? 'CSV' : e.export_format.toUpperCase()}`}
                        onClick={() => handleDownload(e)}
                        disabled={downloading === e.id}
                      >
                        {downloading === e.id
                          ? <RefreshCw size={13} className="crp-spin" />
                          : <Download size={13} />
                        }
                      </button>
                    </>
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
          <div className="sf-divider" />
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
          {activeTab === 'history'   && <HistoryTab onViewResult={handleViewHistoryResult} />}
        </div>

        {/* Result panel — rendered below the builder when a JSON result is available */}
        {result && activeTab === 'build' && (
          <ReportResultPanel
            result={result}
            title={resultTitle}
            onClose={() => setResult(null)}
          />
        )}
      </div>
    </div>
  );
}