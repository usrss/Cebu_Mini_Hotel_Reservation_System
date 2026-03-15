/**
 * src/features/staff/shifts/MyShiftPage.jsx
 *
 * Any staff member can view their own upcoming and past shifts.
 * Read-only.
 */

import { useState, useEffect } from 'react';
import { shiftsApi } from '../services/staffApi';
import { getStoredUser } from '../../../services/api';

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_shift:  'bg-green-100 text-green-700',
  completed: 'bg-slate-100 text-slate-500',
  missed:    'bg-red-100 text-red-600',
  cancelled: 'bg-slate-100 text-slate-400',
};

function fmt(dt) {
  return new Date(dt).toLocaleString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MyShiftPage() {
  const [shifts,  setShifts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const user    = getStoredUser();
  const profile = user?.staff_profile;

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    setLoading(true);
    shiftsApi.list({ staff_id: profile.id })
      .then((data) => setShifts(Array.isArray(data) ? data : (data.results ?? [])))
      .catch((err) => setError(err.response?.data?.detail || err.message))
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const upcoming = shifts.filter((s) => ['scheduled', 'in_shift'].includes(s.status));
  const past     = shifts.filter((s) => !['scheduled', 'in_shift'].includes(s.status));

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-6">My Shifts</h1>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading…</div>
      ) : error ? (
        <div className="py-20 text-center text-red-500">{error}</div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming */}
          <div>
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                No upcoming shifts.
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((s) => (
                  <ShiftCard key={s.id} shift={s} />
                ))}
              </div>
            )}
          </div>

          {/* Past */}
          {past.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
                Past ({past.length})
              </h2>
              <div className="space-y-2">
                {past.map((s) => (
                  <ShiftCard key={s.id} shift={s} muted />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShiftCard({ shift: s, muted = false }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between ${muted ? 'opacity-70' : ''}`}>
      <div>
        <p className="font-medium text-slate-800">{s.label || 'Shift'}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {new Date(s.start_time).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {' → '}
          {new Date(s.end_time).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
        </p>
        {s.notes && <p className="text-xs text-slate-400 mt-1">{s.notes}</p>}
      </div>
      <div className="text-right flex-shrink-0 ml-4">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
          {
            scheduled: 'bg-blue-100 text-blue-700',
            in_shift:  'bg-green-100 text-green-700',
            completed: 'bg-slate-100 text-slate-500',
            missed:    'bg-red-100 text-red-600',
            cancelled: 'bg-slate-100 text-slate-400',
          }[s.status] || 'bg-slate-100 text-slate-600'
        }`}>
          {s.status_display || s.status}
        </span>
        <p className="text-xs text-slate-400 mt-1">{s.duration_hours}h</p>
      </div>
    </div>
  );
}