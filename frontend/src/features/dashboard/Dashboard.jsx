// src/features/dashboard/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getCurrentUser, getStoredUser,
  isFirstLogin, clearFirstLoginFlag,
} from '../../services/api';
import {
  MapPin, Phone, Clock, Mail, Tag,
  ArrowRight, Bed, Users, Maximize2,
} from 'lucide-react';
import { useRooms } from '../hooks/useRooms';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
import './Dashboard.css';

// ─── Helpers ──────────────────────────────────────────────────
function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function authHeaders() {
  const token = localStorage.getItem('accessToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function to12h(val) {
  if (!val) return null;
  const [hStr, mStr] = val.split(':');
  const h    = parseInt(hStr, 10);
  const m    = mStr || '00';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${ampm}`;
}

// ─── useHotelSettings ─────────────────────────────────────────
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

// ─── useFeaturedRooms ─────────────────────────────────────────
function useFeaturedRooms() {
  const [featuredRooms, setFeaturedRooms] = useState([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/rooms/featured/`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!cancelled) {
          setFeaturedRooms(Array.isArray(data) ? data : (data.results ?? []));
        }
      })
      .catch(() => { if (!cancelled) setFeaturedRooms([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { featuredRooms, loading };
}

// ─── Room Card ─────────────────────────────────────────────────
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
          <img src={primary_image.image_url} alt={`${room_type_display} Room`} className="db-room-card-img" />
        ) : (
          <div className="db-room-card-img-placeholder"><Bed size={32} /></div>
        )}
        <span className="db-room-number-badge">Room {room_number}</span>
        <span className="db-room-status-pill" style={{
          background: statusStyle.bg,
          color: statusStyle.color,
          border: `1px solid ${statusStyle.border}`,
        }}>
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
            {hasDiscount && <div className="db-room-price-orig">₱{formatPrice(price_per_night)}</div>}
            <div className="db-room-price-main">₱{formatPrice(effectivePrice)}</div>
            <div className="db-room-price-night">/ night</div>
          </div>
          <span className="db-room-cta">View <ArrowRight size={11} /></span>
        </div>
      </div>
    </Link>
  );
}

// ─── Infinite Carousel ─────────────────────────────────────────
function InfiniteCarousel({ rooms }) {
  // Duplicate so the CSS keyframe loop is seamless
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

// ─── Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [user,        setUser]        = useState(getStoredUser());
  const [loading,     setLoading]     = useState(true);
  const [showWelcome, setShowWelcome] = useState(isFirstLogin());

  // Featured room rotation state
  const [featuredIndex, setFeaturedIndex] = useState(0);

  const { rooms, loading: roomsLoading, error: roomsError } = useRooms({});
  const { settings, loading: settingsLoading } = useHotelSettings();
  const { featuredRooms, loading: featuredLoading } = useFeaturedRooms();

  // Available rooms for the carousel (unchanged)
  const availableRooms = rooms
    ? [...rooms]
        .filter(r => r.status === 'available')
        .sort((a, b) => Number(b.discount_percentage) - Number(a.discount_percentage))
    : [];

  const carouselRooms = availableRooms.length > 0 ? availableRooms : (rooms || []);

  // Featured room cycles through the /rooms/featured/ results
  const featuredRoom = featuredRooms.length > 0
    ? featuredRooms[featuredIndex % featuredRooms.length]
    : null;

  // Auto-rotate featured room every 6 seconds
  useEffect(() => {
    if (featuredRooms.length <= 1) return;
    const interval = setInterval(() => {
      setFeaturedIndex(prev => prev + 1);
    }, 6000);
    return () => clearInterval(interval);
  }, [featuredRooms.length]);

  useEffect(() => {
    fetchUserData();
    if (showWelcome) {
      setTimeout(() => { setShowWelcome(false); clearFirstLoginFlag(); }, 5000);
    }
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

  const displayName     = user?.first_name || user?.full_name?.split(' ')[0] || 'Guest';
  const checkinDisplay  = settings.checkin_time  ? `Check-in ${to12h(settings.checkin_time)}`   : 'Check-in 2:00 PM';
  const checkoutDisplay = settings.checkout_time ? `Check-out ${to12h(settings.checkout_time)}` : 'Check-out 12:00 PM';

  return (
    <div className="db-page">
      <Navbar />

      {/* Welcome banner */}
      {showWelcome && (
        <div style={{
          background: '#01000D', color: '#FAF9F6', padding: '14px 5%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'Montserrat, sans-serif', fontSize: '13px',
        }}>
          <span>Welcome to {settings.hotel_name}, <strong>{displayName}</strong>! Your account has been created.</span>
          <button
            onClick={() => { setShowWelcome(false); clearFirstLoginFlag(); }}
            style={{ background: 'none', border: 'none', color: '#FAF9F6', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
          >×</button>
        </div>
      )}

      {/* ── HERO ── */}
      <div className="db-hero">
        <div className="db-hero-inner">
          <span className="db-hero-eyebrow">Guest Dashboard</span>
          <h1 className="db-hero-name">Good to have you back, {displayName}</h1>
          <p className="db-hero-sub">Explore our rooms and manage your reservations.</p>
        </div>
      </div>

      {/* ── FEATURED ROOM ── */}
      {!featuredLoading && featuredRoom && (
        <div className="db-featured-section">
          <div className="db-featured-card" onClick={() => navigate(`/rooms/${featuredRoom.id}`)}>
            {featuredRoom.primary_image?.image_url ? (
              <img
                key={featuredRoom.id}
                src={featuredRoom.primary_image.image_url}
                alt={featuredRoom.room_type_display}
                className="db-featured-card-img"
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0A0E1A 0%, #1a2340 100%)' }} />
            )}
            <div className="db-featured-card-overlay">
              <span className="db-featured-eyebrow">Curated Recommendation</span>
              <h2 className="db-featured-title">{featuredRoom.room_type_display} Room</h2>
              <p className="db-featured-desc">
                {featuredRoom.description ||
                  `Experience the pinnacle of Cebuano hospitality in our ${featuredRoom.room_type_display?.toLowerCase()} room.${Number(featuredRoom.discount_percentage) > 0 ? ` Special rates apply — ${featuredRoom.discount_percentage}% off.` : ''}`}
              </p>
              <button
                className="db-featured-cta"
                onClick={e => { e.stopPropagation(); navigate(`/rooms/${featuredRoom.id}`); }}
              >
                Book Now <ArrowRight size={14} />
              </button>

              {/* Dot indicators — only shown when there are multiple featured rooms */}
              {featuredRooms.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                  {featuredRooms.map((_, i) => (
                    <button
                      key={i}
                      onClick={e => { e.stopPropagation(); setFeaturedIndex(i); }}
                      style={{
                        width: i === featuredIndex % featuredRooms.length ? 20 : 6,
                        height: 6,
                        background: i === featuredIndex % featuredRooms.length
                          ? '#FAF9F6'
                          : 'rgba(250,249,246,0.35)',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        borderRadius: 3,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN ── */}
      <main className="db-main">

        {/* Carousel */}
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
          {roomsError && <div className="db-rooms-message">Unable to load rooms. Please try again.</div>}
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