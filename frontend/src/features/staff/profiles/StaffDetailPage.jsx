/**
 * src/features/staff/profiles/StaffDetailPage.jsx
 *
 * RBAC:
 *  Admin:   full access — edit, promote, temp role, deactivate/reactivate
 *  Manager: read-only — can view profile, shifts, activity. No modification controls.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { staffMembersApi, ROLE_LABELS, ONLINE_STATUS_LABELS } from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

function roleBadgeClass(role) {
  const map = {
    admin:        'sf-badge-gold',
    manager:      'sf-badge-blue',
    receptionist: 'sf-badge-amber',
    front_desk:   'sf-badge-amber',
    housekeeping: 'sf-badge-green',
    maintenance:  'sf-badge-muted',
    security:     'sf-badge-red',
  };
  return map[role] || 'sf-badge-muted';
}

function Section({ title, children }) {
  return (
    <div className="sf-card">
      <div className="sf-card-label">{title}</div>
      {children}
    </div>
  );
}

export default function StaffDetailPage() {
  const { pk }   = useParams();
  const navigate = useNavigate();
  const perms    = useStaffRole();

  const [profile,     setProfile]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  // Admin-only form state
  const [promoteRole, setPromoteRole] = useState('');
  const [promoteNote, setPromoteNote] = useState('');
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [tempRole,    setTempRole]    = useState('');
  const [tempExpires, setTempExpires] = useState('');
  const [tempBusy,    setTempBusy]    = useState(false);
  const [editMode,    setEditMode]    = useState(false);
  const [editData,    setEditData]    = useState({});
  const [editBusy,    setEditBusy]    = useState(false);
  const [actionBusy,  setActionBusy]  = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await staffMembersApi.detail(pk);
      setProfile(data);
      setEditData({
        first_name:  data.user?.full_name?.split(' ')[0] || '',
        last_name:   data.user?.full_name?.split(' ').slice(1).join(' ') || '',
        phone:       data.phone || '',
        employee_id: data.employee_id || '',
        notes:       data.notes || '',
      });
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [pk]);

  const handlePromote = async (e) => {
    e.preventDefault(); setPromoteBusy(true);
    try {
      await staffMembersApi.promote(pk, { role: promoteRole, note: promoteNote });
      setPromoteRole(''); setPromoteNote(''); load();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setPromoteBusy(false); }
  };

  const handleAssignTempRole = async (e) => {
    e.preventDefault(); setTempBusy(true);
    try {
      await staffMembersApi.assignTempRole(pk, { temp_role: tempRole, expires_at: tempExpires });
      setTempRole(''); setTempExpires(''); load();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setTempBusy(false); }
  };

  const handleRemoveTempRole = async () => {
    if (!window.confirm('Remove temp role?')) return;
    setTempBusy(true);
    try { await staffMembersApi.removeTempRole(pk); load(); }
    catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setTempBusy(false); }
  };

  const handleToggleActive = async () => {
    const action = profile.is_active ? 'Deactivate' : 'Reactivate';
    if (!window.confirm(`${action} this staff member?`)) return;
    setActionBusy(true);
    try {
      profile.is_active
        ? await staffMembersApi.deactivate(pk, { reason: 'Admin action.' })
        : await staffMembersApi.reactivate(pk);
      load();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setActionBusy(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setEditBusy(true);
    try { await staffMembersApi.update(pk, editData); setEditMode(false); load(); }
    catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setEditBusy(false); }
  };

  if (loading) return <div className="sf-page"><div className="sf-loading"><div className="sf-spinner" /><p>Loading profile…</p></div></div>;
  if (error)   return <div className="sf-page"><div className="sf-error"><p>{error}</p></div></div>;
  if (!profile) return null;

  const allRoles  = Object.entries(ROLE_LABELS);
  const dotClass  = { online: 'sf-dot-online', offline: 'sf-dot-offline', idle: 'sf-dot-idle' }[profile.online_status] || 'sf-dot-offline';

  return (
    <div className="sf-page">
      <div className="sf-inner">

        <button className="sf-back" onClick={() => navigate('/staff/members')}>
          <ArrowLeft size={14} /> Back to staff list
        </button>

        {/* Profile header */}
        <div className="sf-detail-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div className="sf-detail-avatar-wrap">
              <div className="sf-avatar">
                {(profile.user?.full_name || profile.user?.email || '?')[0].toUpperCase()}
              </div>
              <span className={`sf-avatar-dot ${dotClass}`} />
            </div>
            <div className="sf-detail-info">
              <h2 className="sf-detail-name">{profile.user?.full_name || profile.user?.email}</h2>
              <p className="sf-detail-email">{profile.user?.email}</p>
              <div className="sf-detail-badges">
                <span className={`sf-badge ${roleBadgeClass(profile.effective_role)}`}>
                  {ROLE_LABELS[profile.effective_role] || profile.effective_role}
                </span>
                {profile.temp_role && (
                  <span className="sf-badge sf-badge-amber">
                    temp: {ROLE_LABELS[profile.temp_role]}
                  </span>
                )}
                <span className={`sf-badge ${profile.is_active ? 'sf-badge-green' : 'sf-badge-red'}`}>
                  {profile.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className={`sf-badge ${
                  profile.online_status === 'online' ? 'sf-badge-green'
                  : profile.online_status === 'idle' ? 'sf-badge-amber'
                  : 'sf-badge-muted'
                }`}>
                  {ONLINE_STATUS_LABELS[profile.online_status]}
                </span>
              </div>
            </div>
          </div>

          {/* Admin-only action buttons */}
          <div className="sf-detail-actions">
            {perms.canEditStaff && (
              <button className="sf-btn" onClick={() => setEditMode(!editMode)}>
                {editMode ? 'Cancel Edit' : 'Edit Profile'}
              </button>
            )}
            {perms.canDeactivateStaff && (
              <button
                className={`sf-btn ${profile.is_active ? 'sf-btn-danger' : 'sf-btn-success'}`}
                onClick={handleToggleActive}
                disabled={actionBusy}
              >
                {actionBusy ? '…' : profile.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            )}
          </div>
        </div>

        <div className="sf-detail-grid">

          {/* Profile info — edit form for admin, read-only for manager */}
          <Section title="Profile Info">
            {editMode && perms.canEditStaff ? (
              <form onSubmit={handleEdit}>
                {[
                  ['first_name', 'First Name'],
                  ['last_name',  'Last Name'],
                  ['phone',      'Phone'],
                  ['employee_id','Employee ID'],
                ].map(([f, l]) => (
                  <div className="sf-form-group" key={f}>
                    <label className="sf-label">{l}</label>
                    <input className="sf-input" value={editData[f] || ''}
                      onChange={(e) => setEditData({ ...editData, [f]: e.target.value })} />
                  </div>
                ))}
                <div className="sf-form-group">
                  <label className="sf-label">Notes</label>
                  <textarea className="sf-textarea" rows={3} value={editData.notes || ''}
                    onChange={(e) => setEditData({ ...editData, notes: e.target.value })} />
                </div>
                <button type="submit" className="sf-btn sf-btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }} disabled={editBusy}>
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
              </form>
            ) : (
              <dl className="sf-fields">
                {[
                  ['Employee ID', profile.employee_id],
                  ['Phone',       profile.phone],
                  ['Last Seen',   profile.last_seen_at ? new Date(profile.last_seen_at).toLocaleString() : null],
                  ['Joined',      new Date(profile.created_at).toLocaleDateString()],
                  ['Current Task',profile.current_task],
                ].map(([label, value]) => (
                  <div className="sf-field" key={label}>
                    <dt>{label}</dt>
                    <dd>{value || '—'}</dd>
                  </div>
                ))}
                {profile.notes && (
                  <div className="sf-field sf-field-full">
                    <dt>Notes</dt>
                    <dd>{profile.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </Section>

          {/* Promote role — Admin only, Manager cannot see this */}
          {perms.canPromoteStaff && (
            <Section title="Change Primary Role">
              <p style={{ fontSize: 12, color: 'var(--white-dim)', marginBottom: 14 }}>
                Current: <strong style={{ color: 'var(--gold)' }}>{ROLE_LABELS[profile.role]}</strong>
              </p>
              <form onSubmit={handlePromote}>
                <div className="sf-form-group">
                  <label className="sf-label sf-label-req">New Role</label>
                  <select className="sf-select" value={promoteRole}
                    onChange={(e) => setPromoteRole(e.target.value)} required>
                    <option value="">Select role…</option>
                    {allRoles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="sf-form-group">
                  <label className="sf-label">Note (optional)</label>
                  <input className="sf-input" value={promoteNote}
                    onChange={(e) => setPromoteNote(e.target.value)}
                    placeholder="Reason for role change…" />
                </div>
                <button type="submit" className="sf-btn sf-btn-blue"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={promoteBusy || !promoteRole}>
                  {promoteBusy ? 'Applying…' : 'Apply Role Change'}
                </button>
              </form>
            </Section>
          )}

          {/* Temp role — Admin only, Manager cannot see this */}
          {perms.canAssignTempRole && (
            <Section title="Temporary Role Override">
              {profile.temp_role ? (
                <div>
                  <div className="sf-notice sf-notice-amber" style={{ marginBottom: 14 }}>
                    <p style={{ margin: 0 }}>
                      Active temp role: <strong>{ROLE_LABELS[profile.temp_role]}</strong>
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 11 }}>
                      Expires: {profile.temp_role_expires_at
                        ? new Date(profile.temp_role_expires_at).toLocaleString()
                        : '—'}
                    </p>
                  </div>
                  <button className="sf-btn sf-btn-amber"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={handleRemoveTempRole} disabled={tempBusy}>
                    {tempBusy ? '…' : 'Remove Temp Role'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAssignTempRole}>
                  <div className="sf-form-group">
                    <label className="sf-label sf-label-req">Temp Role</label>
                    <select className="sf-select" value={tempRole}
                      onChange={(e) => setTempRole(e.target.value)} required>
                      <option value="">Select temp role…</option>
                      {allRoles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="sf-form-group">
                    <label className="sf-label sf-label-req">Expires At</label>
                    <input type="datetime-local" className="sf-input" value={tempExpires}
                      onChange={(e) => setTempExpires(e.target.value)} required />
                  </div>
                  <button type="submit" className="sf-btn sf-btn-amber"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={tempBusy || !tempRole || !tempExpires}>
                    {tempBusy ? 'Saving…' : 'Assign Temp Role'}
                  </button>
                </form>
              )}
            </Section>
          )}

          {/* Recent activity — Admin + Manager can view */}
          <Section title="Recent Activity">
            {!profile.recent_activity?.length ? (
              <p style={{ fontSize: 12, color: 'var(--white-dim)' }}>No recent activity.</p>
            ) : (
              <div className="sf-log-list">
                {profile.recent_activity.map((log) => (
                  <div key={log.id} className="sf-log-item">
                    <div className="sf-log-bar" />
                    <div>
                      <p className="sf-log-action">{log.action_type}</p>
                      <p className="sf-log-desc">{log.description}</p>
                      <p className="sf-log-time">{new Date(log.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Recent shifts — Admin + Manager can view */}
          <Section title="Recent Shifts">
            {!profile.shifts?.length ? (
              <p style={{ fontSize: 12, color: 'var(--white-dim)' }}>No shifts scheduled.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {profile.shifts.map((s) => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 12, borderBottom: '1px solid var(--gold-border)', paddingBottom: 10,
                  }}>
                    <span style={{ color: 'var(--white)', fontWeight: 600 }}>{s.label || 'Shift'}</span>
                    <span style={{ color: 'var(--white-dim)' }}>
                      {new Date(s.start_time).toLocaleDateString()} · {s.duration_hours}h · {s.status_display}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

        </div>
      </div>
    </div>
  );
}