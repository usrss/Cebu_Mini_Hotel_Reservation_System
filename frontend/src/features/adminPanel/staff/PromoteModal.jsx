/**
 * PromoteModal.jsx — Change permanent role of a staff member
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { staffApi } from '../../../services/staffApi';

const ROLE_OPTIONS = [
  { value:'manager',      label:'Manager' },
  { value:'receptionist', label:'Receptionist' },
  { value:'front_desk',   label:'Front Desk' },
  { value:'housekeeping', label:'Housekeeping' },
  { value:'maintenance',  label:'Maintenance' },
  { value:'security',     label:'Security' },
];

const ROLE_LABELS = { manager:'Manager', receptionist:'Receptionist', front_desk:'Front Desk', housekeeping:'Housekeeping', maintenance:'Maintenance', security:'Security', admin:'Admin' };

export default function PromoteModal({ staff, onClose, onSaved }) {
  const [role,       setRole]       = useState(staff.role ?? 'receptionist');
  const [note,       setNote]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  const handleSubmit = async () => {
    if (role === staff.role) { setError('Please select a different role.'); return; }
    setSubmitting(true); setError('');
    try {
      await staffApi.promote(staff.id, { role, note });
      setSuccess(`Role changed to ${ROLE_LABELS[role]}.`);
      setTimeout(onSaved, 800);
    } catch (err) {
      setError(err.response?.data?.role?.[0] ?? err.response?.data?.detail ?? 'Failed to change role.');
    } finally { setSubmitting(false); }
  };

  const name = staff.user?.full_name ?? staff.user?.email;

  return (
    <div className="sm-overlay">
      <div className="sm-modal">
        <div className="sm-modal-header">
          <h2 className="sm-modal-title">Change Role</h2>
          <button className="sm-modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="sm-modal-body">
          {error   && <div className="sm-alert sm-alert--error">{error}</div>}
          {success && <div className="sm-alert sm-alert--success">✓ {success}</div>}

          <p style={{ color:'var(--white-dim)', fontSize:13, marginBottom:20 }}>
            Changing permanent role for <strong style={{ color:'var(--white)' }}>{name}</strong>.
            Current role: <strong style={{ color:'var(--gold)' }}>{ROLE_LABELS[staff.role] ?? staff.role}</strong>
          </p>

          <div className="sm-field">
            <label className="sm-label">New Role <span>*</span></label>
            <select className="sm-select-input" value={role} onChange={e => setRole(e.target.value)}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="sm-field">
            <label className="sm-label">Reason / Note</label>
            <textarea className="sm-textarea" value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Optional note for audit trail…" />
          </div>
        </div>
        <div className="sm-modal-footer">
          <button className="sm-btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="sm-btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting && <span className="sm-spinner" style={{ width:14, height:14, borderWidth:2 }} />}
            Confirm Change
          </button>
        </div>
      </div>
    </div>
  );
}