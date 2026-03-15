/**
 * DeactivateModal.jsx — Confirm staff deactivation with reason
 */
import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { staffApi } from '../../../services/staffApi';

export default function DeactivateModal({ staff, onClose, onSaved }) {
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const handleSubmit = async () => {
    setSubmitting(true); setError('');
    try {
      await staffApi.deactivate(staff.id, { reason });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to deactivate.');
      setSubmitting(false);
    }
  };

  const name = staff.user?.full_name ?? staff.user?.email;

  return (
    <div className="sm-overlay">
      <div className="sm-modal">
        <div className="sm-modal-header">
          <h2 className="sm-modal-title">Deactivate Staff</h2>
          <button className="sm-modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-alert sm-alert--error">{error}</div>}
          <div className="sm-alert sm-alert--warning" style={{ marginBottom:20 }}>
            <AlertTriangle size={16} />
            <span>Deactivating <strong>{name}</strong> will prevent them from logging in.</span>
          </div>
          <div className="sm-field">
            <label className="sm-label">Reason for Deactivation</label>
            <textarea className="sm-textarea" value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Optional — e.g. resigned, on leave…" />
          </div>
        </div>
        <div className="sm-modal-footer">
          <button className="sm-btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="sm-btn-primary"
            style={{ background:'rgba(248,113,113,0.1)', borderColor:'rgba(248,113,113,0.4)', color:'#F87171' }}
            onClick={handleSubmit} disabled={submitting}>
            {submitting && <span className="sm-spinner" style={{ width:14, height:14, borderWidth:2 }} />}
            Deactivate Account
          </button>
        </div>
      </div>
    </div>
  );
}