// src/features/dashboard/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getCurrentUser, getStoredUser,
  isFirstLogin, clearFirstLoginFlag,
} from '../../services/api';
import {
  Tag, ArrowRight, Bed, Users, Maximize2, Calendar, Key, ChevronRight,
} from 'lucide-react';
import { useRooms } from '../hooks/useRooms';
import { useMyBookings } from '../hooks/useBookings';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
import './Dashboard.css';

// ── Import the bookings modal so the "View Details" button opens it ──
// BookingDetailModal lives inside MyBookingsPage — we lift it out here
// by re-using the same component via a simple inline version that wraps
// the MyBookingsPage modal trigger without duplicating it.
// The simplest correct fix: navigate to /bookings/my and pass the id
// via state so the modal auto-opens, OR just link to the bookings list.
// Since the route /bookings/my/:id no longer exists, we navigate to
// /bookings/my (the list) which has the modal. We pass openId via state
// so MyBookingsPage can auto-open the modal on mount.

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function authHeaders() {
  const token = localStorage.getItem('accessToken');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function to12h(val) {
  if (!val) return null;
  const [hStr, mStr] = val.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${ampm}`;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const SETTINGS_DEFAULTS = {
  checkin_time:        '14:00',
  checkout_time:       '12:00',
  hotel_name:          'Cebu Mini Hotel',
  hotel_address:       '123 Colon St., Cebu City, 6000',
  hotel_phone:         '+63 32 123 4567',
  hotel_email:         '',
  hotel_description:   '',
  cancellation_policy: 'Free cancellation up to 48 hours before check-in.',
  terms_url:           '/terms-and-conditions',
  privacy_url:         '/privacy-policy',
};

function useHotelSettings() {
  const [settings, setSettings] = useState(null);
  const [loading,  setLoading]  = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/rooms/hotel/settings/`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (!cancelled) setSettings({ ...SETTINGS_DEFAULTS, ...data }); })
      .catch(() => { if (!cancelled) setSettings({ ...SETTINGS_DEFAULTS }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { settings: settings || SETTINGS_DEFAULTS, loading };
}

function useFeaturedRooms() {
  const [featuredRooms, setFeaturedRooms] = useState([]);
  const [loading,       setLoading]       = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/rooms/featured/`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (!cancelled) setFeaturedRooms(Array.isArray(data) ? data : (data.results ?? [])); })
      .catch(() => { if (!cancelled) setFeaturedRooms([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { featuredRooms, loading };
}

/* ── Upcoming stay card ──────────────────────────────────────────────
   FIX: The card's onClick navigated to /bookings/my/:id which no longer
   exists. We now navigate to /bookings/my and pass { openBookingId: id }
   in router state. MyBookingsPage reads this on mount and auto-opens
   the modal for that booking.
──────────────────────────────────────────────────────────────────── */
function UpcomingStayCard({ booking }) {
  const navigate  = useNavigate();
  const daysUntil = Math.ceil((new Date(booking.check_in) - new Date()) / 86400000);

  // Navigate to the bookings list and pass the id so the modal auto-opens
  const handleViewDetails = (e) => {
    e.stopPropagation();
    navigate('/bookings/my', { state: { openBookingId: booking.id } });
  };

  return (
    <div className="db-upcoming-card">
      <div className="db-upcoming-inner">
        <div className="db-upcoming-left">
          <span className="db-upcoming-eyebrow">Upcoming Stay</span>
          <h3 className="db-upcoming-room">{booking.room_type} Room #{booking.room_number}</h3>
          <div className="db-upcoming-dates">
            <Calendar size={13} />
            <span>{booking.check_in} → {booking.check_out}</span>
            <span className="db-upcoming-nights">
              {booking.nights} night{booking.nights !== 1 ? 's' : ''}
            </span>
          </div>
          {booking.checkin_pin && (
            <div className="db-upcoming-pin">
              <Key size={12} />
              <span>PIN:</span>
              <strong>{booking.checkin_pin}</strong>
            </div>
          )}
        </div>

        <div className="db-upcoming-right">
          {daysUntil >= 0 && (
            <div className="db-upcoming-countdown">
              <span className="db-upcoming-days">{daysUntil}</span>
              <span className="db-upcoming-days-label">days away</span>
            </div>
          )}
          <div className="db-upcoming-ref">
            <span className="db-upcoming-ref-label">Ref</span>
            <span className="db-upcoming-ref-val">{booking.reference_number || '—'}</span>
          </div>
          {/* FIX: button navigates to /bookings/my with openBookingId state */}
          <button className="db-upcoming-cta" onClick={handleViewDetails}>
            View Details <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Room Card ─────────────────────────────────────────────────────── */
function DashboardRoomCard({ room }) {
  const {
    id, room_number, room_type_display, bed_type_display, capacity,
    price_per_night, discounted_price, discount_percentage,
    status, status_display, size_sqm, primary_image,
  } = room;

  const hasDiscount    = Number(discount_percentage) > 0;
  const effectivePrice = hasDiscount ? discounted_price : price_per_night;

  const statusStyle = {
    available:   { bg: 'rgba(5,150,105,0.10)',  color: '#059669', border: 'rgba(5,150,105,0.25)' },
    occupied:    { bg: 'rgba(1,0,13,0.06)',      color: '#535252', border: 'rgba(1,0,13,0.15)'   },
    maintenance: { bg: 'rgba(1,0,13,0.04)',      color: '#909090', border: 'rgba(1,0,13,0.10)'   },
    cleaning:    { bg: 'rgba(1,0,13,0.06)',      color: '#535252', border: 'rgba(1,0,13,0.15)'   },
  }[status] || { bg: 'rgba(1,0,13,0.04)', color: '#909090', border: 'rgba(1,0,13,0.10)' };

  return (
    <Link to={`/rooms/${id}`} className="db-room-card">
      <div className="db-room-card-img-wrap">
        {primary_image?.image_url ? (
          <img
            src={primary_image.image_url}
            alt={`${room_type_display} Room`}
            className="db-room-card-img"
          />
        ) : (
          <div className="db-room-card-img-placeholder"><Bed size={32} /></div>
        )}
        <span className="db-room-number-badge">Room {room_number}</span>
        <span
          className="db-room-status-pill"
          style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}
        >
          {status_display}
        </span>
        {hasDiscount && (
          <span className="db-room-discount-pill">
            <Tag size={9} /> {Number(discount_percentage)}% Off
          </span>
        )}
      </div>
      <div className="db-room-card-body">
        <h3 className="db-room-type">{room_type_display} Room</h3>
        <div className="db-room-specs">
          <span><Users size={11} /> {capacity} {capacity === 1 ? 'Guest' : 'Guests'}</span>
          <span><Bed size={11} /> {bed_type_display}</span>
          {size_sqm && <span><Maximize2 size={11} /> {size_sqm}m²</span>}
        </div>
        <div className="db-room-card-footer">
          <div className="db-room-price">
            {hasDiscount && (
              <div className="db-room-price-orig">₱{formatPrice(price_per_night)}</div>
            )}
            <div className="db-room-price-main">₱{formatPrice(effectivePrice)}</div>
            <div className="db-room-price-night">/ night</div>
          </div>
          <span className="db-room-cta">View <ArrowRight size={11} /></span>
        </div>
      </div>
    </Link>
  );
}

function InfiniteCarousel({ rooms }) {
  const items = [...rooms, ...rooms];
  return (
    <div className="db-carousel-track-outer">
      <div className="db-carousel-track">
        {items.map((room, i) => (
          <DashboardRoomCard key={`${room.id}-${i}`} room={room} />
        ))}
      </div>
    </div>
  );
}

/* ── Dashboard ──────────────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [user,          setUser]          = useState(getStoredUser());
  const [loading,       setLoading]       = useState(true);
  const [showWelcome,   setShowWelcome]   = useState(isFirstLogin());
  const [featuredIndex, setFeaturedIndex] = useState(0);

  const { rooms, loading: roomsLoading, error: roomsError } = useRooms({});
  const { settings } = useHotelSettings();
  const { featuredRooms, loading: featuredLoading } = useFeaturedRooms();
  const { bookings, loading: bookingsLoading } = useMyBookings();

  const today = new Date().toISOString().split('T')[0];
  const upcomingBooking = bookings
    ?.filter(b => b.status === 'confirmed' && b.check_in >= today)
    ?.sort((a, b) => new Date(a.check_in) - new Date(b.check_in))[0] || null;

  const availableRooms = rooms
    ? [...rooms]
        .filter(r => r.status === 'available')
        .sort((a, b) => Number(b.discount_percentage) - Number(a.discount_percentage))
    : [];
  const carouselRooms  = availableRooms.length > 0 ? availableRooms : (rooms || []);
  const featuredRoom   = featuredRooms.length > 0
    ? featuredRooms[featuredIndex % featuredRooms.length]
    : null;

  useEffect(() => {
    if (featuredRooms.length <= 1) return;
    const interval = setInterval(() => setFeaturedIndex(p => p + 1), 6000);
    return () => clearInterval(interval);
  }, [featuredRooms.length]);

  useEffect(() => {
    fetchUserData();
    if (showWelcome) setTimeout(() => { setShowWelcome(false); clearFirstLoginFlag(); }, 5000);
  }, []);

  const fetchUserData = async () => {
    try {
      const data = await getCurrentUser();
      setUser(data);
    } catch (err) {
      if (err.response?.status === 401) navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="db-page">
        <Navbar />
        <div className="db-loading">
          <div className="db-spinner" />
          <p>Loading your experience</p>
        </div>
      </div>
    );
  }

  const displayName = user?.first_name || user?.full_name?.split(' ')[0] || 'Guest';

  return (
    <div className="db-page">
      <Navbar />

      {showWelcome && (
        <div style={{
          background: '#01000D', color: '#FAF9F6', padding: '14px 5%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'Montserrat, sans-serif', fontSize: '13px',
        }}>
          <span>
            Welcome to {settings.hotel_name}, <strong>{displayName}</strong>! Your account has been created.
          </span>
          <button
            onClick={() => { setShowWelcome(false); clearFirstLoginFlag(); }}
            style={{ background: 'none', border: 'none', color: '#FAF9F6', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Hero */}
      <div className="db-hero">
        <div className="db-hero-inner">
          <span className="db-hero-eyebrow">Guest Dashboard</span>
          <h1 className="db-hero-name">Good to have you, {displayName}</h1>
          <p className="db-hero-sub">Explore our rooms and manage your reservations.</p>
        </div>
      </div>

      {/* Upcoming stay card — above featured section */}
      {!bookingsLoading && upcomingBooking && (
        <div className="db-featured-section" style={{ marginBottom: 0, marginTop: 28 }}>
          <UpcomingStayCard booking={upcomingBooking} />
        </div>
      )}

      {/* Featured room */}
      {!featuredLoading && featuredRoom && (
        <div className="db-featured-section">
          <div
            className="db-featured-card"
            onClick={() => navigate(`/rooms/${featuredRoom.id}`)}
          >
            {featuredRoom.primary_image?.image_url ? (
              <img
                key={featuredRoom.id}
                src={featuredRoom.primary_image.image_url}
                alt={featuredRoom.room_type_display}
                className="db-featured-card-img"
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0A0E1A 0%,#1a2340 100%)' }} />
            )}
            <div className="db-featured-card-overlay">
              <span className="db-featured-eyebrow">Curated Recommendation</span>
              <h2 className="db-featured-title">{featuredRoom.room_type_display} Room</h2>
              <p className="db-featured-desc">
                {featuredRoom.description ||
                  `Experience the pinnacle of Cebuano hospitality in our ${featuredRoom.room_type_display?.toLowerCase()} room.` +
                  (Number(featuredRoom.discount_percentage) > 0
                    ? ` Special rates apply — ${featuredRoom.discount_percentage}% off.`
                    : '')}
              </p>
              <button
                className="db-featured-cta"
                onClick={e => { e.stopPropagation(); navigate(`/rooms/${featuredRoom.id}`); }}
              >
                Book Now <ArrowRight size={14} />
              </button>
              {featuredRooms.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                  {featuredRooms.map((_, i) => (
                    <button
                      key={i}
                      onClick={e => { e.stopPropagation(); setFeaturedIndex(i); }}
                      style={{
                        width:  i === featuredIndex % featuredRooms.length ? 20 : 6,
                        height: 6,
                        background: i === featuredIndex % featuredRooms.length
                          ? '#FAF9F6' : 'rgba(250,249,246,0.35)',
                        border: 'none', padding: 0, cursor: 'pointer',
                        transition: 'all 0.3s ease', borderRadius: 3,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main carousel */}
      <main className="db-main">
        <section className="db-carousel-section">
          <div className="db-section-head-row">
            <div>
              <span className="db-section-eyebrow">Available Rooms</span>
              <h2 className="db-section-title">Browse Our Rooms</h2>
            </div>
            <Link to="/rooms" className="db-view-all-btn">View All</Link>
          </div>

          {roomsLoading && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '40px 0', color: '#909090', fontSize: 12 }}>
              <div className="db-spinner" /> Finding the best rooms…
            </div>
          )}
          {roomsError && (
            <div className="db-rooms-message">Unable to load rooms. Please try again.</div>
          )}
          {!roomsLoading && !roomsError && carouselRooms.length === 0 && (
            <div className="db-rooms-message">No rooms available right now.</div>
          )}
          {!roomsLoading && !roomsError && carouselRooms.length > 0 && (
            <InfiniteCarousel rooms={carouselRooms} />
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}