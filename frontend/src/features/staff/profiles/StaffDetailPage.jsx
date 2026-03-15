/**
 * src/features/staff/profiles/StaffDetailPage.jsx
 *
 * Full staff profile detail with:
 *  - Profile info + edit
 *  - Role promotion
 *  - Temp role assign / remove
 *  - Deactivate / Reactivate
 *  - Recent activity & shifts (read-only)
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  staffMembersApi,
  ROLE_LABELS,
  ONLINE_STATUS_LABELS,
  PRIORITY_LABELS,
} from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';

const ROLE_COLORS = {
  admin:        'bg-purple-100 text-purple-700',
  manager:      'bg-blue-100 text-blue-700',
  receptionist: 'bg-cyan-100 text-cyan-700',
  front_desk:   'bg-teal-100 text-teal-700',
  housekeeping: 'bg-green-100 text-green-700',
  maintenance:  'bg-orange-100 text-orange-700',
  security:     'bg-red-100 text-red-700',
};

const STATUS_DOT = {
  online:  'bg-emerald-500',
  offline: 'bg-slate-300',
  idle:    'bg-amber-400',
};

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-700 font-medium">{value || '—'}</dd>
    </div>
  );
}

export default function StaffDetailPage() {
  const { pk }   = useParams();
  const navigate = useNavigate();
  const perms    = useStaffRole();

  const [profile,   setProfile]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Promote form
  const [promoteRole,  setPromoteRole]  = useState('');
  const [promoteNote,  setPromoteNote]  = useState('');
  const [promoteBusy,  setPromoteBusy]  = useState(false);

  // Temp role form
  const [tempRole,     setTempRole]     = useState('');
  const [tempExpires,  setTempExpires]  = useState('');
  const [tempBusy,     setTempBusy]     = useState(false);

  // Edit basic fields
  const [editMode,    setEditMode]    = useState(false);
  const [editData,    setEditData]    = useState({});
  const [editBusy,    setEditBusy]    = useState(false);

  const [actionBusy, setActionBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [pk]);

  const handlePromote = async (e) => {
    e.preventDefault();
    setPromoteBusy(true);
    try {
      await staffMembersApi.promote(pk, { role: promoteRole, note: promoteNote });
      setPromoteRole(''); setPromoteNote('');
      load();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setPromoteBusy(false);
    }
  };

  const handleAssignTempRole = async (e) => {
    e.preventDefault();
    setTempBusy(true);
    try {
      await staffMembersApi.assignTempRole(pk, { temp_role: tempRole, expires_at: tempExpires });
      setTempRole(''); setTempExpires('');
      load();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setTempBusy(false);
    }
  };

  const handleRemoveTempRole = async () => {
    if (!window.confirm('Remove temp role?')) return;
    setTempBusy(true);
    try {
      await staffMembersApi.removeTempRole(pk);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setTempBusy(false);
    }
  };

  const handleToggleActive = async () => {
    const action = profile.is_active ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this staff member?`)) return;
    setActionBusy(true);
    try {
      if (profile.is_active) {
        await staffMembersApi.deactivate(pk, { reason: 'Admin action.' });
      } else {
        await staffMembersApi.reactivate(pk);
      }
      load();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setEditBusy(true);
    try {
      await staffMembersApi.update(pk, editData);
      setEditMode(false);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setEditBusy(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (error)   return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!profile) return null;

  const allRoles = Object.entries(ROLE_LABELS);

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/staff/members')}
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1"
      >
        ← Back to staff list
      </button>

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600">
              {(profile.user?.full_name || profile.user?.email || '?')[0].toUpperCase()}
            </div>
            <span className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${STATUS_DOT[profile.online_status] || 'bg-slate-300'}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {profile.user?.full_name || profile.user?.email}
            </h1>
            <p className="text-sm text-slate-400">{profile.user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[profile.effective_role] || 'bg-slate-100 text-slate-600'}`}>
                {ROLE_LABELS[profile.effective_role] || profile.effective_role}
              </span>
              {profile.temp_role && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  temp: {ROLE_LABELS[profile.temp_role]}
                </span>
              )}
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${profile.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {profile.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          {perms.canEditStaff && (
            <button
              onClick={() => setEditMode(!editMode)}
              className="text-sm px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              {editMode ? 'Cancel' : 'Edit'}
            </button>
          )}
          {perms.canDeactivateStaff && (
            <button
              onClick={handleToggleActive}
              disabled={actionBusy}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ${profile.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
            >
              {actionBusy ? '…' : profile.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Basic Info / Edit */}
        <Section title="Profile Info">
          {editMode ? (
            <form onSubmit={handleEdit} className="space-y-3">
              {[
                ['first_name', 'First Name'],
                ['last_name',  'Last Name'],
                ['phone',      'Phone'],
                ['employee_id','Employee ID'],
              ].map(([field, label]) => (
                <div key={field}>
                  <label className="block text-xs text-slate-500 mb-1">{label}</label>
                  <input
                    value={editData[field] || ''}
                    onChange={(e) => setEditData({ ...editData, [field]: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Notes</label>
                <textarea
                  value={editData.notes || ''}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <button
                type="submit"
                disabled={editBusy}
                className="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {editBusy ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Employee ID"    value={profile.employee_id} />
              <Field label="Phone"          value={profile.phone} />
              <Field label="Online Status"  value={ONLINE_STATUS_LABELS[profile.online_status]} />
              <Field label="Current Task"   value={profile.current_task} />
              <Field label="Last Seen"      value={profile.last_seen_at ? new Date(profile.last_seen_at).toLocaleString() : null} />
              <Field label="Joined"         value={new Date(profile.created_at).toLocaleDateString()} />
              {profile.notes && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-400 mb-0.5">Notes</dt>
                  <dd className="text-sm text-slate-700">{profile.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </Section>

        {/* Promote Role */}
        {perms.canPromoteStaff && (
          <Section title="Change Role">
            <p className="text-xs text-slate-500 mb-3">
              Current primary role: <strong>{ROLE_LABELS[profile.role]}</strong>
            </p>
            <form onSubmit={handlePromote} className="space-y-3">
              <select
                value={promoteRole}
                onChange={(e) => setPromoteRole(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">Select new role…</option>
                {allRoles.map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input
                value={promoteNote}
                onChange={(e) => setPromoteNote(e.target.value)}
                placeholder="Optional note…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <button
                type="submit"
                disabled={promoteBusy || !promoteRole}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {promoteBusy ? 'Saving…' : 'Apply Role Change'}
              </button>
            </form>
          </Section>
        )}

        {/* Temp Role */}
        {perms.canPromoteStaff && (
          <Section title="Temporary Role Override">
            {profile.temp_role ? (
              <div className="space-y-3">
                <div className="bg-amber-50 rounded-lg p-3 text-sm">
                  <p>Active temp role: <strong>{ROLE_LABELS[profile.temp_role]}</strong></p>
                  <p className="text-xs text-slate-500 mt-1">
                    Expires: {profile.temp_role_expires_at ? new Date(profile.temp_role_expires_at).toLocaleString() : '—'}
                  </p>
                </div>
                <button
                  onClick={handleRemoveTempRole}
                  disabled={tempBusy}
                  className="w-full bg-amber-100 text-amber-800 py-2 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50"
                >
                  {tempBusy ? '…' : 'Remove Temp Role'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleAssignTempRole} className="space-y-3">
                <select
                  value={tempRole}
                  onChange={(e) => setTempRole(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">Select temp role…</option>
                  {allRoles.map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Expires at</label>
                  <input
                    type="datetime-local"
                    value={tempExpires}
                    onChange={(e) => setTempExpires(e.target.value)}
                    required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
                <button
                  type="submit"
                  disabled={tempBusy || !tempRole || !tempExpires}
                  className="w-full bg-amber-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  {tempBusy ? 'Saving…' : 'Assign Temp Role'}
                </button>
              </form>
            )}
          </Section>
        )}

        {/* Recent Activity */}
        <Section title="Recent Activity">
          {profile.recent_activity?.length === 0 ? (
            <p className="text-sm text-slate-400">No recent activity.</p>
          ) : (
            <ul className="space-y-2">
              {(profile.recent_activity || []).map((log) => (
                <li key={log.id} className="text-xs border-l-2 border-slate-200 pl-3">
                  <span className="font-medium text-slate-700">{log.action_type}</span>
                  <span className="text-slate-400 ml-2">{new Date(log.created_at).toLocaleString()}</span>
                  <p className="text-slate-500 mt-0.5 truncate">{log.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Recent Shifts */}
        <Section title="Recent Shifts">
          {profile.shifts?.length === 0 ? (
            <p className="text-sm text-slate-400">No shifts scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {(profile.shifts || []).map((s) => (
                <li key={s.id} className="text-xs flex justify-between">
                  <span className="font-medium text-slate-700">{s.label || 'Shift'}</span>
                  <span className="text-slate-400">
                    {new Date(s.start_time).toLocaleDateString()} · {s.duration_hours}h · {s.status_display}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}