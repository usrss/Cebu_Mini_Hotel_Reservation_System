/**
 * src/features/staff/reporting/ReportMaintenancePage.jsx
 *
 * Accessible by: front_desk, housekeeping, admin, manager
 * Route: /staff/report-maintenance
 *
 * Simple, fast form for reporting a maintenance issue.
 * This creates a MaintenanceRequest (NOT a MaintenanceTask directly).
 * Admin/Manager review and convert it.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Wrench } from 'lucide-react';
import { maintenanceRequestsApi } from '../services/staffApi';
import { getRooms } from '../../../services/roomService';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

export default function ReportMaintenancePage() {
  const navigate = useNavigate();
  const perms    = useStaffRole();

  const [rooms,   setRooms]   = useState([]);
  const [form,    setForm]    = useState({ title: '', description: '', room: '' });
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(false);

 useEffect(() => {
    getRooms({ is_active: true })
      .then((res) => {
        const data = res.data;
        setRooms(Array.isArray(data) ? data : (data.results ?? []));
      })
      .catch((err) => {
        console.error('Failed to fetch rooms:', err);
      });
  }, []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = { title: form.title, description: form.description };
      if (form.room) payload.room = Number(form.room);
      await maintenanceRequestsApi.create(payload);
      setSuccess(true);
      setForm({ title: '', description: '', room: '' });
    } catch (err) {
      const d = err.response?.data;
      setError(d ? Object.values(d).flat().join(' ') : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sf-page">
      <div className="sf-inner" style={{ maxWidth: 560 }}>

        <button className="sf-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Back
        </button>

        <div className="sf-page-header">
          <p className="sf-eyebrow">Maintenance</p>
          <h1 className="sf-page-title">Report an Issue</h1>
          <p className="sf-page-subtitle">
            Submit a maintenance issue for review. Admin or Manager will assign it to the maintenance team.
          </p>
          <div className="sf-divider" />
        </div>

        {success && (
          <div className="sf-notice sf-notice-success" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <CheckCircle2 size={16} />
            <div>
              <strong>Request submitted successfully.</strong>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                Your request is under review. You can track it in{' '}
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}
                  onClick={() => navigate('/staff/my-maintenance-requests')}
                >
                  My Requests
                </button>.
              </p>
            </div>
          </div>
        )}

        <div className="sf-card">
          <div className="sf-card-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wrench size={13} /> Issue Details
          </div>

          {error && <div className="sf-notice sf-notice-error">{error}</div>}

          <form onSubmit={handleSubmit}>

            {/* Title */}
            <div className="sf-form-group">
              <label className="sf-label sf-label-req">Issue Title</label>
              <input
                className="sf-input"
                value={form.title}
                onChange={set('title')}
                required
                placeholder="e.g. Broken air conditioner, Leaking faucet…"
              />
            </div>

            {/* Room */}
            <div className="sf-form-group">
              <label className="sf-label">
                Room{' '}
                <span style={{ color: 'var(--white-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  (optional)
                </span>
              </label>
              <select className="sf-select" value={form.room} onChange={set('room')}>
                <option value="">— Not room-specific (common area, lobby, etc.) —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.room_number}
                    {r.room_type_display ? ` — ${r.room_type_display}` : ''}
                    {r.status !== 'available' ? ` (${r.status_display || r.status})` : ''}
                  </option>
                ))}
              </select>
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
                placeholder="Describe the issue in detail. Include when you noticed it, how severe it is, and any relevant observations…"
              />
            </div>

            {/* Info note */}
            <div className="sf-notice sf-notice-amber" style={{ fontSize: 12, marginBottom: 16 }}>
              ℹ Your request will be reviewed by Admin or Management before a maintenance task is created.
              You will be able to track its status in <strong>My Requests</strong>.
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
                className="sf-btn sf-btn-primary"
                style={{ flex: 2, justifyContent: 'center' }}
                disabled={busy}
              >
                {busy ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>

        {/* Quick link */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            className="sf-btn"
            style={{ fontSize: 10 }}
            onClick={() => navigate('/staff/my-maintenance-requests')}
          >
            View My Past Requests →
          </button>
        </div>

      </div>
    </div>
  );
}