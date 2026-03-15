/**
 * AdminDashboard.jsx
 * Central overview page for all staff roles.
 * Shows role-appropriate KPIs and quick links.
 * Matches luxury dark gold theme from Dashboard.css.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CreditCard, Star, BarChart2,
  CheckCircle2, ArrowRight, TrendingUp, BedDouble,
  LineChart,
} from 'lucide-react';
import { getStoredUser } from '../../../services/api';
import { guestApi, paymentApi, reviewApi } from '../../../services/adminApi';
import './AdminDashboard.css';

const ROLE_LABELS = {
  admin:        'Administrator',
  manager:      'Manager',
  receptionist: 'Receptionist',
  front_desk:   'Front Desk',
  housekeeping: 'Housekeeping',
  maintenance:  'Maintenance',
  security:     'Security',
};

function StatCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div className={`ad-stat-card${onClick ? ' ad-stat-card--link' : ''}`} onClick={onClick}>
      <div className="ad-stat-icon" style={{ color }}>{icon}</div>
      <div className="ad-stat-body">
        <div className="ad-stat-value">{value ?? '—'}</div>
        <div className="ad-stat-label">{label}</div>
        {sub && <div className="ad-stat-sub">{sub}</div>}
      </div>
      {onClick && <ArrowRight size={14} className="ad-stat-arrow" />}
    </div>
  );
}

function QuickLink({ icon, label, to, desc }) {
  const navigate = useNavigate();
  return (
    <button className="ad-quick-link" onClick={() => navigate(to)}>
      <span className="ad-quick-icon">{icon}</span>
      <div className="ad-quick-body">
        <span className="ad-quick-label">{label}</span>
        <span className="ad-quick-desc">{desc}</span>
      </div>
      <ArrowRight size={14} className="ad-quick-arrow" />
    </button>
  );
}

export default function AdminDashboard() {
  const navigate    = useNavigate();
  const user        = getStoredUser();
  const role        = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);
  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Staff';

  const isAdminOrManager  = ['admin', 'manager'].includes(role);
  const canViewGuests     = ['admin', 'manager', 'receptionist', 'front_desk'].includes(role);
  const canManagePayments = ['admin', 'manager', 'front_desk'].includes(role);
  const canManageReviews  = ['admin', 'manager'].includes(role);

  const [guestCount,      setGuestCount]      = useState(null);
  const [pendingPayments, setPendingPayments] = useState(null);
  const [revenue,         setRevenue]         = useState(null);
  const [hiddenReviews,   setHiddenReviews]   = useState(null);
  const [avgRating,       setAvgRating]       = useState(null);
  const [loading,         setLoading]         = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const tasks = [];

        if (canViewGuests) {
          tasks.push(
            guestApi.list({ page: 1 })
              .then(d => setGuestCount(d.count ?? (d.results ?? d).length))
              .catch(() => {})
          );
        }
        if (canManagePayments) {
          tasks.push(
            paymentApi.list({ status: 'pending', page: 1 })
              .then(d => setPendingPayments(d.count ?? (d.results ?? d).length))
              .catch(() => {})
          );
        }
        if (isAdminOrManager) {
          tasks.push(
            paymentApi.revenue({ period: 'month' })
              .then(d => setRevenue(d.net_revenue))
              .catch(() => {})
          );
          tasks.push(
            reviewApi.stats()
              .then(d => {
                setHiddenReviews(d.hidden_count);
                setAvgRating(d.avg_rating ? Number(d.avg_rating).toFixed(1) : null);
              })
              .catch(() => {})
          );
        }

        await Promise.all(tasks);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning'
    : greetingHour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="ad-page">

      {/* Header */}
      <div className="ad-header">
        <p className="ad-eyebrow">Admin Panel</p>
        <h1 className="ad-title">{greeting}, {displayName}</h1>
        <p className="ad-subtitle">
          {ROLE_LABELS[role] ?? 'Staff'} · {new Date().toLocaleDateString('en-PH', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
        <div className="ad-divider" />
      </div>

      {/* KPI Cards */}
      <div className="ad-kpis">
        {canViewGuests && (
          <StatCard
            icon={<Users size={22} />}
            label="Total Guests"
            value={loading ? '…' : guestCount?.toLocaleString()}
            sub="Registered accounts"
            color="var(--gold)"
            onClick={() => navigate('/admin/guests')}
          />
        )}
        {canManagePayments && (
          <StatCard
            icon={<CreditCard size={22} />}
            label="Pending Payments"
            value={loading ? '…' : pendingPayments}
            sub="Awaiting confirmation"
            color="#60A5FA"
            onClick={() => navigate('/admin/payments')}
          />
        )}
        {isAdminOrManager && (
          <StatCard
            icon={<TrendingUp size={22} />}
            label="Net Revenue"
            value={loading ? '…' : revenue != null ? `₱${Number(revenue).toLocaleString()}` : '—'}
            sub="This month"
            color="#6EE7B7"
            onClick={() => navigate('/admin/payments/revenue')}
          />
        )}
        {isAdminOrManager && (
          <StatCard
            icon={<Star size={22} />}
            label="Avg Rating"
            value={loading ? '…' : avgRating ? `${avgRating} ★` : '—'}
            sub={loading ? '' : `${hiddenReviews ?? 0} hidden reviews`}
            color="#FCD34D"
            onClick={() => navigate('/admin/reviews/stats')}
          />
        )}
      </div>

      {/* Quick Links */}
      <div className="ad-section">
        <div className="ad-section-head">
          <p className="ad-section-eyebrow">Quick Actions</p>
          <h2 className="ad-section-title">What would you like to do?</h2>
        </div>

        <div className="ad-quick-grid">
          {isAdminOrManager && (
            <QuickLink
              icon={<LineChart size={18} />}
              label="Analytics"
              to="/admin/analytics"
              desc="Bookings, occupancy, guests, reviews"
            />
          )}
          {canViewGuests && (
            <QuickLink
              icon={<Users size={18} />}
              label="Manage Guests"
              to="/admin/guests"
              desc="View profiles, block accounts"
            />
          )}
          {canManagePayments && (
            <QuickLink
              icon={<CreditCard size={18} />}
              label="Manage Payments"
              to="/admin/payments"
              desc="Confirm cash, view transactions"
            />
          )}
          {isAdminOrManager && (
            <QuickLink
              icon={<BarChart2 size={18} />}
              label="Revenue Summary"
              to="/admin/payments/revenue"
              desc="Charts, trends, net revenue"
            />
          )}
          {canManageReviews && (
            <QuickLink
              icon={<Star size={18} />}
              label="Moderate Reviews"
              to="/admin/reviews"
              desc="Show, hide, filter reviews"
            />
          )}
          {canManageReviews && (
            <QuickLink
              icon={<BarChart2 size={18} />}
              label="Review Stats"
              to="/admin/reviews/stats"
              desc="Ratings breakdown, top rooms"
            />
          )}
          {['admin', 'manager', 'housekeeping', 'maintenance'].includes(role) && (
            <QuickLink
              icon={<BedDouble size={18} />}
              label="Manage Rooms"
              to="/admin/rooms"
              desc="Room status, availability"
            />
          )}
        </div>
      </div>

      {/* Role info card */}
      <div className="ad-role-card">
        <div className="ad-role-icon"><CheckCircle2 size={16} /></div>
        <div className="ad-role-body">
          <span className="ad-role-title">Your access level</span>
          <span className="ad-role-desc">
            You are logged in as <strong>{ROLE_LABELS[role] ?? role}</strong>.
            {!isAdminOrManager && ' Some sections are restricted to Admin and Manager only.'}
          </span>
        </div>
      </div>

    </div>
  );
}