/**
 * src/features/adminPanel/reports/PaymentsResultPanel.jsx
 *
 * Dedicated result renderer for report_type = "payments".
 *
 * Displays:
 *   - KPI summary cards (gross, net, refunds, failed rate, etc.)
 *   - Transaction volume chart (line or bar via Recharts)
 *   - Full transaction breakdown table
 *   - Export buttons (CSV, PDF, Excel)
 *
 * RULES enforced in display:
 *   - Refunds reduce net_collected_amount (never added to gross)
 *   - Failed payments shown separately — never counted as revenue
 *   - Pending payments tracked in their own card
 *
 * Props:
 *   result  — raw API response from /api/reports/run/ { data: { summary, rows, meta } }
 *   title   — string label
 *   onClose — () => void
 */

import { useState } from 'react';
import {
  X, Download, AlertTriangle, RefreshCw,
  TrendingUp, TrendingDown, CreditCard,
  CheckCircle2, XCircle, Clock, RotateCcw,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { reportExecutionApi, triggerBlobDownload } from '../../../services/reportsApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const php = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (n) => `${Number(n || 0).toFixed(1)}%`;

const compact = (n) =>
  Number(n || 0).toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 1 });

function fmtCell(key, val) {
  if (val == null) return '—';
  const k = key.toLowerCase();
  if (k.includes('amount') || k.includes('gross') || k.includes('net') ||
      k.includes('refund') || k.includes('revenue') || k.includes('value')) {
    return php(val);
  }
  if (k.includes('rate') || k.includes('pct')) return pct(val);
  if (typeof val === 'number') return Number.isInteger(val) ? val.toLocaleString() : Number(val).toFixed(2);
  return String(val);
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  paid:       { bg: 'var(--sf-green-bg)',  color: 'var(--sf-green)'  },
  success:    { bg: 'var(--sf-green-bg)',  color: 'var(--sf-green)'  },
  failed:     { bg: 'var(--sf-red-bg)',    color: 'var(--sf-red)'    },
  pending:    { bg: 'var(--sf-amber-bg)',  color: 'var(--sf-amber)'  },
  processing: { bg: 'var(--sf-blue-bg)',   color: 'var(--sf-blue)'   },
  refunded:   { bg: 'var(--sf-purple-bg)', color: 'var(--sf-purple)' },
  cancelled:  { bg: 'var(--sf-surface-2)', color: 'var(--sf-text-muted)' },
  expired:    { bg: 'var(--sf-surface-2)', color: 'var(--sf-text-muted)' },
};

