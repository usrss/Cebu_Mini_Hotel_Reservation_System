/**
 * src/features/staff/profiles/StaffListPage.jsx
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import {
  staffMembersApi,
  ROLE_LABELS,
  ONLINE_STATUS_LABELS,
} from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import StaffFormModal from './StaffFormModal';
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

function statusBadgeClass(s) {
  return s === 'online' ? 'sf-badge-green' : s === 'idle' ? 'sf-badge-amber' : 'sf-badge-muted';
}

export default function StaffListPage() {
  const navigate = useNavigate();
  const perms    = useStaffRole();

  const [members,      setMembers]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [search,       setSearch]       = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [actionBusy,   setActionBusy]  = useState(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (search)              params.search        = search;
      if (roleFilter)          params.role          = roleFilter;
      if (statusFilter)        params.online_status = statusFilter;
      if (activeFilter !== '') params.is_active     = activeFilter;
      const data = await staffMembersApi.list(params);
      setMembers(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load staff.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, activeFilter]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleDeactivate = async (pk, email) => {
    if (!window.confirm(`Deactivate ${email}?`)) return;
    setActionBusy(pk);
    try {
      await staffMembersApi.deactivate(pk, { reason: 'Deactivated via admin panel.' });
      fetchMembers();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setActionBusy(null); }
  };

  const handleReactivate = async (pk, email) => {
    if (!window.confirm(`Reactivate ${email}?`)) return;
    setActionBusy(pk);
    try {
      await staffMembersApi.reactivate(pk);
      fetchMembers();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setActionBusy(null); }
  };

  return (
    <div className="sf-page">
      <div className="sf-inner">

        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Hotel Administration</p>
            <h1>Staff Members</h1>
            <p>{members.length} total members</p>
          </div>
          {/* Admin only — Manager cannot create staff */}
          {perms.canCreateStaff && (
            <button className="sf-btn sf-btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={13} /> Add Staff Member
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="sf-filter-bar">
          <input className="sf-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…" />
          <select className="sf-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="sf-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="online">Online</option>
            <option value="idle">Idle</option>
            <option value="offline">Offline</option>
          </select>
          <select className="sf-select" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
            <option value="">Active &amp; Inactive</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
          <button className="sf-filter-clear" onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); setActiveFilter(''); }}>
            Clear filters
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading staff…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : (
          <div className="sf-table-wrap">
            <table className="sf-table">
              <thead>
                <tr>
                  <th>Name / Email</th>
                  <th>Effective Role</th>
                  <th>Status</th>
                  <th>Current Task</th>
                  <th>Employee ID</th>
                  <th>Account</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr><td colSpan={7} className="sf-table-empty">No staff members found</td></tr>
                ) : members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="sf-table-name">{m.user?.full_name || '—'}</div>
                      <div className="sf-table-sub">{m.user?.email}</div>
                    </td>
                    <td>
                      <span className={`sf-badge ${roleBadgeClass(m.effective_role)}`}>
                        {ROLE_LABELS[m.effective_role] || m.effective_role}
                      </span>
                      {m.temp_role && (
                        <div style={{ marginTop: 5 }}>
                          <span className="sf-badge sf-badge-amber">temp: {ROLE_LABELS[m.temp_role]}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`sf-badge ${statusBadgeClass(m.online_status)}`}>
                        {ONLINE_STATUS_LABELS[m.online_status] || m.online_status}
                      </span>
                    </td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.current_task || '—'}
                    </td>
                    <td>{m.employee_id || '—'}</td>
                    <td>
                      <span className={`sf-badge ${m.is_active ? 'sf-badge-green' : 'sf-badge-red'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="sf-btn" style={{ padding: '5px 12px', fontSize: 9 }} onClick={() => navigate(`/staff/members/${m.id}`)}>
                          View <ArrowRight size={11} />
                        </button>
                        {/* Admin only — Manager sees list but cannot deactivate */}
                        {perms.canDeactivateStaff && (
                          m.is_active ? (
                            <button className="sf-btn sf-btn-danger" style={{ padding: '5px 12px', fontSize: 9 }}
                              onClick={() => handleDeactivate(m.id, m.user?.email)} disabled={actionBusy === m.id}>
                              {actionBusy === m.id ? '…' : 'Deactivate'}
                            </button>
                          ) : (
                            <button className="sf-btn sf-btn-success" style={{ padding: '5px 12px', fontSize: 9 }}
                              onClick={() => handleReactivate(m.id, m.user?.email)} disabled={actionBusy === m.id}>
                              {actionBusy === m.id ? '…' : 'Reactivate'}
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <StaffFormModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); fetchMembers(); }} />
      )}
    </div>
  );
}