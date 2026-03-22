/**
 * src/features/staff/reporting/ReportIncidentPage.jsx
 *
 * Accessible by: front_desk, housekeeping, security, admin
 * Route: /staff/report-incident
 *
 * Fast incident reporting form.
 * FD/HK can report but CANNOT edit after submission.
 * Security can also create from here (or use /staff/incidents/new).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Shield } from 'lucide-react';
import {
  incidentsApi,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
} from '../services/staffApi';
import '../Staff.css';

const SEVERITY_COLORS = {
  low:      'var(--green)',
  medium:   'var(--amber)',
  high:     'var(--red)',
  critical: '#f97316',
};

const EMPTY = {
  title:           '',
  incident_type:   'other',
  severity:        'low',
  location:        '',
  description:     '',
  involved_guests: '',
};

export default function ReportIncidentPage() {
  const navigate = useNavigate();

  const [form,    setForm]    = useState(EMPTY);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await incidentsApi.create({
        ...form,
        status:   'reported',
        resolved: false,
      });
      setSuccess(true);
      setForm(EMPTY);
    } catch (err) {
      const d = err.response?.data;
      setError(d ? Object.values(d).flat().join(' ') : err.message);
    } finally {
      setBusy(false);
    }
  };

  const severityColor = SEVERITY_COLORS[form.severity] || 'var(--white-dim)';

  return (
    <div className="sf-page">
      <div className="sf-inner" style={{ maxWidth: 600 }}>

        <button className="sf-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Back
        </button>

        <div className="sf-page-header">
          <p className="sf-eyebrow">Security</p>
          <h1 className="sf-page-title">Report an Incident</h1>
          <p className="sf-page-subtitle">
            Submit a security incident. The security team will be notified immediately.
          </p>
          <div className="sf-divider" />
        </div>

        {success && (
          <div className="sf-notice sf-notice-success" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <CheckCircle2 size={16} />
            <div>
              <strong>Incident reported successfully.</strong>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                Security has been notified. You can track it in{' '}
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}
                  onClick={() => navigate('/staff/my-incidents')}
                >
                  My Incidents
                </button>.
              </p>
            </div>
          </div>
        )}

        <div className="sf-card">
          <div className="sf-card-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={13} /> Incident Details
          </div>

          {error && <div className="sf-notice sf-notice-error">{error}</div>}

          <form onSubmit={handleSubmit}>

            {/* Title */}
            <div className="sf-form-group">
              <label className="sf-label sf-label-req">Incident Title</label>
              <input
                className="sf-input"
                value={form.title}
                onChange={set('title')}
                required
                placeholder="e.g. Suspicious person in lobby, Guest altercation Room 312…"
              />
            </div>

            {/* Type + Severity */}
            <div className="sf-form-row">
              <div className="sf-form-group">
                <label className="sf-label sf-label-req">Incident Type</label>
                <select className="sf-select" value={form.incident_type} onChange={set('incident_type')} required>
                  {Object.entries(INCIDENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="sf-form-group">
                <label className="sf-label sf-label-req">Severity</label>
                <select
                  className="sf-select"
                  value={form.severity}
                  onChange={set('severity')}
                  required
                  style={{ borderColor: severityColor }}
                >
                  {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Critical warning */}
            {form.severity === 'critical' && (
              <div className="sf-notice sf-notice-error" style={{ marginBottom: 16, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚠ Critical severity will trigger an emergency alert to Admin and Security.
              </div>
            )}

            {/* Location */}
            <div className="sf-form-group">
              <label className="sf-label">Location</label>
              <input
                className="sf-input"
                value={form.location}
                onChange={set('location')}
                placeholder="e.g. Room 205, Lobby, Pool area, Parking…"
              />
            </div>

            {/* Description */}
            <div className="sf-form-group">
              <label className="sf-label sf-label-req">Description</label>
              <textarea
                className="sf-textarea"
                rows={5}
                value={form.description}
                onChange={set('description')}
                required
                placeholder="Describe exactly what happened, when, who was involved, and any actions already taken…"
              />
            </div>

            {/* Involved guests */}
            <div className="sf-form-group">
              <label className="sf-label">
                Involved Guests{' '}
                <span style={{ color: 'var(--white-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  (optional)
                </span>
              </label>
              <input
                className="sf-input"
                value={form.involved_guests}
                onChange={set('involved_guests')}
                placeholder="Guest names or booking references…"
              />
            </div>

            {/* Read-only notice for FD/HK */}
            <div className="sf-notice sf-notice-amber" style={{ fontSize: 12, marginBottom: 16 }}>
              ℹ Once submitted, this report cannot be edited. Security or Admin will investigate and update the status.
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="sf-btn"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => navigate(-1)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="sf-btn sf-btn-danger"
                style={{ flex: 2, justifyContent: 'center' }}
                disabled={busy}
              >
                {busy ? 'Reporting…' : 'Report Incident'}
              </button>
            </div>
          </form>
        </div>

        {/* Quick link */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            className="sf-btn"
            style={{ fontSize: 10 }}
            onClick={() => navigate('/staff/my-incidents')}
          >
            View My Past Reports →
          </button>
        </div>

      </div>
    </div>
  );
}