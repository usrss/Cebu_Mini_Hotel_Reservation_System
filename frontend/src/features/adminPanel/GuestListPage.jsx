/**
 * GuestListPage.jsx
 * Accessible by: admin, manager, receptionist, front_desk
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { guestApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import styles from './GuestListPage.module.css';

function Badge({ active }) {
  return (
    <span className={active ? styles.badgeActive : styles.badgeInactive}>
      {active ? 'Active' : 'Blocked'}
    </span>
  );
}

export default function GuestListPage() {
  const navigate = useNavigate();
  const { canViewGuests, canModifyGuests } = useAdminRole();

  const [guests, setGuests]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState('');
  const [isActive, setIsActive]     = useState('');
  const [ordering, setOrdering]     = useState('-date_joined');
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount]           = useState(0);

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { ordering, page };
      if (search)          params.search    = search;
      if (isActive !== '') params.is_active = isActive;

      const data    = await guestApi.list(params);
      const results = data.results ?? data;
      setGuests(results);
      setCount(data.count ?? results.length);
      setTotalPages(data.count ? Math.ceil(data.count / 20) : 1);
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to load guests.');
    } finally {
      setLoading(false);
    }
  }, [search, isActive, ordering, page]);

  useEffect(() => { fetchGuests(); }, [fetchGuests]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchGuests(); };

  const handleBlock = async (guest, e) => {
    e.stopPropagation();
    const newState = !guest.is_active;
    const reason   = newState ? '' : (prompt('Reason for blocking (optional):') ?? '');
    try {
      await guestApi.block(guest.id, { is_active: newState, reason });
      fetchGuests();
    } catch {
      alert('Failed to update guest status.');
    }
  };

  if (!canViewGuests) return <div className={styles.forbidden}>Access denied.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Guests</h1>
          <p className={styles.subtitle}>{count} registered guests</p>
        </div>
      </div>

      <form className={styles.toolbar} onSubmit={handleSearch}>
        <input
          className={styles.searchInput}
          placeholder="Search by name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.select} value={isActive}
          onChange={(e) => { setIsActive(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Blocked</option>
        </select>
        <select className={styles.select} value={ordering}
          onChange={(e) => { setOrdering(e.target.value); setPage(1); }}>
          <option value="-date_joined">Newest first</option>
          <option value="date_joined">Oldest first</option>
          <option value="email">Email A–Z</option>
          <option value="-last_login">Last login</option>
        </select>
        <button className={styles.searchBtn} type="submit">Search</button>
      </form>

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Guest</th><th>Email</th><th>Phone</th>
                <th>Bookings</th><th>Total Spent</th><th>Joined</th><th>Status</th>
                {canModifyGuests && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id} className={styles.row}
                  onClick={() => navigate(`/admin/guests/${g.id}`)}>
                  <td className={styles.nameCell}>
                    <span className={styles.avatar}>
                      {(g.full_name?.[0] || g.email[0]).toUpperCase()}
                    </span>
                    {g.full_name || '—'}
                  </td>
                  <td>{g.email}</td>
                  <td>{g.phone || '—'}</td>
                  <td className={styles.center}>{g.booking_count}</td>
                  <td>₱{Number(g.total_spent).toLocaleString()}</td>
                  <td>{new Date(g.date_joined).toLocaleDateString()}</td>
                  <td><Badge active={g.is_active} /></td>
                  {canModifyGuests && (
                    <td>
                      <button
                        className={g.is_active ? styles.blockBtn : styles.activateBtn}
                        onClick={(e) => handleBlock(g, e)}
                      >
                        {g.is_active ? 'Block' : 'Activate'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {guests.length === 0 && (
                <tr>
                  <td colSpan={canModifyGuests ? 8 : 7} className={styles.empty}>
                    No guests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
        </div>
      )}
    </div>
  );
}