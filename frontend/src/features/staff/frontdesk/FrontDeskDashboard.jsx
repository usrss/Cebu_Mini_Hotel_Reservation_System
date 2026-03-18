/**
 * src/features/staff/frontdesk/FrontDeskDashboard.jsx
 *
 * Landing page for Front Desk staff.
 * Shows live stats: room counts by status, today's arrivals/departures.
 * Quick links to all Front Desk tools.
 *
 * RBAC: front_desk, admin, manager
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredUser } from '../../../services/api';
import {
  frontDeskRoomsApi,
  frontDeskBookingsApi,
  ROOM_STATUS_CONFIG,
  todayISO,
} from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

const QUICK_LINKS = [
  {
    icon: '✓',
    label: 'Guest Check-In',
    desc:  'QR scan or manual reference entry',
    to:    '/staff/check-in',
  },
  {
    icon: '📅',
    label: 'Today\'s Arrivals',
    desc:  'Arrivals and departures scheduled today',
    to:    '/staff/front-desk/today',
  },
  {
    icon: '🏨',
    label: 'Room Status Board',
    desc:  'Live view of all room statuses',
    to:    '/staff/front-desk/rooms',
  },
  {
    icon: '🚶',
    label: 'Walk-In Booking',
    desc:  'Create and pay for a new booking on the spot',
    to:    '/staff/front-desk/walk-in',
  },
  {
    icon: '📋',
    label: 'My Shifts',
    desc:  'View your scheduled shifts',
    to:    '/staff/my-shifts',
  },
  {
    icon: '📝',
    label: 'My Activity Log',
    desc:  'Your recent check-in actions',
    to:    '/staff/my-activity-logs',
  },
];

export default function FrontDeskDashboard() {
  const navigate    = useNavigate();
  const user        = getStoredUser();
  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Staff';

  const [rooms,      setRooms]      = useState([]);
  const [arrivals,   setArrivals]   = useState([]);
  const [departures, setDepartures] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const today = todayISO();

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning'
    : greetingHour < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [roomData, arrivalData, departureData] = await Promise.allSettled([
          frontDeskRoomsApi.list(),
          frontDeskBookingsApi.todayArrivals(today),
          frontDeskBookingsApi.todayDepartures(today),
        ]);
        if (roomData.status === 'fulfilled') {
          const list = Array.isArray(roomData.value)
            ? roomData.value
            : (roomData.value.results ?? []);
          setRooms(list);
        }
        if (arrivalData.status === 'fulfilled') {
          const list = Array.isArray(arrivalData.value)
            ? arrivalData.value
            : (arrivalData.value.results ?? []);
          setArrivals(list);
        }
        if (departureData.status === 'fulfilled') {
          const list = Array.isArray(departureData.value)
            ? departureData.value
            : (departureData.value.results ?? []);
          setDepartures(list);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [today]);

  // Room counts by status
  const statusCounts = Object.keys(ROOM_STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = rooms.filter((r) => r.status === s).length;
    return acc;
  }, {});

  const statItems = [
    { label: 'Available',    value: statusCounts.available,   color: 'var(--green)',  onClick: () => navigate('/staff/front-desk/rooms') },
    { label: 'Occupied',     value: statusCounts.occupied,    color: 'var(--gold)',   onClick: () => navigate('/staff/front-desk/rooms') },
    { label: 'Cleaning',     value: statusCounts.cleaning,    color: 'var(--amber)',  onClick: () => navigate('/staff/front-desk/rooms') },
    { label: 'Maintenance',  value: statusCounts.maintenance, color: 'var(--red)',    onClick: () => navigate('/staff/front-desk/rooms') },
    { label: 'Arrivals Today', value: arrivals.length,        color: 'var(--blue)',   onClick: () => navigate('/staff/front-desk/today') },
  ];

  return (
    <div className="fd-page">
      <div className="fd-inner">

        {/* Header */}
        <div className="fd-header">
          <p className="fd-eyebrow">Front Desk</p>
          <h1 className="fd-title">{greeting}, {displayName}</h1>
          <p className="fd-subtitle">
            {new Date().toLocaleDateString('en-PH', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
          <div className="fd-divider" />
        </div>

        {/* Live stats */}
        <div className="fd-stats">
          {statItems.map((s) => (
            <div key={s.label} className="fd-stat-card" onClick={s.onClick}>
              <div className="fd-stat-value" style={{ color: s.color }}>
                {loading ? '…' : s.value ?? 0}
              </div>
              <div className="fd-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Today snapshot */}
        {!loading && (arrivals.length > 0 || departures.length > 0) && (
          <div className="fd-card" style={{ marginBottom: 24 }}>
            <div className="fd-card-label">Today at a Glance</div>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--white-dim)', margin: '0 0 6px', letterSpacing: 1 }}>
                  Expected Check-ins
                </p>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: 'var(--blue)', margin: 0 }}>
                  {arrivals.length}
                </p>
              </div>
              <div style={{ width: 1, background: 'var(--gold-border)' }} />
              <div>
                <p style={{ fontSize: 11, color: 'var(--white-dim)', margin: '0 0 6px', letterSpacing: 1 }}>
                  Expected Check-outs
                </p>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: 'var(--amber)', margin: 0 }}>
                  {departures.length}
                </p>
              </div>
              <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                <button
                  className="fd-btn fd-btn-primary"
                  onClick={() => navigate('/staff/front-desk/today')}
                >
                  View Full List →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="fd-card-label" style={{ marginBottom: 14 }}>Quick Actions</div>
        <div className="fd-quick-grid">
          {QUICK_LINKS.map((q) => (
            <button key={q.to} className="fd-quick-btn" onClick={() => navigate(q.to)}>
              <div className="fd-quick-icon">{q.icon}</div>
              <div>
                <span className="fd-quick-label">{q.label}</span>
                <span className="fd-quick-desc">{q.desc}</span>
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}