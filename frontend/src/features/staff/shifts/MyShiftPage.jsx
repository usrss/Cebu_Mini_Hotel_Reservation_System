/**
 * src/features/staff/shifts/MyShiftPage.jsx
 */

import { useState, useEffect } from 'react';
import { shiftsApi } from '../services/staffApi';
import { getStoredUser } from '../../../services/api';
import '../Staff.css';

const STATUS_CLASS = {
  scheduled: 'sf-badge-blue',
  in_shift:  'sf-badge-green',
  completed: 'sf-badge-muted',
  missed:    'sf-badge-red',
  cancelled: 'sf-badge-muted',
};

export default function MyShiftPage() {
  const [shifts,  setShifts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const user    = getStoredUser();
  const profile = user?.staff_profile;

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    shiftsApi.list({ staff_id: profile.id })
      .then((data) => setShifts(Array.isArray(data) ? data : (data.results ?? [])))
      .catch((err) => setError(err.response?.data?.detail || err.message))
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const upcoming = shifts.filter((s) => ['scheduled', 'in_shift'].includes(s.status));
  const past     = shifts.filter((s) => !['scheduled', 'in_shift'].includes(s.status));

  return (
    <div className="sf-page">
      <div className="sf-inner" style={{ maxWidth: 720 }}>

        <div className="sf-page-header">
          <p className="sf-eyebrow">My Schedule</p>
          <h1 className="sf-page-title">My Shifts</h1>
          <div className="sf-divider" />
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : (
          <div>
            {/* Upcoming */}
            <p className="sf-eyebrow" style={{ marginBottom: 14 }}>Upcoming ({upcoming.length})</p>
            {upcoming.length === 0 ? (
              <div className="sf-card" style={{ textAlign: 'center', color: 'var(--white-dim)', fontSize: 13, marginBottom: 30 }}>
                No upcoming shifts scheduled.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 30 }}>
                {upcoming.map((s) => <ShiftCard key={s.id} shift={s} />)}
              </div>
            )}

            {/* Past */}
            {past.length > 0 && (
              <>
                <p className="sf-eyebrow" style={{ marginBottom: 14 }}>Past ({past.length})</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {past.map((s) => <ShiftCard key={s.id} shift={s} muted />)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ShiftCard({ shift: s, muted = false }) {
  return (
    <div className={`sf-shift-card${muted ? ' muted' : ''}`}>
      <div>
        <p className="sf-shift-label">{s.label || 'Shift'}</p>
        <p className="sf-shift-time">
          {new Date(s.start_time).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {' → '}
          {new Date(s.end_time).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
        </p>
        {s.notes && <p className="sf-shift-notes">{s.notes}</p>}
      </div>
      <div className="sf-shift-right">
        <span className={`sf-badge ${STATUS_CLASS[s.status] || 'sf-badge-muted'}`}>
          {s.status_display || s.status}
        </span>
        <p className="sf-shift-hours">{s.duration_hours}h</p>
      </div>
    </div>
  );
}