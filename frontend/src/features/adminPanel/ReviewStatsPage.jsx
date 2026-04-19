/**
 * ReviewStatsPage.jsx
 * Aggregate review statistics. Accessible by: admin, manager
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reviewApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import styles from './ReviewStatsPage.module.css';

function StarBar({ star, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className={styles.starRow}>
      <span className={styles.starLabel}>{'★'.repeat(star)}</span>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.starCount}>{count}</span>
    </div>
  );
}

export default function ReviewStatsPage() {
  const navigate = useNavigate();
  // FIX: destructure `loading` so we don't flash "Access denied" while role resolves.
  const { canManageReviews, loading: roleLoading } = useAdminRole();

  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    reviewApi.stats()
      .then(setStats)
      .catch((err) => setError(err.response?.data?.detail ?? 'Failed to load stats.'))
      .finally(() => setLoading(false));
  }, []);

  // FIX: wait for role to resolve before showing access denied.
  if (roleLoading)       return <div className={styles.state}>Loading…</div>;
  if (!canManageReviews) return <div className={styles.stateError}>Access denied.</div>;
  if (loading)           return <div className={styles.state}>Loading…</div>;
  if (error)             return <div className={styles.stateError}>{error}</div>;
  if (!stats)            return null;

  const totalReviews = stats.total_reviews ?? 0;

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/admin/reviews')}>
        ← Reviews
      </button>

      <h1 className={styles.title}>Review Statistics</h1>

      {/* KPIs */}
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Avg Rating</span>
          <span className={styles.kpiValue}>
            {stats.avg_rating ? Number(stats.avg_rating).toFixed(2) : '—'}
          </span>
          <span className={styles.kpiStar}>★</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Total (Visible)</span>
          <span className={styles.kpiValue}>{totalReviews}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Hidden</span>
          <span className={`${styles.kpiValue} ${styles.red}`}>{stats.hidden_count}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Last 30 Days</span>
          <span className={styles.kpiValue}>{stats.trend?.last_30_days ?? 0}</span>
          <span className={styles.kpiSub}>
            prev: {stats.trend?.prev_30_days ?? 0}
          </span>
        </div>
      </div>

      <div className={styles.panels}>
        {/* Rating breakdown */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Rating Breakdown</h2>
          {[5, 4, 3, 2, 1].map((star) => (
            <StarBar
              key={star}
              star={star}
              count={stats.rating_breakdown?.[star] ?? 0}
              total={totalReviews}
            />
          ))}
        </div>

        {/* Top rooms */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Top Rated Rooms</h2>
          {stats.top_rooms?.length ? (
            <div className={styles.roomList}>
              {stats.top_rooms.map((r, i) => (
                <div key={i} className={styles.roomRow}>
                  <span className={styles.roomRank}>#{i + 1}</span>
                  <div className={styles.roomInfo}>
                    <span className={styles.roomNum}>Room {r.room__room_number}</span>
                    <span className={styles.roomType}>{r.room__room_type}</span>
                  </div>
                  <span className={styles.roomAvg}>★ {Number(r.avg).toFixed(1)}</span>
                  <span className={styles.roomCount}>{r.count} reviews</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No data yet.</p>
          )}
        </div>
      </div>

      {/* Helpfulness section */}
      {stats.helpfulness && (
        <>
          <div className={styles.kpis} style={{ marginTop: '1.5rem' }}>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>👍 Helpful</span>
              <span className={styles.kpiValue} style={{ color: '#0D9488' }}>
                {stats.helpfulness.total_helpful ?? 0}
              </span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>👎 Not Helpful</span>
              <span className={styles.kpiValue} style={{ color: '#DC2626' }}>
                {stats.helpfulness.total_not_helpful ?? 0}
              </span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Total Votes</span>
              <span className={styles.kpiValue}>
                {stats.helpfulness.total_votes ?? 0}
              </span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Helpfulness Ratio</span>
              <span className={styles.kpiValue} style={{ color: '#D97706' }}>
                {stats.helpfulness.helpfulness_ratio != null
                  ? `${stats.helpfulness.helpfulness_ratio}%`
                  : '—'}
              </span>
            </div>
          </div>

          {stats.helpfulness.most_helpful_reviews?.length > 0 && (
            <div className={styles.panels}>
              <div className={styles.panel} style={{ gridColumn: '1 / -1' }}>
                <h2 className={styles.panelTitle}>Most Helpful Reviews</h2>
                <div className={styles.roomList}>
                  {stats.helpfulness.most_helpful_reviews.map((r, i) => (
                    <div key={i} className={styles.roomRow}>
                      <span className={styles.roomRank}>#{i + 1}</span>
                      <div className={styles.roomInfo}>
                        <span className={styles.roomNum}>Room {r.room__room_number}</span>
                        <span className={styles.roomType}>{r.display_name} · {r.rating}★</span>
                      </div>
                      <span className={styles.roomAvg} style={{ color: '#0D9488' }}>👍 {r.helpful_count}</span>
                      <span className={styles.roomCount} style={{ color: '#DC2626' }}>👎 {r.not_helpful_count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}