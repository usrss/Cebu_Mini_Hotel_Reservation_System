/**
 * src/features/staff/incidents/IncidentLogFormPage.jsx
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { incidentsApi, INCIDENT_TYPE_LABELS, SEVERITY_LABELS } from '../services/staffApi';
import '../Staff.css';

const EMPTY = {
  incident_type: 'other', severity: 'low', location: '', description: '',
  involved_guests: '', resolved: false, resolution_notes: '',
};

export default function IncidentLogFormPage() {
  const { pk }    = useParams();
  const navigate  = useNavigate();
  const isEdit    = !!pk;

  const [form,    setForm]    = useState(EMPTY);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(isEdit);

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
  };

  useEffect(() => {
    if (!isEdit) return;
    incidentsApi.detail(pk)
      .then((data) => setForm({
        incident_type: data.incident_type, severity: data.severity,
        location: data.location || '', description: data.description || '',
        involved_guests: data.involved_guests || '',
        resolved: data.resolved || false,
        resolution_notes: data.resolution_notes || '',
      }))
      .catch((err) => setError(err.response?.data?.detail || err.message))
      .finally(() => setLoading(false));
  }, [pk, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      isEdit ? await incidentsApi.update(pk, form) : await incidentsApi.create(form);
      navigate('/staff/incidents');
    } catch (err) {
      const d = err.response?.data;
      setError(d ? Object.values(d).flat().join(' ') : err.message);
    } finally { setBusy(false); }
  };

  if (loading) return <div className="sf-page"><div className="sf-loading"><div className="sf-spinner" /><p>Loading…</p></div></div>;

  return (
    <div className="sf-page">
      <div className="sf-inner" style={{ maxWidth: 620 }}>

        <button className="sf-back" onClick={() => navigate('/staff/incidents')}>
          <ArrowLeft size={14} /> Back to incidents
        </button>

        <div className="sf-page-header">
          <p className="sf-eyebrow">Security</p>
          <h1 className="sf-page-title">{isEdit ? 'Edit Incident' : 'Log New Incident'}</h1>
          <div className="sf-divider" />
        </div>

        <div className="sf-card">
          {error && <div className="sf-notice sf-notice-error">{error}</div>}

          <form onSubmit={handleSubmit}>
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

            {isEdit && (
              <>
                <div className="sf-form-group">
                  <label className="sf-checkbox-row">
                    <input type="checkbox" checked={form.resolved} onChange={set('resolved')} />
                    <span className="sf-checkbox-label">Mark as resolved</span>
                  </label>
                </div>
                {form.resolved && (
                  <div className="sf-form-group">
                    <label className="sf-label">Resolution Notes</label>
                    <textarea className="sf-textarea" rows={3} value={form.resolution_notes} onChange={set('resolution_notes')} />
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" className="sf-btn" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => navigate('/staff/incidents')}>
                Cancel
              </button>
              <button type="submit" className="sf-btn sf-btn-danger" style={{ flex: 1, justifyContent: 'center' }} disabled={busy}>
                {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Incident'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}