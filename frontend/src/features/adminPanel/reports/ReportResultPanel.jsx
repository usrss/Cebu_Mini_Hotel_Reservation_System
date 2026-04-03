/**
 * src/features/adminPanel/reports/ReportResultPanel.jsx
 *
 * Renders the report result returned from /api/reports/run/ or
 * /api/reports/templates/<id>/run/
 *
 * Shows:
 *   - Summary KPI cards
 *   - Line / bar chart of rows data (via Recharts)
 *   - Data table with all rows
 *   - Export buttons (CSV, PDF, Excel)
 */

import { useState } from 'react';
import {
  X, Download, TrendingUp,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  reportExecutionApi,
  triggerBlobDownload,
} from '../../../services/reportsApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCurrency(key) {
  return ['revenue', 'total', 'paid', 'refund', 'spent', 'tax', 'fee', 'value']
    .some(k => key.toLowerCase().includes(k));
}
function isPercent(key) {
  return key.toLowerCase().includes('rate') || key.toLowerCase().includes('pct');
}

function fmtCell(key, val) {
  if (val == null) return '—';
  if (typeof val === 'number') {
    if (isCurrency(key)) return `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    if (isPercent(key))  return `${Number(val).toFixed(1)}%`;
    return Number.isInteger(val) ? val.toLocaleString() : Number(val).toFixed(2);
  }
  return String(val);
}

function fmtSummaryVal(key, val) {
  if (val == null) return '—';
  if (typeof val === 'number') {
    if (isCurrency(key)) return `₱${Number(val).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
    if (isPercent(key))  return `${Number(val).toFixed(1)}%`;
    return val.toLocaleString();
  }
  return String(val);
}

// Pick the best numeric key for the chart Y-axis
function pickChartKey(rows) {
  if (!rows?.length) return null;
  const keys = Object.keys(rows[0]).filter(k => typeof rows[0][k] === 'number');
  return (
    keys.find(k => k.includes('revenue')) ||
    keys.find(k => k.includes('count') || k.includes('bookings')) ||
    keys.find(k => k.includes('rate')) ||
    keys[0] ||
    null
  );
}

function pickXKey(rows) {
  if (!rows?.length) return null;
  const keys = Object.keys(rows[0]);
  return (
    keys.find(k => k === 'period' || k === 'date' || k === 'day' || k === 'month') ||
    keys.find(k => typeof rows[0][k] === 'string') ||
    keys[0]
  );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function ReportChart({ rows, reportType }) {
  const [chartType, setChartType] = useState('line');

  const xKey = pickXKey(rows);
  const yKey = pickChartKey(rows);

  if (!xKey || !yKey || rows.length < 2) return null;

  const isMoney = isCurrency(yKey);
  const isPct   = isPercent(yKey);

  const tickFmt = v => {
    if (isMoney) return `₱${Number(v).toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 1 })}`;
    if (isPct)   return `${v}%`;
    return Number(v).toLocaleString('en-PH', { notation: 'compact' });
  };

  const GOLD     = '#D4AF37';
  const GOLD_DIM = 'rgba(212,175,55,0.15)';

  const sharedProps = {
    data: rows,
    margin: { top: 10, right: 20, left: 10, bottom: 5 },
  };

  return (
    <div className="crp-chart-wrap">
      <div className="crp-chart-header">
        <span className="crp-chart-title">
          <TrendingUp size={13} />
          {yKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} over time
        </span>
        <div className="crp-chart-toggle">
          {['line', 'bar'].map(t => (
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

      <ResponsiveContainer width="100%" height={220}>
        {chartType === 'line' ? (
          <LineChart {...sharedProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
            <XAxis dataKey={xKey} tick={{ fill: 'rgba(248,246,240,0.4)', fontSize: 10 }} />
            <YAxis tickFormatter={tickFmt} tick={{ fill: 'rgba(248,246,240,0.4)', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: 'var(--navy-mid)', border: '1px solid var(--gold-border)', borderRadius: 0, fontSize: 12 }}
              labelStyle={{ color: 'var(--gold)' }}
              formatter={(v, name) => [tickFmt(v), name.replace(/_/g, ' ')]}
            />
            <Line type="monotone" dataKey={yKey} stroke={GOLD} strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart {...sharedProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
            <XAxis dataKey={xKey} tick={{ fill: 'rgba(248,246,240,0.4)', fontSize: 10 }} />
            <YAxis tickFormatter={tickFmt} tick={{ fill: 'rgba(248,246,240,0.4)', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: 'var(--navy-mid)', border: '1px solid var(--gold-border)', borderRadius: 0, fontSize: 12 }}
              formatter={(v, name) => [tickFmt(v), name.replace(/_/g, ' ')]}
            />
            <Bar dataKey={yKey} fill={GOLD} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ReportResultPanel({ result, title, onClose }) {
  const [downloading, setDownloading] = useState(null);

  const data        = result?.data || result;
  const executionId = result?.execution_id;
  const summary     = data?.summary || {};
  const rows        = data?.rows    || [];
  const meta        = data?.meta    || {};

  const handleDownload = async (format) => {
    setDownloading(format);
    try {
      if (executionId) {
        const blob = await reportExecutionApi.download(executionId, format);
        triggerBlobDownload(blob, `${meta.report_type || 'report'}_${format === 'excel' ? 'xlsx' : format}`);
      }
    } catch (err) {
      alert(err.message || 'Download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const summaryEntries = Object.entries(summary);
  const rowKeys        = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="crp-result">

      {/* Result header */}
      <div className="crp-result-header">
        <div>
          <p className="crp-result-eyebrow">Report Result</p>
          <h2 className="crp-result-title">
            {title || (meta.report_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </h2>
          {meta.start_date && (
            <p className="crp-result-sub">
              {meta.start_date} → {meta.end_date}
              {meta.cached && <span className="crp-cached-tag">cached</span>}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {executionId && (
            <>
              {['csv', 'pdf', 'excel'].map(fmt => (
                <button
                  key={fmt}
                  className="sf-btn crp-sm-btn"
                  onClick={() => handleDownload(fmt)}
                  disabled={downloading === fmt}
                  type="button"
                >
                  <Download size={11} />
                  {downloading === fmt ? '…' : fmt.toUpperCase()}
                </button>
              ))}
            </>
          )}
          <button className="crp-icon-btn" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summaryEntries.length > 0 && (
        <div className="crp-summary-grid">
          {summaryEntries.map(([k, v]) => (
            <div key={k} className="crp-summary-card">
              <p className="crp-summary-label">{k.replace(/_/g, ' ')}</p>
              <p className="crp-summary-value">{fmtSummaryVal(k, v)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {rows.length > 1 && (
        <ReportChart rows={rows} reportType={meta.report_type} />
      )}

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
                      <td key={j} style={isCurrency(k) ? { color: 'var(--green)', fontVariantNumeric: 'tabular-nums' } : {}}>
                        {fmtCell(k, row[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="crp-no-data">No data for the selected period and filters.</div>
      )}
    </div>
  );
}