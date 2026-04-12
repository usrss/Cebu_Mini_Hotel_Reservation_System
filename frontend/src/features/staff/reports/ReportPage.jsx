/**
 * src/features/staff/reports/ReportPage.jsx
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { reportsApi } from '../services/staffApi';
import '../Staff.css';

const REPORT_TYPES = [
  { value: 'bookings',  label: 'Bookings',          icon: '📅' },
  { value: 'revenue',   label: 'Revenue',            icon: '💰' },
  { value: 'occupancy', label: 'Occupancy',          icon: '🏨' },
  { value: 'guests',    label: 'Guests',             icon: '👥' },
  { value: 'staff',     label: 'Staff Performance',  icon: '⭐' },
  { value: 'food',      label: 'Food & Beverage',    icon: '🍽️' },
];

const PERIODS = [
  { value: 'daily',   label: 'Today' },
  { value: 'weekly',  label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'yearly',  label: 'This Year' },
  { value: 'custom',  label: 'Custom' },
];

function currency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}
function pct(n) { return `${Number(n || 0).toFixed(1)}%`; }

function SummaryCard({ label, value, sub }) {
  return (
    <div className="sf-summary-card">
      <p className="sf-summary-label">{label}</p>
      <p className="sf-summary-value">{value}</p>
      {sub && <p className="sf-summary-sub">{sub}</p>}
    </div>
  );
}

function ReportSummary({ type, summary }) {
  if (type === 'bookings') return (
    <div className="sf-summary-grid">
      <SummaryCard label="Total Bookings"   value={summary.total} />
      <SummaryCard label="Confirmed"        value={summary.confirmed} />
      <SummaryCard label="Checked In"       value={summary.checked_in} />
      <SummaryCard label="Checked Out"      value={summary.checked_out} />
      <SummaryCard label="Cancelled"        value={summary.cancelled} />
      <SummaryCard label="No-Show"          value={summary.no_show} />
      <SummaryCard label="Expired"          value={summary.expired} />
      <SummaryCard label="Total Revenue"    value={currency(summary.total_revenue)} />
    </div>
  );
  if (type === 'revenue') return (
    <div className="sf-summary-grid">
      <SummaryCard label="Total Revenue"     value={currency(summary.total_revenue)} />
      <SummaryCard label="Net Revenue"       value={currency(summary.net_revenue)} />
      <SummaryCard label="Avg Booking"       value={currency(summary.avg_booking_value)} />
      <SummaryCard label="Paid Bookings"     value={summary.paid_bookings} />
      <SummaryCard label="Total Tax"         value={currency(summary.total_tax)} />
      <SummaryCard label="Service Fees"      value={currency(summary.total_service_fee)} />
      <SummaryCard label="Total Refunds"     value={currency(summary.total_refunds)} />
    </div>
  );
  if (type === 'occupancy') return (
    <div className="sf-summary-grid">
      <SummaryCard label="Occupancy Rate"   value={pct(summary.occupancy_rate)} />
      <SummaryCard label="Total Rooms"      value={summary.total_rooms} />
      <SummaryCard label="Occupied Nights"  value={summary.occupied_nights} />
      <SummaryCard label="Room-Nights"      value={summary.total_room_nights} />
    </div>
  );
  if (type === 'guests') return (
    <div className="sf-summary-grid">
      <SummaryCard label="New Registrations"   value={summary.new_registrations} />
      <SummaryCard label="Repeat Guests"       value={summary.repeat_guests} />
      <SummaryCard label="Registered Bookings" value={summary.registered_bookings} />
      <SummaryCard label="Walk-in Bookings"    value={summary.walk_in_bookings} />
    </div>
  );
  if (type === 'staff') return (
    <div className="sf-summary-grid">
      <SummaryCard label="Total Check-ins"        value={summary.total_check_ins} />
      <SummaryCard label="Cleaning Tasks Done"    value={summary.total_cleaning_done} />
      <SummaryCard label="Maintenance Tasks Done" value={summary.total_maintenance_done} />
      <SummaryCard label="Period" value={summary.period_start} sub={`→ ${summary.period_end}`} />
    </div>
  );
  if (type === 'food') return (
    <div className="sf-summary-grid">
      <SummaryCard label="Total Orders"     value={summary.total_orders} />
      <SummaryCard label="Completed Orders" value={summary.completed_orders} />
      <SummaryCard label="Pending Orders"   value={summary.pending_orders} />
      <SummaryCard label="Total Revenue"    value={currency(summary.total_revenue)} />
      <SummaryCard label="Paid Revenue"     value={currency(summary.paid_revenue)} />
      <SummaryCard label="Avg Order Value"  value={currency(summary.avg_order_value)} />
    </div>
  );
  return null;
}

export default function ReportPage() {
  const [reportType, setReportType] = useState('bookings');
  const [period,     setPeriod]     = useState('monthly');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const effectivePeriod = period === 'custom' ? 'monthly' : period;

  const handleGenerate = async () => {
    setLoading(true); setError(null); setData(null);
    try {
      const sd = period === 'custom' ? startDate : undefined;
      const ed = period === 'custom' ? endDate   : undefined;
      const result = await reportsApi.get(reportType, effectivePeriod, sd, ed);
      setData(result);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to generate report.');
    } finally { setLoading(false); }
  };

  const handleExport = async () => {
    try {
      const sd = period === 'custom' ? startDate : undefined;
      const ed = period === 'custom' ? endDate   : undefined;
      const blob = await reportsApi.exportCsv(reportType, effectivePeriod, sd, ed);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${reportType}_${effectivePeriod}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.response?.data?.detail || err.message); }
  };

  const summary = data?.data?.summary;
  const rows    = data?.data?.rows || [];

  return (
    <div className="sf-page">
      <div className="sf-inner">

        <div className="sf-page-header">
          <p className="sf-eyebrow">Analytics</p>
          <h1 className="sf-page-title">Reports</h1>
          <p className="sf-page-subtitle">Generate reports for any time period.</p>
          <div className="sf-divider" />
        </div>

        {/* Controls */}
        <div className="sf-card" style={{ marginBottom: 24 }}>
          <div className="sf-card-label">Report Configuration</div>

          <div style={{ marginBottom: 18 }}>
            <p className="sf-label" style={{ marginBottom: 10 }}>Report Type</p>
            <div className="sf-report-types">
              {REPORT_TYPES.map((rt) => (
                <button key={rt.value}
                  className={`sf-report-type-btn${reportType === rt.value ? ' active' : ''}`}
                  onClick={() => { setReportType(rt.value); setData(null); }}>
                  {rt.icon} {rt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <p className="sf-label" style={{ marginBottom: 10 }}>Period</p>
            <div className="sf-period-tabs">
              {PERIODS.map((p) => (
                <button key={p.value}
                  className={`sf-period-tab${period === p.value ? ' active' : ''}`}
                  onClick={() => setPeriod(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <div className="sf-form-row" style={{ marginBottom: 18 }}>
              <div className="sf-form-group">
                <label className="sf-label">Start Date</label>
                <input type="date" className="sf-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="sf-form-group">
                <label className="sf-label">End Date</label>
                <input type="date" className="sf-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="sf-btn sf-btn-primary" onClick={handleGenerate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate Report'}
            </button>
            {data && (
              <button className="sf-btn" onClick={handleExport}>
                <Download size={13} /> Export CSV
              </button>
            )}
          </div>
        </div>

        {error && <div className="sf-notice sf-notice-error">{error}</div>}

        {/* Summary */}
        {summary && <ReportSummary type={reportType} summary={summary} />}

        {/* Rows table */}
        {rows.length > 0 && (
          <div className="sf-table-wrap">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gold-border)', background: 'var(--gold-dim)' }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)' }}>
                {data?.start_date} → {data?.end_date} · {rows.length} rows
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="sf-table">
                <thead>
                  <tr>
                    {Object.keys(rows[0]).map((col) => (
                      <th key={col}>{col.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {Object.entries(row).map(([key, val], j) => (
                        <td key={j}>
                          {typeof val === 'number' && key.includes('revenue') ? currency(val)
                           : typeof val === 'number' && key.includes('rate')  ? pct(val)
                           : String(val ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data && rows.length === 0 && (
          <div className="sf-card" style={{ textAlign: 'center', color: 'var(--white-dim)', fontSize: 13 }}>
            No data for the selected period.
          </div>
        )}
      </div>
    </div>
  );
}