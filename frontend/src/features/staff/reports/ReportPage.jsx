/**
 * src/features/staff/reports/ReportPage.jsx
 *
 * Admin/Manager analytics:
 *   bookings | revenue | occupancy | guests | staff performance
 *
 * Supports period presets and custom date range.
 * CSV export downloads the file directly.
 */

import { useState } from 'react';
import { reportsApi } from '../services/staffApi';

const REPORT_TYPES = [
  { value: 'bookings',  label: 'Bookings',           icon: '📅' },
  { value: 'revenue',   label: 'Revenue',             icon: '💰' },
  { value: 'occupancy', label: 'Occupancy',           icon: '🏨' },
  { value: 'guests',    label: 'Guests',              icon: '👥' },
  { value: 'staff',     label: 'Staff Performance',   icon: '⭐' },
];

const PERIODS = [
  { value: 'daily',   label: 'Today'       },
  { value: 'weekly',  label: 'This Week'   },
  { value: 'monthly', label: 'This Month'  },
  { value: 'yearly',  label: 'This Year'   },
  { value: 'custom',  label: 'Custom'      },
];

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function currency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function pct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

export default function ReportPage() {
  const [reportType, setReportType] = useState('bookings');
  const [period,     setPeriod]     = useState('monthly');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

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
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const sd = period === 'custom' ? startDate : undefined;
      const ed = period === 'custom' ? endDate   : undefined;
      const blob = await reportsApi.exportCsv(reportType, effectivePeriod, sd, ed);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${reportType}_${effectivePeriod}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  const summary = data?.data?.summary;
  const rows    = data?.data?.rows || [];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Reports & Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate reports for any time period</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Report type */}
          <div>
            <label className="block text-xs text-slate-500 mb-2">Report Type</label>
            <div className="flex flex-wrap gap-2">
              {REPORT_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  onClick={() => { setReportType(rt.value); setData(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                    ${reportType === rt.value
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  <span>{rt.icon}</span> {rt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div>
            <label className="block text-xs text-slate-500 mb-2">Period</label>
            <div className="flex gap-2 flex-wrap">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                    ${period === p.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date range */}
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              <span className="text-slate-400">→</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 ml-auto">
            <button onClick={handleGenerate} disabled={loading}
              className="bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
              {loading ? 'Generating…' : 'Generate'}
            </button>
            {data && (
              <button onClick={handleExport}
                className="border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50">
                ↓ CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 mb-4">{error}</div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="mb-5">
          <ReportSummary type={reportType} summary={summary} />
        </div>
      )}

      {/* Rows Table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">
              {data?.start_date} → {data?.end_date} · {rows.length} rows
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {Object.keys(rows[0]).map((col) => (
                    <th key={col} className="text-left px-4 py-3 font-medium text-slate-600 capitalize">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-4 py-3 text-slate-600">
                        {typeof val === 'number' && String(Object.keys(row)[j]).includes('revenue')
                          ? currency(val)
                          : typeof val === 'number' && String(Object.keys(row)[j]).includes('rate')
                          ? pct(val)
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
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
          No data for the selected period.
        </div>
      )}
    </div>
  );
}

// ─── Per-report summary layout ────────────────────────────────────────────────

function ReportSummary({ type, summary }) {
  if (type === 'bookings') return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SummaryCard label="Total Bookings"    value={summary.total} />
      <SummaryCard label="Confirmed"         value={summary.confirmed} />
      <SummaryCard label="Checked In"        value={summary.checked_in} />
      <SummaryCard label="Checked Out"       value={summary.checked_out} />
      <SummaryCard label="Cancelled"         value={summary.cancelled} />
      <SummaryCard label="No-Show"           value={summary.no_show} />
      <SummaryCard label="Expired"           value={summary.expired} />
      <SummaryCard label="Total Revenue"     value={currency(summary.total_revenue)} />
    </div>
  );

  if (type === 'revenue') return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SummaryCard label="Total Revenue"      value={currency(summary.total_revenue)} />
      <SummaryCard label="Net Revenue"        value={currency(summary.net_revenue)} />
      <SummaryCard label="Avg Booking Value"  value={currency(summary.avg_booking_value)} />
      <SummaryCard label="Paid Bookings"      value={summary.paid_bookings} />
      <SummaryCard label="Total Tax"          value={currency(summary.total_tax)} />
      <SummaryCard label="Service Fees"       value={currency(summary.total_service_fee)} />
      <SummaryCard label="Total Refunds"      value={currency(summary.total_refunds)} />
    </div>
  );

  if (type === 'occupancy') return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SummaryCard label="Occupancy Rate"    value={pct(summary.occupancy_rate)} />
      <SummaryCard label="Total Rooms"       value={summary.total_rooms} />
      <SummaryCard label="Occupied Nights"   value={summary.occupied_nights} />
      <SummaryCard label="Total Room-Nights" value={summary.total_room_nights} />
    </div>
  );

  if (type === 'guests') return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SummaryCard label="New Registrations" value={summary.new_registrations} />
      <SummaryCard label="Repeat Guests"     value={summary.repeat_guests} />
      <SummaryCard label="Registered Bookings" value={summary.registered_bookings} />
      <SummaryCard label="Walk-in Bookings"  value={summary.walk_in_bookings} />
    </div>
  );

  if (type === 'staff') return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <SummaryCard label="Total Check-ins"       value={summary.total_check_ins} />
      <SummaryCard label="Cleaning Tasks Done"   value={summary.total_cleaning_done} />
      <SummaryCard label="Maintenance Tasks Done" value={summary.total_maintenance_done} />
      <SummaryCard label="Period"
        value={summary.period_start}
        sub={`→ ${summary.period_end}`} />
    </div>
  );

  return null;
}