/**
 * AnalyticsDashboard.jsx
 * Real-time analytics — auto-refreshes every 30s, no manual refresh button.
 * Uses Recharts for all charts. Luxury dark gold theme.
 *
 * Section structure (hotel-industry standard):
 *   Core Analytics  : Bookings (incl. Cancellations + Guests sub-tabs) · Occupancy · Revenue
 *   Room Analytics  : Room Performance
 *   Guest Experience: Reviews
 *   Services        : Food & Drinks
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CalendarCheck, BedDouble, TrendingUp, Star,
  UtensilsCrossed, AlertTriangle, DollarSign,
} from 'lucide-react';
import { analyticsApi, reviewApi, foodApi, paymentApi } from '../../../services/adminApi';
import { useAdminRole } from '../../hooks/useAdminRole';
import BookingAnalytics   from './BookingAnalytics';
import OccupancyAnalytics from './OccupancyAnalytics';
import RevenueAnalytics   from './RevenueAnalytics';
import RoomPerformance    from './RoomPerformance';
import ReviewAnalytics    from './ReviewAnalytics';
import FoodAnalytics      from './FoodAnalytics';
import './AnalyticsDashboard.css';

const POLL_INTERVAL = 30_000;

// ── Section tabs — industry-standard hotel analytics structure ─────────────────
// Guest + Cancellations removed as standalone; merged inside BookingAnalytics sub-tabs.
const SECTIONS = [
  { id: 'booking',  label: 'Bookings',         icon: <CalendarCheck size={14} />,   accent: 'var(--c-booking)'   },
  { id: 'occupancy',label: 'Occupancy',         icon: <BedDouble size={14} />,       accent: 'var(--c-occupancy)' },
  { id: 'revenue',  label: 'Revenue',           icon: <span style={{ fontSize: 14, fontWeight: 700 }}>₱</span>,      accent: '#0D9488'            },
  { id: 'room',     label: 'Room Performance',  icon: <TrendingUp size={14} />,      accent: 'var(--c-room)'      },
  { id: 'review',   label: 'Reviews',           icon: <Star size={14} />,            accent: 'var(--c-review)'    },
  { id: 'food',     label: 'Food & Drinks',     icon: <UtensilsCrossed size={14} />, accent: '#D97706'            },
];

const PERIODS     = ['Today', 'Week', 'Month', 'Year'];
const PERIOD_MAP  = { Today: 'daily', Week: 'weekly', Month: 'monthly', Year: 'yearly' };
const FOOD_PERIOD_MAP = { Today: 'daily', Week: 'weekly', Month: 'monthly', Year: 'yearly' };

export default function AnalyticsDashboard() {
  const { role } = useAdminRole();
  const [activeSection, setActiveSection] = useState('booking');
  const [globalPeriod,  setGlobalPeriod]  = useState('Month');
  const [dashboard,     setDashboard]     = useState(null);
  const [reviewStats,   setReviewStats]   = useState(null);
  const [foodSummary,   setFoodSummary]   = useState(null);
  const [revenueSummary,setRevenueSummary]= useState(null);
  const [loading,       setLoading]       = useState(true);
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const intervalRef = useRef(null);

  const loadKPIs = useCallback(async () => {
    try {
      const [dash, rev, food, revenue] = await Promise.allSettled([
        analyticsApi.dashboard(),
        reviewApi.stats(),
        foodApi.analytics('monthly'),
        paymentApi.revenue({ period: 'month' }),
      ]);
      if (dash.status    === 'fulfilled') setDashboard(dash.value);
      if (rev.status     === 'fulfilled') setReviewStats(rev.value);
      if (food.status    === 'fulfilled') setFoodSummary(food.value?.summary);
      if (revenue.status === 'fulfilled') setRevenueSummary(revenue.value);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKPIs();
    intervalRef.current = setInterval(loadKPIs, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [loadKPIs]);

  if (!['admin', 'manager'].includes(role)) {
    return <div className="an-forbidden">Access denied.</div>;
  }

  const d = dashboard;
  const occupancyRate = d?.rooms?.total
    ? Math.round((d.rooms.occupied / d.rooms.total) * 100)
    : null;

  // ── KPI cards — each routes to its parent section tab on click ────────────
  const KPI_CARDS = [
    {
      label:   'Checked In',
      value:   d?.bookings?.checked_in ?? '—',
      sub:     'In hotel now',
      accent:  'var(--c-booking)',
      icon:    <CalendarCheck size={16} />,
      section: 'booking',
    },
    {
      label:   'Available Rooms',
      value:   d?.rooms?.available ?? '—',
      sub:     `of ${d?.rooms?.total ?? '—'} total`,
      accent:  'var(--c-occupancy)',
      icon:    <BedDouble size={16} />,
      section: 'occupancy',
    },
    {
      label:   'Occupancy Rate',
      value:   occupancyRate !== null ? `${occupancyRate}%` : '—',
      sub:     `${d?.rooms?.occupied ?? 0} occupied`,
      accent:  'var(--c-occupancy)',
      icon:    <TrendingUp size={16} />,
      section: 'occupancy',
    },
    {
      label:   'Net Revenue',
      value:   revenueSummary?.net_revenue != null
                 ? `₱${Number(revenueSummary.net_revenue).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
                 : '—',
      sub:     'This month after refunds',
      accent:  '#0D9488',
      icon:    <span style={{ fontSize: 16, fontWeight: 700 }}>₱</span>,
      section: 'revenue',
    },
    {
      label:   'Avg Rating',
      value:   reviewStats?.avg_rating ? `${Number(reviewStats.avg_rating).toFixed(1)}★` : '—',
      sub:     `${reviewStats?.total_reviews ?? 0} reviews`,
      accent:  'var(--c-review)',
      icon:    <Star size={16} />,
      section: 'review',
    },
    {
      label:   'Food Orders',
      value:   foodSummary?.total_orders ?? '—',
      sub:     foodSummary
                 ? `₱${Number(foodSummary.total_revenue || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })} revenue`
                 : 'This month',
      accent:  '#D97706',
      icon:    <UtensilsCrossed size={16} />,
      section: 'food',
    },
  ];

  const period     = PERIOD_MAP[globalPeriod];
  const foodPeriod = FOOD_PERIOD_MAP[globalPeriod];

  return (
    <div className="an-page">

      {/* Header */}
      <div className="an-header">
        <div className="an-header-left">
          <p className="an-eyebrow">Admin Panel</p>
          <h1 className="an-title">Analytics Dashboard</h1>
          {lastUpdated && (
            <p className="an-subtitle">
              Live · updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="an-period-selector">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`an-period-btn${globalPeriod === p ? ' an-period-btn--active' : ''}`}
              onClick={() => setGlobalPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="an-divider" />

      {/* KPI Cards */}
      <div className="an-kpis">
        {KPI_CARDS.map((k, i) => (
          <button
            key={i}
            className={`an-kpi-card${activeSection === k.section ? ' an-kpi-card--active' : ''}`}
            style={{ '--accent': k.accent }}
            onClick={() => setActiveSection(k.section)}
          >
            <div className="an-kpi-top">
              <div className="an-kpi-icon" style={{ color: k.accent }}>{k.icon}</div>
            </div>
            <div className="an-kpi-value">{loading ? '…' : k.value}</div>
            <div className="an-kpi-label">{k.label}</div>
            <div className="an-kpi-sub">{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Section Tabs */}
      <div className="an-tabs">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`an-tab${activeSection === s.id ? ' an-tab--active' : ''}`}
            style={activeSection === s.id ? { color: s.accent, borderBottomColor: s.accent } : {}}
            onClick={() => setActiveSection(s.id)}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="an-section">
        {activeSection === 'booking'  && <BookingAnalytics   dashboard={d} period={period} />}
        {activeSection === 'occupancy'&& <OccupancyAnalytics dashboard={d} period={period} />}
        {activeSection === 'revenue'  && <RevenueAnalytics   period={period} />}
        {activeSection === 'room'     && <RoomPerformance    period={period} />}
        {activeSection === 'review'   && <ReviewAnalytics    stats={reviewStats} />}
        {activeSection === 'food'     && <FoodAnalytics      period={foodPeriod} />}
      </div>
    </div>
  );
}