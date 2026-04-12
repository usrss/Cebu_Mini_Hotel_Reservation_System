/**
 * StaffManagement.jsx
 * Admin-only: Staff list, create, edit, promote, temp role,
 * deactivate/reactivate, delete. Tabs: Staff | Shifts
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Users, UserCheck,
  Clock, Edit2, Trash2,
  ShieldCheck, ShieldOff, CalendarDays, X,
} from 'lucide-react';
import { staffApi } from '../../staff/services/staffApi';
import { useAdminRole } from '../../hooks/useAdminRole';
import StaffFormModal    from './StaffFormModal';
import TempRoleModal     from './TempRoleModal';
import PromoteModal      from './PromoteModal';
import DeactivateModal   from './DeactivateModal';
import ShiftCalendar     from './ShiftCalendar';
import './StaffManagement.css';

const ROLE_LABELS = {
  admin:'Admin',
  manager:'Manager',
  receptionist:'Receptionist',
  front_desk:'Front Desk',
  housekeeping:'Housekeeping',
  maintenance:'Maintenance',
  security:'Security',
  kitchen_staff: 'Kitchen Staff',
};

const ROLE_OPTIONS = [
  { value:'', label:'All Roles' },
  ...Object.entries(ROLE_LABELS).map(([v,l]) => ({ value:v, label:l })),
];

const STATUS_OPTIONS = [
  { value:'', label:'All Status' },
  { value:'active', label:'Active' },
  { value:'inactive', label:'Inactive' },
];

function KPI({ label, value, sub, color }) {
  return (
    <div className="sm-kpi" style={{ '--kpi-color': color }}>
      <div className="sm-kpi-label">{label}</div>
      <div className="sm-kpi-value">{value ?? '—'}</div>
      {sub && <div className="sm-kpi-sub">{sub}</div>}
    </div>
  );
}

function RoleBadge({ role }) {
  return (
    <span className={`sm-badge sm-badge--${role}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusBadge({ active }) {
  return (
    <span className={`sm-badge sm-badge--${active ? 'active' : 'inactive'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function OnlineDot({ status }) {
  return <span className={`sm-online-dot sm-online-dot--${status ?? 'offline'}`} />;
}

export default function StaffManagement() {
  const { role } = useAdminRole();
  const [activeTab,    setActiveTab]    = useState('staff');
  const [staff,        setStaff]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [createOpen,       setCreateOpen]       = useState(false);
  const [editTarget,       setEditTarget]       = useState(null);
  const [promoteTarget,    setPromoteTarget]    = useState(null);
  const [tempTarget,       setTempTarget]       = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deleteLoading,    setDeleteLoading]    = useState(false);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const data = await staffApi.list({
        search,
        role: roleFilter,
        is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
      });
      setStaff(data.results ?? data);
    } catch { setStaff([]); }
    finally  { setLoading(false); }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  if (role !== 'admin') {
    return (
      <div style={{ padding:60, color:'#F87171', textAlign:'center', fontFamily:'Raleway,sans-serif' }}>
        Access denied — Admin only.
      </div>
    );
  }

  // KPI counts
  const total    = staff.length;
  const active   = staff.filter(s => s.is_active).length;
  const online   = staff.filter(s => s.online_status === 'online').length;
  const inactive = staff.filter(s => !s.is_active).length;

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete ${s.user?.full_name ?? s.user?.email}? This cannot be undone.`)) return;
    setDeleteLoading(true);
    try { await staffApi.delete(s.id); await loadStaff(); }
    catch { alert('Failed to delete staff member.'); }
    finally { setDeleteLoading(false); }
  };

  const handleReactivate = async (s) => {
    try { await staffApi.reactivate(s.id); await loadStaff(); }
    catch { alert('Failed to reactivate.'); }
  };

  const handleRemoveTemp = async (s) => {
    if (!window.confirm('Remove temporary role?')) return;
    try { await staffApi.removeTemp(s.id); await loadStaff(); }
    catch { alert('Failed to remove temp role.'); }
  };

  const initials = (s) => {
    const name  = s.user?.full_name ?? s.user?.email ?? '';
    const parts = name.split(' ');
    return parts.length >= 2
      ? parts[0][0] + parts[1][0]
      : name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="sm-page">

      {/* Header */}
      <div className="sm-header">
        <div>
          <p className="sm-eyebrow">Admin Panel</p>
          <h1 className="sm-title">Staff Management</h1>
        </div>
        <button className="sm-btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Add Staff
        </button>
      </div>
      <div className="sm-divider" />

      {/* KPIs */}
      <div className="sm-kpis">
        <KPI label="Total Staff"  value={total}    color="var(--gold)" />
        <KPI label="Active Staff" value={active}   color="#6EE7B7" sub={`${inactive} inactive`} />
        <KPI label="Online Now"   value={online}   color="#93C5FD" sub="currently logged in" />
        <KPI label="Inactive"     value={inactive} color="#F87171" sub="pending activation" />
      </div>

      {/* Tabs */}
      <div className="sm-tabs">
        <button
          className={`sm-tab${activeTab === 'staff' ? ' sm-tab--active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          <Users size={14} /> Staff List
        </button>
        <button
          className={`sm-tab${activeTab === 'shifts' ? ' sm-tab--active' : ''}`}
          onClick={() => setActiveTab('shifts')}
        >
          <CalendarDays size={14} /> Shift Scheduler
        </button>
      </div>

      {/* ── STAFF TAB ── */}
      {activeTab === 'staff' && (
        <>
          {/* Toolbar */}
          <div className="sm-toolbar">
            <div className="sm-search-wrap">
              <Search size={14} className="sm-search-icon" />
              <input
                className="sm-search"
                placeholder="Search name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="sm-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="sm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="sm-loading">
              <div className="sm-spinner" /><span>Loading staff…</span>
            </div>
          ) : staff.length === 0 ? (
            <div className="sm-empty">
              <div className="sm-empty-icon">👥</div>
              <p>No staff members found.</p>
            </div>
          ) : (
            <div className="sm-table-wrap">
              <table className="sm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Temp Role</th>
                    <th>Status</th>
                    <th>Online</th>
                    <th>Employee ID</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>

                      {/* Name + Email */}
                      <td>
                        <div className="sm-staff-cell">
                          <div className="sm-avatar">{initials(s)}</div>
                          <div>
                            <div className="sm-staff-name">{s.user?.full_name ?? '—'}</div>
                            <div className="sm-staff-email">{s.user?.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td><RoleBadge role={s.effective_role ?? s.role} /></td>

                      {/* Temp Role */}
                      <td>
                        {s.temp_role ? (
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span className="sm-badge sm-badge--temp">
                              {ROLE_LABELS[s.temp_role] ?? s.temp_role}
                            </span>
                            <button
                              className="sm-action-btn sm-action-btn--danger"
                              style={{ padding:'2px 6px' }}
                              onClick={() => handleRemoveTemp(s)}
                              title="Remove temp role"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ color:'var(--white-dim)', fontSize:11 }}>—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td><StatusBadge active={s.is_active} /></td>

                      {/* Online */}
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <OnlineDot status={s.online_status} />
                          <span style={{ fontSize:11, color:'var(--white-dim)', textTransform:'capitalize' }}>
                            {s.online_status ?? 'offline'}
                          </span>
                        </div>
                      </td>

                      {/* Employee ID */}
                      <td style={{ fontSize:11, fontFamily:'DM Mono,monospace' }}>
                        {s.employee_id ?? '—'}
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="sm-actions">
                          <button className="sm-action-btn" onClick={() => setEditTarget(s)}
                            title="Edit profile">
                            <Edit2 size={11} /> Edit
                          </button>
                          <button className="sm-action-btn" onClick={() => setPromoteTarget(s)}
                            title="Change role">
                            <ShieldCheck size={11} /> Role
                          </button>
                          <button className="sm-action-btn" onClick={() => setTempTarget(s)}
                            title="Assign temp role">
                            <Clock size={11} /> Temp
                          </button>
                          {s.is_active ? (
                            <button className="sm-action-btn sm-action-btn--danger"
                              onClick={() => setDeactivateTarget(s)} title="Deactivate">
                              <ShieldOff size={11} /> Deactivate
                            </button>
                          ) : (
                            <button className="sm-action-btn sm-action-btn--success"
                              onClick={() => handleReactivate(s)} title="Reactivate">
                              <UserCheck size={11} /> Activate
                            </button>
                          )}
                          <button className="sm-action-btn sm-action-btn--danger"
                            onClick={() => handleDelete(s)} title="Delete"
                            disabled={deleteLoading}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── SHIFTS TAB ── */}
      {activeTab === 'shifts' && (
        <ShiftCalendar staff={staff} />
      )}

      {/* ── Modals ── */}
      {createOpen && (
        <StaffFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); loadStaff(); }}
        />
      )}
      {editTarget && (
        <StaffFormModal
          staff={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); loadStaff(); }}
        />
      )}
      {promoteTarget && (
        <PromoteModal
          staff={promoteTarget}
          onClose={() => setPromoteTarget(null)}
          onSaved={() => { setPromoteTarget(null); loadStaff(); }}
        />
      )}
      {tempTarget && (
        <TempRoleModal
          staff={tempTarget}
          onClose={() => setTempTarget(null)}
          onSaved={() => { setTempTarget(null); loadStaff(); }}
        />
      )}
      {deactivateTarget && (
        <DeactivateModal
          staff={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onSaved={() => { setDeactivateTarget(null); loadStaff(); }}
        />
      )}

    </div>
  );
}