function StatusPill({ status }) {
  const s = (status || '').toLowerCase();
  const style = STATUS_STYLE[s] || { bg: 'var(--sf-surface-2)', color: 'var(--sf-text-muted)' };
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
      textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 999,
      background: style.bg, color: style.color,
    }}>
      {status}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, accentColor, dimmed }) {
  return (
    <div className="prp-kpi-card" style={{ opacity: dimmed ? 0.55 : 1 }}>
      <div className="prp-kpi-icon" style={{ color: accentColor }}>{icon}</div>
      <div className="prp-kpi-body">
        <p className="prp-kpi-label">{label}</p>
        <p className="prp-kpi-value" style={{ color: accentColor }}>{value}</p>
        {sub && <p className="prp-kpi-sub">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function PaymentsChart({ rows }) {
  const [chartType, setChartType] = useState('bar');

  // Detect x-axis key
  const xKey = ['period', 'date', 'day', 'month', 'payment_method', 'payment_status']
    .find(k => rows[0]?.[k] != null) || Object.keys(rows[0] || {})[0];

  // Detect numeric series — show up to 3 most relevant
  const numericKeys = Object.keys(rows[0] || {}).filter(
    k => typeof rows[0][k] === 'number' && k !== xKey
  );

  const SERIES = [
    { key: 'total_gross_amount',    color: '#01000D', label: 'Gross'     },
    { key: 'net_collected_amount',  color: '#0D9488', label: 'Net'       },
    { key: 'total_refunds',         color: '#DC2626', label: 'Refunds'   },
    { key: 'successful_payments',   color: '#0D9488', label: 'Successful'},
    { key: 'failed_payments',       color: '#DC2626', label: 'Failed'    },
    { key: 'pending_payments',      color: '#D97706', label: 'Pending'   },
  ].filter(s => numericKeys.includes(s.key));

  const activeSeries = SERIES.length > 0
    ? SERIES
    : numericKeys.slice(0, 3).map((k, i) => ({
        key: k,
        color: ['#01000D', '#0D9488', '#DC2626'][i],
        label: k.replace(/_/g, ' '),
      }));

  if (!xKey || activeSeries.length === 0 || rows.length < 2) return null;

  const tickFmt = (v) =>
    typeof v === 'number'
      ? `₱${Number(v).toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 1 })}`
      : v;

  const sharedProps = {
    data: rows,
    margin: { top: 8, right: 16, left: 8, bottom: 4 },
  };

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--sf-surface-3)" />
      <XAxis dataKey={xKey} tick={{ fill: 'var(--sf-text-muted)', fontSize: 10 }} />
      <YAxis tickFormatter={tickFmt} tick={{ fill: 'var(--sf-text-muted)', fontSize: 10 }} />
      <Tooltip
        contentStyle={{
          background: 'var(--sf-surface)',
          border: '1px solid var(--sf-surface-3)',
          borderRadius: 8, fontSize: 12,
        }}
        formatter={(v, name) => [tickFmt(v), name]}
      />
      <Legend
        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        formatter={(v) => activeSeries.find(s => s.key === v)?.label || v}
      />
    </>
  );

  return (
    <div className="prp-chart-wrap">
      <div className="prp-chart-header">
        <span className="prp-chart-title">
          <TrendingUp size={13} /> Payment Volume Over Time
        </span>
        <div className="crp-chart-toggle">
          {['bar', 'line'].map(t => (
            <button
              key={t}
              className={`crp-period-btn${chartType === t ? ' crp-period-btn--active' : ''}`}
              style={{ padding: '3px 10px', fontSize: 10 }}
              onClick={() => setChartType(t)}
              type="button"
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={230}>
        {chartType === 'bar' ? (
          <BarChart {...sharedProps}>
            {axes}
            {activeSeries.map(s => (
              <Bar key={s.key} dataKey={s.key} fill={s.color} fillOpacity={0.82} radius={[3, 3, 0, 0]} name={s.key} />
            ))}
          </BarChart>
        ) : (
          <LineChart {...sharedProps}>
            {axes}
            {activeSeries.map(s => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} name={s.key} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PaymentsResultPanel({ result, title, onClose }) {
  const [downloading,   setDownloading]   = useState(null);
  const [downloadError, setDownloadError] = useState(null);

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
      const ext      = format === 'excel' ? 'xlsx' : format;
      const filename = `payments_report_${meta.start_date || 'export'}.${ext}`;
      triggerBlobDownload(blob, filename);
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

  const rowKeys = rows.length > 0 ? Object.keys(rows[0]) : [];

  // ── KPI cards config ──────────────────────────────────────────────────────
  const kpis = [
    {
      label: 'Total Gross',
      value: php(summary.total_gross_amount),
      sub: `${summary.total_payments_processed ?? 0} transactions`,
      icon: <CreditCard size={16} />,
      accentColor: 'var(--sf-text-primary)',
    },
    {
      label: 'Net Collected',
      value: php(summary.net_collected_amount),
      sub: 'After refunds',
      icon: <TrendingUp size={16} />,
      accentColor: 'var(--sf-green)',
    },
    {
      label: 'Successful',
      value: summary.successful_payments ?? '—',
      sub: php(summary.total_gross_amount),
      icon: <CheckCircle2 size={16} />,
      accentColor: 'var(--sf-green)',
    },
    {
      label: 'Total Refunds',
      value: php(summary.total_refunds),
      sub: `${pct(summary.refund_rate)} refund rate`,
      icon: <RotateCcw size={16} />,
      accentColor: 'var(--sf-red)',
    },
    {
      label: 'Failed Payments',
      value: summary.failed_payments ?? '—',
      sub: `${pct(summary.failed_payment_rate)} failure rate`,
      icon: <XCircle size={16} />,
      accentColor: 'var(--sf-red)',
      dimmed: (summary.failed_payments ?? 0) === 0,
    },
    {
      label: 'Pending',
      value: summary.pending_payments ?? '—',
      sub: 'Awaiting completion',
      icon: <Clock size={16} />,
      accentColor: 'var(--sf-amber)',
      dimmed: (summary.pending_payments ?? 0) === 0,
    },
    {
      label: 'Avg Transaction',
      value: php(summary.average_transaction_value),
      sub: 'Per successful payment',
      icon: <TrendingUp size={16} />,
      accentColor: 'var(--sf-blue)',
    },
  ];

  return (
    <div className="crp-result prp-root">

      {/* Header */}
      <div className="crp-result-header">
        <div>
          <p className="crp-result-eyebrow">Payments Report</p>
          <h2 className="crp-result-title">{title || 'Payment Transactions'}</h2>
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

      {/* Important notice — payment rules */}
      <div className="prp-rules-notice">
        <span className="prp-rules-item prp-rules-item--green">
          <CheckCircle2 size={10} /> Paid only counted as revenue
        </span>
        <span className="prp-rules-item prp-rules-item--red">
          <XCircle size={10} /> Failed excluded from totals
        </span>
        <span className="prp-rules-item prp-rules-item--amber">
          <RotateCcw size={10} /> Refunds deducted from net
        </span>
      </div>

      {/* KPI cards */}
      <div className="prp-kpi-grid">
        {kpis.map((k, i) => (
          <KpiCard key={i} {...k} />
        ))}
      </div>

      {/* Chart */}
      {rows.length > 1 && <PaymentsChart rows={rows} />}

      {/* Data table */}
      {rows.length > 0 ? (
        <div className="crp-table-wrap">
          <div className="crp-table-header">
            <span className="crp-table-count">
              {rows.length} row{rows.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="sf-table">
              <thead>
                <tr>
                  {rowKeys.map(k => (
                    <th key={k}>{k.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {rowKeys.map((k, j) => (
                      <td key={j}>
                        {k === 'payment_status' || k === 'status'
                          ? <StatusPill status={row[k]} />
                          : <span style={{
                              color: (k.includes('net') || k.includes('gross') || k.includes('amount'))
                                ? 'var(--sf-green)'
                                : k.includes('refund') || k.includes('failed')
                                  ? 'var(--sf-red)'
                                  : 'inherit',
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {fmtCell(k, row[k])}
                            </span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="crp-no-data">No payment data for the selected period and filters.</div>
      )}
    </div>
  );
}