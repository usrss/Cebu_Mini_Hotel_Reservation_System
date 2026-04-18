/**
 * ShiftCalendar.jsx — Weekly + Monthly shift scheduler
 * Click day/cell to create shift. Click block to edit. Right-click to delete.
 * Color-coded by staff role. No external calendar library.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, AlertTriangle } from 'lucide-react';
import { staffApi } from '../../staff/services/staffApi';
import ShiftFormModal from './ShiftFormModal';

const ROLE_COLORS = {
  admin:'#01000D', manager:'#3B5BDB', receptionist:'#7C3AED',
  front_desk:'#0D9488', housekeeping:'#D97706',
  maintenance:'#B45309', security:'#DC2626',
};
const ROLE_LABELS = {
  admin:'Admin', manager:'Manager', receptionist:'Receptionist',
  front_desk:'Front Desk', housekeeping:'Housekeeping',
  maintenance:'Maintenance', security:'Security',
};

const DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const HOURS = Array.from({ length:24 }, (_, i) => {
  const h = i % 12 || 12;
  return `${h}:00 ${i < 12 ? 'AM' : 'PM'}`;
});

const isSameDay = (a, b) =>
  a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();

const addDays = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate()+n); return dt; };
const startOfWeek = (d) => { const dt = new Date(d); dt.setDate(dt.getDate()-dt.getDay()); dt.setHours(0,0,0,0); return dt; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

export default function ShiftCalendar({ staff }) {
  const [view,        setView]        = useState('week');
  const [cursor,      setCursor]      = useState(new Date());
  const [shifts,      setShifts]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [roleFilter,  setRoleFilter]  = useState('');
  const [formOpen,    setFormOpen]    = useState(false);
  const [editShift,   setEditShift]   = useState(null);
  const [defaultDate, setDefaultDate] = useState(null);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await staffApi.shifts();
      setShifts(data.results ?? data);
    } catch { setShifts([]); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  const handleDelete = async (s) => {
    if (s.status === 'in_shift') {
      alert('Cannot delete a shift that is currently in progress.');
      return;
    }
    if (s.status === 'completed') {
      alert('Completed shifts cannot be deleted as they are part of attendance records.');
      return;
    }
    if (!['scheduled', 'cancelled'].includes(s.status)) {
      alert('Only scheduled or cancelled shifts can be deleted.');
      return;
    }
    if (!window.confirm(`Delete "${s.label || 'this shift'}"?`)) return;
    try {
      await staffApi.deleteShift(s.id);
      await loadShifts();
    } catch {
      alert('Failed to delete.');
    }
  };

  const filtered = roleFilter
    ? shifts.filter(s => {
        const m = staff.find(m => m.id === (s.staff ?? s.staff_id));
        return (m?.effective_role ?? m?.role) === roleFilter;
      })
    : shifts;

  const shiftsForDay = (day) => filtered.filter(s => isSameDay(new Date(s.start_time), day));

  const shiftColor = (s) => {
    const m    = staff.find(m => m.id === (s.staff ?? s.staff_id));
    const role = m?.effective_role ?? m?.role ?? 'admin';
    return ROLE_COLORS[role] ?? '#01000D';
  };

  const shiftTopPct = (s) => {
    const d = new Date(s.start_time);
    return ((d.getHours() + d.getMinutes()/60) / 24) * 100;
  };
  const shiftHeightPct = (s) => {
    const hours = Math.max((new Date(s.end_time) - new Date(s.start_time)) / 3_600_000, 0.5);
    return (hours / 24) * 100;
  };

  const today     = new Date();
  const weekStart = startOfWeek(cursor);
  const weekDays  = Array.from({ length:7 }, (_, i) => addDays(weekStart, i));

  // Month cells
  const monthStart  = startOfMonth(cursor);
  const monthOffset = monthStart.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0).getDate();
  const calCells    = [
    ...Array(monthOffset).fill(null),
    ...Array.from({ length:daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i+1)),
  ];

  // Unassigned critical roles today
  const todayShifts  = filtered.filter(s => isSameDay(new Date(s.start_time), today));
  const coveredRoles = new Set(todayShifts.map(s => { const m = staff.find(m => m.id===(s.staff??s.staff_id)); return m?.effective_role??m?.role; }));
  const uncovered    = ['front_desk','receptionist'].filter(r => !coveredRoles.has(r));

  const calTitle = view === 'week'
    ? `${weekDays[0].toLocaleDateString('en-PH',{month:'short',day:'numeric'})} – ${weekDays[6].toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}`
    : cursor.toLocaleDateString('en-PH',{month:'long',year:'numeric'});

  const openCreate = (date) => { setEditShift(null); setDefaultDate(date); setFormOpen(true); };
  const openEdit   = (s)    => { setEditShift(s);    setDefaultDate(null); setFormOpen(true); };

  return (
    <>
      {uncovered.length > 0 && (
        <div className="sm-alert sm-alert--warning" style={{ marginBottom:14 }}>
          <AlertTriangle size={15} />
          <span>No shift assigned today for: <strong>{uncovered.map(r => ROLE_LABELS[r]).join(', ')}</strong>.</span>
        </div>
      )}

      <div className="sm-cal-wrap">
        {/* Header */}
        <div className="sm-cal-header">
          <div className="sm-cal-nav">
            <button className="sm-cal-nav-btn"
              onClick={() => view==='week' ? setCursor(addDays(cursor,-7)) : setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}>
              <ChevronLeft size={14} />
            </button>
            <span className="sm-cal-title">{calTitle}</span>
            <button className="sm-cal-nav-btn"
              onClick={() => view==='week' ? setCursor(addDays(cursor,7)) : setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}>
              <ChevronRight size={14} />
            </button>
            <button className="sm-btn-secondary" style={{ padding:'5px 12px', fontSize:11 }}
              onClick={() => setCursor(new Date())}>Today</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <select style={{ background:'#F2F3F7', border:'none', borderRadius:8, color:'#01000D', fontFamily:"'DM Sans',sans-serif", fontSize:11, padding:'6px 10px', outline:'none', boxShadow:'0 1px 2px rgba(1,0,13,0.06)' }}
              value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              {Object.entries(ROLE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="sm-cal-view-btns">
              {['week','month'].map(v => (
                <button key={v} className={`sm-cal-view-btn${view===v?' sm-cal-view-btn--active':''}`}
                  onClick={() => setView(v)}>
                  {v.charAt(0).toUpperCase()+v.slice(1)}
                </button>
              ))}
            </div>
            <button className="sm-btn-primary" style={{ padding:'7px 14px', fontSize:11 }}
              onClick={() => openCreate(new Date())}>
              <Plus size={13} /> Add Shift
            </button>
          </div>
        </div>

        {/* Role legend */}
        <div style={{ display:'flex', gap:12, padding:'8px 16px', borderBottom:'1px solid #E4E6ED', flexWrap:'wrap' }}>
          {Object.entries(ROLE_COLORS).map(([role, color]) => (
            <div key={role} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'#52515E' }}>
              <span style={{ width:10, height:10, borderRadius:2, background:color, flexShrink:0 }} />
              {ROLE_LABELS[role]}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="sm-loading" style={{ padding:40 }}><div className="sm-spinner" /><span>Loading shifts…</span></div>
        ) : view === 'week' ? (

          /* ── WEEK ── */
          <div style={{ overflowX:'auto' }}>
            <div style={{ display:'grid', gridTemplateColumns:'70px repeat(7, 1fr)', minWidth:600 }}>
              {/* Header row */}
              <div style={{ borderRight:'1px solid #F2F3F7', borderBottom:'1px solid #F2F3F7' }} />
              {weekDays.map((d, i) => (
                <div key={i} className="sm-week-day-header">
                  <div className="sm-week-day-name">{DAYS[d.getDay()]}</div>
                  <div className={`sm-week-day-date${isSameDay(d,today)?' sm-week-day-date--today':''}`}>{d.getDate()}</div>
                </div>
              ))}

              {/* Time column */}
              <div>
                {HOURS.map((h, i) => (
                  <div key={i} className="sm-week-time-slot">{h}</div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day, di) => {
                const dayShifts = shiftsForDay(day);
                return (
                  <div key={di} style={{ position:'relative', borderRight:'1px solid rgba(1,0,13,0.04)' }}>
                    {HOURS.map((_, hi) => (
                      <div key={hi} className="sm-week-cell"
                        onClick={() => { const dt=new Date(day); dt.setHours(hi,0,0,0); openCreate(dt); }} />
                    ))}
                    {dayShifts.map((s, si) => {
                      const color = shiftColor(s);
                      const start = new Date(s.start_time), end = new Date(s.end_time);
                      const timeStr = `${start.getHours()}:${String(start.getMinutes()).padStart(2,'0')}–${end.getHours()}:${String(end.getMinutes()).padStart(2,'0')}`;
                      return (
                        <div key={si} className="sm-shift-block"
                          style={{ top:`${shiftTopPct(s)}%`, height:`${Math.max(shiftHeightPct(s),2.5)}%`, background:color, opacity:s.status==='missed'?0.45:0.88 }}
                          onClick={e => { e.stopPropagation(); openEdit(s); }}
                          onContextMenu={e => { e.preventDefault(); handleDelete(s); }}
                          title={`${s.label||'Shift'} · ${s.staff_name}\n${timeStr}\nStatus: ${s.status}\nRight-click to delete`}>
                          <div className="sm-shift-block-name">{s.staff_name ?? 'Staff'}</div>
                          <div className="sm-shift-block-time">{timeStr}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

        ) : (

          /* ── MONTH ── */
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderTop:'1px solid #E4E6ED' }}>
              {DAYS.map(d => <div key={d} className="sm-month-day-header">{d}</div>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
              {calCells.map((day, idx) => {
                if (!day) return <div key={idx} className="sm-month-cell sm-month-cell--other" />;
                const ds = shiftsForDay(day);
                const isToday = isSameDay(day, today);
                return (
                  <div key={idx} className={`sm-month-cell${isToday?' sm-month-cell--today':''}`}
                    onClick={() => openCreate(day)}>
                    <div className={`sm-month-date${isToday?' sm-month-date--today':''}`}>{day.getDate()}</div>
                    {ds.slice(0,3).map((s, si) => (
                      <div key={si} className="sm-month-shift-pill"
                        style={{ background:shiftColor(s), opacity:s.status==='missed'?0.45:0.88 }}
                        onClick={e => { e.stopPropagation(); openEdit(s); }}
                        title={`${s.label||'Shift'} · ${s.staff_name}`}>
                        {s.label || s.staff_name || 'Shift'}
                      </div>
                    ))}
                    {ds.length > 3 && <div className="sm-month-more">+{ds.length-3} more</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Status legend */}
      <div style={{ display:'flex', gap:10, marginTop:10, flexWrap:'wrap' }}>
        {[['scheduled','Scheduled'],['in_shift','In Shift'],['completed','Completed'],['missed','Missed'],['cancelled','Cancelled']].map(([s,l]) => (
          <span key={s} className={`sm-badge sm-badge--${s}`}>{l}</span>
        ))}
      </div>

      {formOpen && (
        <ShiftFormModal
          shift={editShift}
          staffList={staff}
          defaultDate={defaultDate}
          onClose={() => { setFormOpen(false); setEditShift(null); }}
          onSaved={() => { setFormOpen(false); setEditShift(null); loadShifts(); }}
        />
      )}
    </>
  );
}