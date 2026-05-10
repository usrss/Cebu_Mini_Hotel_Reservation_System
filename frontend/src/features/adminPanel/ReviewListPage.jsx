/**
 * ReviewListPage.jsx
 * Accessible by: admin, manager
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, Star, Eye, EyeOff, ShieldCheck, Search } from 'lucide-react';
import { reviewApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import styles from './ReviewListPage.module.css';

function Stars({ rating }) {
  return (
    <span className={styles.stars}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

export default function ReviewListPage() {
  const navigate = useNavigate();
  // FIX: destructure `loading` so we don't show "Access denied" while the
  // role is still being resolved from localStorage / the API.
  const { canManageReviews, loading: roleLoading } = useAdminRole();

  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [count, setCount]           = useState(0);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]         = useState('');
  const [isVisible, setIsVisible]   = useState('');
  const [rating, setRating]         = useState('');
  const [ordering, setOrdering]     = useState('-created_at');

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { ordering, page };
      if (search)          params.search     = search;
      if (isVisible !== '') params.is_visible = isVisible;
      if (rating)          params.rating     = rating;
      const data    = await reviewApi.list(params);
      const results = data.results ?? data;
      setReviews(results);
      setCount(data.count ?? results.length);
      setTotalPages(data.count ? Math.ceil(data.count / 20) : 1);
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to load reviews.');
    } finally {
      setLoading(false);
    }
  }, [search, isVisible, rating, ordering, page]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const toggleVisibility = async (review, e) => {
    e.stopPropagation();
    const newVisible = !review.is_visible;
    const reason     = newVisible ? '' : (prompt('Reason for hiding (optional):') ?? '');
    try {
      const res = await reviewApi.setVisibility(review.id, { is_visible: newVisible, reason });
      setReviews((rs) => rs.map((r) => (r.id === review.id ? res.review : r)));
    } catch {
      alert('Failed to update visibility.');
    }
  };

  // FIX: show nothing (or a neutral loader) while the role is resolving —
  // never flash "Access denied" before we actually know the user's role.
  if (roleLoading) return <div className={styles.state}>Loading…</div>;
  if (!canManageReviews) return <div className={styles.forbidden}>Access denied.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Reviews</h1>
          <p className={styles.subtitle}>{count} reviews</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search guest, room, content…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select className={styles.select} value={isVisible}
          onChange={(e) => { setIsVisible(e.target.value); setPage(1); }}>
          <option value="">All visibility</option>
          <option value="true">Visible</option>
          <option value="false">Hidden</option>
        </select>
        <select className={styles.select} value={rating}
          onChange={(e) => { setRating(e.target.value); setPage(1); }}>
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>{'★'.repeat(r)} {r} star{r !== 1 ? 's' : ''}</option>
          ))}
        </select>
        <select className={styles.select} value={ordering}
          onChange={(e) => { setOrdering(e.target.value); setPage(1); }}>
          <option value="-created_at">Newest first</option>
          <option value="created_at">Oldest first</option>
          <option value="-rating">Highest rating</option>
          <option value="rating">Lowest rating</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.state}>Loading…</div>
      ) : error ? (
        <div className={styles.stateError}>{error}</div>
      ) : (
        <>
          <div className={styles.list}>
            {reviews.map((r) => (
              <div key={r.id}
                className={`${styles.card} ${!r.is_visible ? styles.cardHidden : ''}`}
                onClick={() => navigate(`/admin/reviews/${r.id}`)}>
                <div className={styles.cardTop}>
                  <div className={styles.cardLeft}>
                    <Stars rating={r.rating} />
                    <span className={styles.roomBadge}>Room {r.room_number}</span>
                    {r.is_verified && <span className={styles.verified}>✓ Verified</span>}
                    {!r.is_visible && <span className={styles.hiddenBadge}>Hidden</span>}
                  </div>
                  <button
                    className={r.is_visible ? styles.hideBtn : styles.showBtn}
                    onClick={(e) => toggleVisibility(r, e)}>
                    {r.is_visible ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className={styles.text}>{r.review_text}</p>
                <div className={styles.cardBottom}>
                  <span className={styles.guest}>{r.guest_name} · {r.guest_email}</span>
                  <span className={styles.date}>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.helpful}>
                  <span className={styles.voteBadge + ' ' + styles.voteBadgeUp}>
                    <ThumbsUp size={13} /> {r.helpful_count}
                  </span>
                  <span className={styles.voteBadge + ' ' + styles.voteBadgeDown}>
                    <ThumbsDown size={13} /> {r.not_helpful_count}
                  </span>
                </div>
              </div>
            ))}
            {reviews.length === 0 && <div className={styles.empty}>No reviews found.</div>}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}