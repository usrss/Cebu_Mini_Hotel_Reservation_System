/**
 * src/features/staff/profiles/StaffListPage.jsx
 *
 * Lists all staff members with filtering, search, and inline actions.
 * Admin: full CRUD + deactivate/reactivate + promote
 * Manager: read-only list
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  staffMembersApi,
  STAFF_ROLES,
  ROLE_LABELS,
  ONLINE_STATUS_LABELS,
} from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import StaffFormModal from './StaffFormModal';

const STATUS_COLORS = {
  online:  'bg-emerald-100 text-emerald-700',
  offline: 'bg-slate-100 text-slate-500',
  idle:    'bg-amber-100 text-amber-700',
};

const ROLE_COLORS = {
  admin:        'bg-purple-100 text-purple-700',
  manager:      'bg-blue-100 text-blue-700',
  receptionist: 'bg-cyan-100 text-cyan-700',
  front_desk:   'bg-teal-100 text-teal-700',
  housekeeping: 'bg-green-100 text-green-700',
  maintenance:  'bg-orange-100 text-orange-700',
  security:     'bg-red-100 text-red-700',
};

export default function StaffListPage() {
  const navigate  = useNavigate();
  const perms     = useStaffRole();

  const [members,    setMembers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showModal,  setShowModal]  = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // pk being acted on

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (search)       params.search        = search;
      if (roleFilter)   params.role          = roleFilter;
      if (statusFilter) params.online_status = statusFilter;
      if (activeFilter !== '') params.is_active = activeFilter;
      const data = await staffMembersApi.list(params);
      // Handle paginated or plain array
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
    setActionLoading(pk);
    try {
      await staffMembersApi.deactivate(pk, { reason: 'Deactivated via admin panel.' });
      fetchMembers();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (pk, email) => {
    if (!window.confirm(`Reactivate ${email}?`)) return;
    setActionLoading(pk);
    try {
      await staffMembersApi.reactivate(pk);
      fetchMembers();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Staff Members</h1>
          <p className="text-sm text-slate-500 mt-0.5">{members.length} total</p>
        </div>
        {perms.canCreateStaff && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span> Add Staff
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="flex-1 min-w-[180px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="">All Statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="idle">Idle</option>
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="">Active &amp; Inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <button
          onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); setActiveFilter(''); }}
          className="text-sm text-slate-500 hover:text-slate-700 px-2"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400">Loading…</div>
        ) : error ? (
          <div className="py-20 text-center text-red-500">{error}</div>
        ) : members.length === 0 ? (
          <div className="py-20 text-center text-slate-400">No staff members found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name / Email</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Current Task</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Employee ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Active</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{m.user?.full_name || '—'}</div>
                    <div className="text-xs text-slate-400">{m.user?.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[m.effective_role] || 'bg-slate-100 text-slate-600'}`}>
                      {ROLE_LABELS[m.effective_role] || m.effective_role}
                    </span>
                    {m.temp_role && (
                      <div className="text-xs text-amber-600 mt-0.5">
                        temp: {ROLE_LABELS[m.temp_role]}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.online_status] || ''}`}>
                      {ONLINE_STATUS_LABELS[m.online_status] || m.online_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">
                    {m.current_task || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{m.employee_id || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/staff/members/${m.id}`)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </button>
                      {perms.canDeactivateStaff && (
                        m.is_active ? (
                          <button
                            onClick={() => handleDeactivate(m.id, m.user?.email)}
                            disabled={actionLoading === m.id}
                            className="text-xs text-red-500 hover:underline disabled:opacity-50"
                          >
                            {actionLoading === m.id ? '…' : 'Deactivate'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(m.id, m.user?.email)}
                            disabled={actionLoading === m.id}
                            className="text-xs text-green-600 hover:underline disabled:opacity-50"
                          >
                            {actionLoading === m.id ? '…' : 'Reactivate'}
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Staff Modal */}
      {showModal && (
        <StaffFormModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchMembers(); }}
        />
      )}
    </div>
  );
}