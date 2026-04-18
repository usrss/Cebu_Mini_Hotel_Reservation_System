/**
 * RevenueSummaryPage.jsx
 * Revenue dashboard — admin / manager only.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import styles from './RevenueSummaryPage.module.css';

function fmt(n) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TrendBar({ items, groupBy }) {
  if (!items?.length) return <p className={styles.empty}>No data for this period.</p>;
  const maxRev = Math.max(...items.map((i) => Number(i.revenue)));

  return (
    <div className={styles.chartWrap}>
      {items.map((item, idx) => {
        const pct   = maxRev > 0 ? (Number(item.revenue) / maxRev) * 100 : 0;
        const label = item.period
          ? new Date(item.period).toLocaleDateString('en-PH', {
              month: 'short',
              day: groupBy === 'day' ? 'numeric' : undefined,
            })
          : idx;
        return (
          <div key={idx} className={styles.barGroup}>
            <div className={styles.barWrap}
              title={`${fmt(item.revenue)} (${item.count} txn)`}>
              <div className={styles.barFill} style={{ height: `${Math.max(pct, 2)}%` }} />
            </div>
            <span className={styles.barLabel}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function RevenueSummaryPage() {
  const navigate = useNavigate();
  // FIX: destructure `loading` so we don't flash "Access denied" while role resolves.
  const { role, loading: roleLoading } = useAdminRole();
  const canView = ['admin', 'manager'].includes(role);

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [period, setPeriod]   = useState('month');
  const [groupBy, setGroupBy] = useState('day');

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await paymentApi.revenue({ period, group_by: groupBy });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to load revenue data.');
    } finally {
      setLoading(false);
    }
  }, [period, groupBy]);

  useEffect(() => { fetchRevenue(); }, [fetchRevenue]);

  useEffect(() => {
    if (period === 'year') setGroupBy('month');
    else setGroupBy('day');
  }, [period]);

  // Keep revenue KPIs accurate without full page reload.
  useEffect(() => {
    const handler = () => fetchRevenue();
    window.addEventListener('revenue-updated', handler);
    return () => window.removeEventListener('revenue-updated', handler);
  }, [fetchRevenue]);

  // FIX: wait for role to resolve before showing access denied.
  if (roleLoading) return <div className={styles.state}>Loading…</div>;
  if (!canView)    return <div className={styles.forbidden}>Access denied.</div>;

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/admin/payments')}>
        ← Payments
      </button>

      <div className={styles.header}>
        <h1 className={styles.title}>Revenue Summary</h1>
        <div className={styles.controls}>
          {['today', 'week', 'month', 'year'].map((p) => (
            <button key={p}
              className={period === p ? styles.periodActive : styles.periodBtn}
              onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.state}>Loading…</div>
      ) : error ? (
        <div className={styles.stateError}>{error}</div>
      ) : data && (
        <>
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Total Revenue</span>
              <span className={styles.kpiValue}>{fmt(data.total_revenue)}</span>
              <span className={styles.kpiSub}>{data.transaction_count} transactions</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Refunded</span>
              <span className={`${styles.kpiValue} ${styles.red}`}>{fmt(data.refunded_total)}</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Net Revenue</span>
              <span className={`${styles.kpiValue} ${styles.green}`}>{fmt(data.net_revenue)}</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Pending</span>
              <span className={`${styles.kpiValue} ${styles.amber}`}>{fmt(data.pending_amount)}</span>
              <span className={styles.kpiSub}>{data.pending_count} pending</span>
              <span className={styles.kpiSub}>Not yet confirmed — excluded from net revenue</span>
            </div>
          </div>

          <div className={styles.chartSection}>
            <div className={styles.chartHeader}>
              <h2 className={styles.chartTitle}>Revenue Trend</h2>
              <select className={styles.select} value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}>
                <option value="day">By Day</option>
                <option value="month">By Month</option>
              </select>
            </div>
            <TrendBar items={data.trend} groupBy={groupBy} />
          </div>
        </>
      )}
    </div>
  );
}