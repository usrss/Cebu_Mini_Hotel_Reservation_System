/**
 * src/features/staff/frontdesk/FrontDeskDashboard.jsx
 *
 * Landing page for Front Desk staff.
 * Redesigned: Modern light theme — clean, minimal, professional.
 * RBAC: front_desk, admin, manager
 *
 * Changes:
 *  - Removed all ArrowRight icons
 *  - Stat cards now open a modal (RoomStatusModal) instead of navigating directly
 *  - Stat card labels show full descriptive names
 *  - All text forced to black (#01000D) — no colored text on labels/values
 *  - No border lines on cards
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BedDouble, Users, Wrench, CheckCircle2, CalendarCheck,
  UserCheck, ClipboardList, CalendarDays,
  CalendarRange, Activity, X,
} from 'lucide-react';
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
    icon: <UserCheck size={20} />,
    label: 'Guest Check-In',
    desc:  'QR scan or manual reference entry',
    to:    '/staff/check-in',
  },
  {
    icon: <CalendarDays size={20} />,
    label: "Today's Arrivals",
    desc:  'Arrivals and departures scheduled today',
    to:    '/staff/front-desk/today',
  },
  {
    icon: <BedDouble size={25} />,
    label: 'Room Status Board',
    desc:  'Live view of all room statuses',
    to:    '/staff/front-desk/rooms',
  },
  {
    icon: <ClipboardList size={25} />,
    label: 'Walk-In Booking',
    desc:  'Cash and card — no guest account required',
    to:    '/staff/front-desk/walk-in',
  },
  {
    icon: <CalendarRange size={25} />,
    label: 'Extend Stay',
    desc:  'Extend an active booking',
    to:    '/staff/front-desk/extend',
  },
  {
    icon: <CalendarCheck size={25} />,
    label: 'My Shifts',
    desc:  'View your scheduled shifts',
    to:    '/staff/my-shifts',
  },
  {
    icon: <Activity size={20} />,
    label: 'My Activity Log',
    desc:  'Your recent check-in actions',
    to:    '/staff/my-activity-logs',
  },
];

const STATUS_STRIP_COLOR = {
  available:   '#0D9488',
  occupied:    '#3B5BDB',
  cleaning:    '#B45309',
  maintenance: '#DC2626',
  arrivals:    '#2563EB',
};

function RoomStatusModal({ open, onClose, title, rooms, onViewAll }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(1,0,13,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff',
        borderRadius: 20,
        width: '100%',
        maxWidth: 480,
        maxHeight: '80vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(1,0,13,0.18)',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 16px',
          borderBottom: '1px solid #F2F3F7',
          background: '#F2F3F7',
        }}>
          <span style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 18, fontWeight: 400, color: '#01000D',
          }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: '#E4E6ED', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#01000D', fontSize: 16,
            }}
          >
            <X size={14} />
          </button>
        </div>
        {/* Modal body */}
        <div style={{ overflowY: 'auto', padding: '14px 22px 18px' }}>
          {rooms.length === 0 ? (
            <p style={{ fontSize: 13, color: '#7A7987', textAlign: 'center', padding: '24px 0' }}>
              No rooms in this category.
            </p>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid #F2F3F7',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: 18, color: '#01000D',
                  }}>
                    {room.room_number}
                  </span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#01000D' }}>
                      {room.room_type}
                    </div>
                    <div style={{ fontSize: 11, color: '#7A7987', marginTop: 1 }}>
                      Floor {room.floor} · {room.bed_type} bed
                    </div>
                  </div>
                </div>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: STATUS_STRIP_COLOR[room.status] || '#A9A8B3',
                  flexShrink: 0,
                }} />
              </div>
            ))
          )}
        </div>
        {/* Modal footer */}
        <div style={{
          padding: '12px 22px 16px',
          borderTop: '1px solid #F2F3F7',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 10,
              border: '1.5px solid #E4E6ED', background: '#fff',
              color: '#01000D', fontSize: 12, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={() => { onClose(); onViewAll(); }}
            style={{
              padding: '9px 16px', borderRadius: 10,
              border: '1.5px solid #01000D', background: '#01000D',
              color: '#fff', fontSize: 12, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}
          >
            View Room Board
          </button>
        </div>
      </div>
    </div>
  );
}

function GlanceModal({ open, onClose, arrivals, departures, onViewFull }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(1,0,13,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 20,
        width: '100%', maxWidth: 440,
        boxShadow: '0 8px 40px rgba(1,0,13,0.18)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 16px',
          borderBottom: '1px solid #F2F3F7', background: '#F2F3F7',
        }}>
          <span style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 18, fontWeight: 400, color: '#01000D',
          }}>
            Today at a Glance
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: '#E4E6ED', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '22px 22px 8px' }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'stretch' }}>
            <div style={{
              flex: 1, background: '#F2F3F7', borderRadius: 12,
              padding: '16px 18px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#01000D', margin: '0 0 6px' }}>
                Expected Check-ins
              </p>
              <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: '#01000D', margin: 0 }}>
                {arrivals.length}
              </p>
            </div>
            <div style={{
              flex: 1, background: '#F2F3F7', borderRadius: 12,
              padding: '16px 18px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#01000D', margin: '0 0 6px' }}>
                Expected Check-outs
              </p>
              <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: '#01000D', margin: 0 }}>
                {departures.length}
              </p>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 22px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 10,
              border: '1.5px solid #E4E6ED', background: '#fff',
              color: '#01000D', fontSize: 12, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={() => { onClose(); onViewFull(); }}
            style={{
              padding: '9px 16px', borderRadius: 10,
              border: '1.5px solid #01000D', background: '#01000D',
              color: '#fff', fontSize: 12, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}
          >
            View Full Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FrontDeskDashboard() {
  const navigate    = useNavigate();
  const user        = getStoredUser();
  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Staff';

  const [rooms,      setRooms]      = useState([]);
  const [arrivals,   setArrivals]   = useState([]);
  const [departures, setDepartures] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const [modalOpen,   setModalOpen]   = useState(false);
  const [modalStatus, setModalStatus] = useState(null);
  const [glanceOpen,  setGlanceOpen]  = useState(false);

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

  const statusCounts = Object.keys(ROOM_STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = rooms.filter((r) => r.status === s).length;
    return acc;
  }, {});

  const statItems = [
    {
      label:       'Available Rooms',
      sub:         'Ready to book',
      value:       statusCounts.available,
      iconColor:   '#000000',
      icon:        <CheckCircle2 size={30} />,
      modalStatus: 'available',
    },
    {
      label:       'Occupied Rooms',
      sub:         'Guests checked in',
      value:       statusCounts.occupied,
      iconColor:   '#000000',
      icon:        <Users size={30} />,
      modalStatus: 'occupied',
    },
    {
      label:       'Rooms Cleaning',
      sub:         'In housekeeping',
      value:       statusCounts.cleaning,
      iconColor:   '#000000',
      icon:        <BedDouble size={30} />,
      modalStatus: 'cleaning',
    },
    {
      label:       'Maintenance',
      sub:         'Under repair',
      value:       statusCounts.maintenance,
      iconColor:   '#000000',
      icon:        <Wrench size={30} />,
      modalStatus: 'maintenance',
    },
    {
      label:       'Schedule Today',
      sub:         'Expected check-ins',
      value:       arrivals.length,
      iconColor:   '#000000',
      icon:        <CalendarCheck size={30} />,
      modalStatus: 'arrivals',
    },
  ];

  const modalRooms = modalStatus === 'arrivals'
    ? arrivals.map((b) => ({
        id:         b.id,
        room_number: b.room_number,
        room_type:   b.room_type,
        floor:       b.room_floor ?? '—',
        bed_type:    b.room_bed_type ?? '—',
        status:      'arrivals',
      }))
    : rooms.filter((r) => r.status === modalStatus);

  const modalTitle = statItems.find((s) => s.modalStatus === modalStatus)?.label ?? '';

  function openStatModal(status) {
    setModalStatus(status);
    setModalOpen(true);
  }

  return (
    <div className="fd-page">
      <div className="fd-inner">

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 'clamp(22px, 2.5vw, 30px)',
            fontWeight: 400,
            color: '#01000D',
            margin: '0 0 4px',
            letterSpacing: '-0.01em',
          }}>
            {greeting}, {displayName}
          </h1>
          <p style={{ fontSize: 13, color: '#52515E', margin: 0 }}>
            {new Date().toLocaleDateString('en-PH', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>

        {/* Live stats */}
        <div className="fd-stats">
          {statItems.map((s) => (
            <div
              key={s.label}
              className="fd-stat-card"
              onClick={() => openStatModal(s.modalStatus)}
              style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
            >
              {/* top color strip */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: s.stripColor,
                borderRadius: '14px 14px 0 0',
              }} />
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginBottom: 12,
                marginTop: 4,

              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: s.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: s.iconColor,
                 marginRight: 60,
                }}>
                  {s.icon}
                </div>
              </div>
              <div className="fd-stat-value" style={{ color: '#01000D' }}>
                {loading ? '—' : s.value ?? 0}
              </div>
              <div className="fd-stat-label" style={{ color: '#01000D' }}>{s.label}</div>
              {s.sub && (
                <div className="fd-stat-sub" style={{ color: '#52515E' }}>{s.sub}</div>
              )}
            </div>
          ))}
        </div>

