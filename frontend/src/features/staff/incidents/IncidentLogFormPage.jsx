/**
 * IncidentLogFormPage.jsx
 *
 * Security staff: create new incident (/staff/incidents/new)
 *              or update/resolve assigned incident (/staff/incidents/:pk/edit)
 *
 * The "resolved" checkbox and "resolution notes" are shown in EDIT mode always
 * (not just if resolved), so security can mark as resolved on first edit.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { incidentsApi, INCIDENT_TYPE_LABELS, SEVERITY_LABELS, INCIDENT_STATUS_LABELS } from '../services/staffApi';
import '../Staff.css';

const EMPTY = {
  incident_type: 'other', severity: 'low', location: '', description: '',
  involved_guests: '', status: 'reported', resolved: false, resolution_notes: '',
};

export default function IncidentLogFormPage() {
  const { pk }   = useParams();
  const navigate = useNavigate();
  const isEdit   = !!pk;

  const [form,    setForm]    = useState(EMPTY);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [success, setSuccess] = useState(false);

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [field]: val }));
  };

  useEffect(() => {
    if (!isEdit) return;
    incidentsApi.detail(pk)
      .then(data => setForm({
        incident_type:    data.incident_type,
        severity:         data.severity,
        location:         data.location || '',
        description:      data.description || '',
        involved_guests:  data.involved_guests || '',
        status:           data.status || 'reported',
        resolved:         data.resolved || false,
        resolution_notes: data.resolution_notes || '',
      }))
      .catch(err => setError(err.response?.data?.detail || err.message))
      .finally(() => setLoading(false));
  }, [pk, isEdit]);

  // When status switches to resolved, auto-check the resolved flag
  const handleStatusChange = (e) => {
    const newStatus = e.target.value;
    setForm(f => ({
      ...f,
      status:   newStatus,
      resolved: newStatus === 'resolved',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload = { ...form };
      // Ensure sync between resolved boolean and status
      if (payload.status === 'resolved') payload.resolved = true;
      else payload.resolved = false;

      if (isEdit) {
        await incidentsApi.update(pk, payload);
        setSuccess(true);
        setTimeout(() => navigate('/staff/incidents'), 1200);
      } else {
        await incidentsApi.create(payload);
        navigate('/staff/incidents');
      }
    } catch (err) {
      const d = err.response?.data;
      setError(d ? Object.values(d).flat().join(' ') : err.message);
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="sf-page">
        <div className="sf-loading"><div className="sf-spinner" /><p>Loading…</p></div>
      </div>
    );
  }

  return (
    <div className="sf-page">
      <div className="sf-inner" style={{ maxWidth: 620 }}>

        <button className="sf-back" onClick={() => navigate('/staff/incidents')}>
          <ArrowLeft size={14} /> Back to incidents
        </button>

        <div className="sf-page-header">
          <p className="sf-eyebrow">Security</p>
          <h1 className="sf-page-title">{isEdit ? 'Update Incident' : 'Log New Incident'}</h1>
          {isEdit && (
            <p className="sf-page-subtitle">
              Update the incident status and add resolution notes if the incident has been resolved.
            </p>
          )}
          <div className="sf-divider" />
        </div>

        {success && (
          <div className="sf-notice sf-notice-success" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CheckCircle2 size={16} />
            <strong>Incident updated successfully.</strong> Redirecting…
          </div>
        )}

        <div className="sf-card">
          {error && <div className="sf-notice sf-notice-error">{error}</div>}

          <form onSubmit={handleSubmit}>

            {/* Type + Severity */}
            <div className="sf-form-row">
              <div className="sf-form-group">
                <label className="sf-label sf-label-req">Incident Type</label>
                <select className="sf-select" value={form.incident_type} onChange={set('incident_type')} required>
                  {Object.entries(INCIDENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="sf-form-group">
                <label className="sf-label sf-label-req">Severity</label>
                <select className="sf-select" value={form.severity} onChange={set('severity')} required>
                  {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div className="sf-form-group">
              <label className="sf-label">Location</label>
              <input className="sf-input" value={form.location} onChange={set('location')} placeholder="e.g. Room 205, Lobby, Parking…" />
            </div>

            <div className="sf-form-group">
              <label className="sf-label sf-label-req">Description</label>
              <textarea className="sf-textarea" rows={4} value={form.description} onChange={set('description')} required />
            </div>

            <div className="sf-form-group">
              <label className="sf-label">Involved Guests</label>
              <input className="sf-input" value={form.involved_guests} onChange={set('involved_guests')} placeholder="Names or booking references…" />
            </div>

            {/* Status — shown in edit mode so security can move to resolved */}
            {isEdit && (
              <>
                <div className="sf-form-group">
                  <label className="sf-label sf-label-req">Update Status</label>
                  <select className="sf-select" value={form.status} onChange={handleStatusChange} required
                    style={{ borderColor: form.status === 'resolved' ? 'var(--sf-green)' : form.status === 'under_investigation' ? 'var(--sf-amber)' : undefined }}>
                    {Object.entries(INCIDENT_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Resolution notes — required when marking as resolved */}
                {form.status === 'resolved' && (
                  <div className="sf-form-group">
                    <label className="sf-label sf-label-req">Resolution Notes</label>
                    <textarea
                      className="sf-textarea"
                      rows={3}
                      value={form.resolution_notes}
                      onChange={set('resolution_notes')}
                      required
                      placeholder="Describe how the incident was resolved, actions taken…"
                    />
                    <p style={{ fontSize: 11, color: 'var(--sf-text-muted)', marginTop: 4 }}>
                      ℹ The manager will be notified once this incident is marked as resolved.
                    </p>
                  </div>
                )}

                {/* Optional notes for under_investigation */}
                {form.status === 'under_investigation' && (
                  <div className="sf-form-group">
                    <label className="sf-label">
                      Investigation Notes
                      <span style={{ color: 'var(--sf-text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>(optional)</span>
                    </label>
                    <textarea
                      className="sf-textarea"
                      rows={2}
                      value={form.resolution_notes}
                      onChange={set('resolution_notes')}
                      placeholder="Notes on investigation progress…"
                    />
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" className="sf-btn" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => navigate('/staff/incidents')}>
                Cancel
              </button>
              <button type="submit" className={`sf-btn ${isEdit && form.status === 'resolved' ? 'sf-btn-primary' : 'sf-btn-primary'}`}
                style={{ flex: 1, justifyContent: 'center' }} disabled={busy}>
                {busy ? 'Saving…' : isEdit
                  ? (form.status === 'resolved' ? '✓ Mark as Resolved' : 'Save Update')
                  : 'Log Incident'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}