/**
 * ShiftFormModal.jsx — Create or edit a shift
 * Body: { staff (id), label, start_time, end_time, notes }
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { staffApi } from '../../staff/services/staffApi';

function fmt(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ShiftFormModal({ shift, staffList, defaultDate, onClose, onSaved }) {
  const isEdit = !!shift;

  const [form, setForm] = useState({
    staff:      '',
    label:      '',
    start_time: defaultDate ? fmt(defaultDate) : '',
    end_time:   '',
    notes:      '',
  });
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState('');

  useEffect(() => {
    if (shift) {
      setForm({
        staff:      shift.staff ?? '',
        label:      shift.label ?? '',
        start_time: fmt(shift.start_time),
        end_time:   fmt(shift.end_time),
        notes:      shift.notes ?? '',
      });
    }
  }, [shift]);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); };

  const handleSubmit = async () => {
    const errs = {};
    if (!form.staff)      errs.staff      = 'Please select a staff member.';
    if (!form.start_time) errs.start_time = 'Start time is required.';
    if (!form.end_time)   errs.end_time   = 'End time is required.';
    if (form.start_time && form.end_time && new Date(form.end_time) <= new Date(form.start_time))
      errs.end_time = 'End time must be after start time.';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const payload = {
        staff:      Number(form.staff),
        label:      form.label || undefined,
        start_time: new Date(form.start_time).toISOString(),
        end_time:   new Date(form.end_time).toISOString(),
        notes:      form.notes || undefined,
      };
      if (isEdit) await staffApi.updateShift(shift.id, payload);
      else        await staffApi.createShift(payload);
      setSuccess(isEdit ? 'Shift updated.' : 'Shift created.');
      setTimeout(onSaved, 700);
    } catch (err) {
      const data = err.response?.data ?? {};
      if (typeof data === 'object') setErrors(data);
      else setErrors({ non_field_errors: 'An error occurred.' });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="sm-overlay">
      <div className="sm-modal">
        <div className="sm-modal-header">
          <h2 className="sm-modal-title">{isEdit ? 'Edit Shift' : 'Create Shift'}</h2>
          <button className="sm-modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="sm-modal-body">
          {success && <div className="sm-alert sm-alert--success">✓ {success}</div>}
          {errors.non_field_errors && <div className="sm-alert sm-alert--error">{errors.non_field_errors}</div>}

          <div className="sm-field">
            <label className="sm-label">Staff Member <span>*</span></label>
            <select className={`sm-select-input${errors.staff?' sm-select-input--error':''}`}
              value={form.staff} onChange={e => set('staff', e.target.value)}>
              <option value="">Select staff…</option>
              {staffList.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>
                  {s.user?.full_name ?? s.user?.email} — {s.role?.replace(/_/g,' ')}
                </option>
              ))}
            </select>
            {errors.staff && <span className="sm-error-msg">{errors.staff}</span>}
          </div>

          <div className="sm-field">
            <label className="sm-label">Shift Label</label>
            <input className="sm-input" value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder="e.g. Morning Shift, Evening Duty…" />
          </div>

          <div className="sm-grid-2">
            <div className="sm-field">
              <label className="sm-label">Start Time <span>*</span></label>
              <input className={`sm-input${errors.start_time?' sm-input--error':''}`}
                type="datetime-local" value={form.start_time}
                onChange={e => set('start_time', e.target.value)} />
              {errors.start_time && <span className="sm-error-msg">{errors.start_time}</span>}
            </div>
            <div className="sm-field">
              <label className="sm-label">End Time <span>*</span></label>
              <input className={`sm-input${errors.end_time?' sm-input--error':''}`}
                type="datetime-local" value={form.end_time}
                onChange={e => set('end_time', e.target.value)} />
              {errors.end_time && <span className="sm-error-msg">{errors.end_time}</span>}
            </div>
          </div>

          <div className="sm-field">
            <label className="sm-label">Notes</label>
            <textarea className="sm-textarea" value={form.notes}
              onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" />
          </div>
        </div>
        <div className="sm-modal-footer">
          <button className="sm-btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="sm-btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting && <span className="sm-spinner" style={{ width:14, height:14, borderWidth:2 }} />}
            {isEdit ? 'Save Changes' : 'Create Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}