{/* Today at a Glance - Fixed & Centered */}
{!loading && (arrivals.length > 0 || departures.length > 0) && (
  <div
    className="fd-card"
    style={{
      marginBottom: 24,
      padding: '28px 32px',
    }}
  >
    {/* Header */}
    <p
      className="fd-card-label"
      style={{
        marginBottom: 20,
        color: '#01000D',
        fontSize: '10px',
        fontWeight: 700,
        textAlign: 'center',
        letterSpacing: '0.12em',
        textTransform: 'uppercase'
      }}
    >
      TODAY AT A GLANCE
    </p>

    {/* Main Content - Always centered */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 48,
      flexWrap: 'nowrap'   // ← Important: prevent wrapping
    }}>

      {/* Expected Check-ins */}
      <div style={{ textAlign: 'center', flex: 1, minWidth: 160 }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#52515E',
          marginBottom: 8
        }}>
          EXPECTED CHECK-INS
        </div>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 48,
          fontWeight: 400,
          color: '#01000D',
          lineHeight: 1
        }}>
          {arrivals.length}
        </div>
      </div>

      {/* Sharp Vertical Line */}
      <div style={{
        width: '1.5px',           // Slightly thicker for clarity
        height: '78px',
        background: '#D1D5DB',    // Better contrast than #E4E6ED
        flexShrink: 0
      }} />

      {/* Expected Check-outs */}
      <div style={{ textAlign: 'center', flex: 1, minWidth: 160 }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#52515E',
          marginBottom: 8
        }}>
          EXPECTED CHECK-OUTS
        </div>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 48,
          fontWeight: 400,
          color: '#01000D',
          lineHeight: 1
        }}>
          {departures.length}
        </div>
      </div>
    </div>

    {/* Button - Centered */}
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      marginTop: 26
    }}>
      <button
        className="fd-btn fd-btn-primary"
        onClick={() => setGlanceOpen(true)}
        style={{
          padding: '11px 28px',
          fontSize: '13px',
          fontWeight: 600
        }}
      >
        View Full List
      </button>
    </div>
  </div>
)}

        {/* Quick links */}
        <p className="fd-card-label" style={{ marginBottom: 14, color: '#01000D' }}>
          Quick Actions
        </p>
        <div className="fd-quick-grid">
          {QUICK_LINKS.map((q) => (
            <button key={q.to} className="fd-quick-btn" onClick={() => navigate(q.to)}>
              <div className="fd-quick-icon">{q.icon}</div>
              <div>
                <span className="fd-quick-label" style={{ color: '#01000D' }}>{q.label}</span>
                <span className="fd-quick-desc" style={{ color: '#52515E' }}>{q.desc}</span>
              </div>
            </button>
          ))}
        </div>

      </div>

      {/* Room Status Modal */}
      <RoomStatusModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`${modalTitle} (${modalRooms.length})`}
        rooms={modalRooms}
        onViewAll={() => navigate('/staff/front-desk/rooms')}
      />

      {/* Glance Modal */}
      <GlanceModal
        open={glanceOpen}
        onClose={() => setGlanceOpen(false)}
        arrivals={arrivals}
        departures={departures}
        onViewFull={() => navigate('/staff/front-desk/today')}
      />
    </div>
  );
}