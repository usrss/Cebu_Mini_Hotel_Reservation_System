// src/features/home/HotelHomepage.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRooms, useAvailability } from '../hooks/useRooms';
import RoomCard from '../rooms/RoomCard';
import './HotelHomepage.css';
import AuthModal from '../auth/AuthModal';



/* ─────────────────────────── STATIC DISPLAY DATA ─────────────────────────── */
// Used only for the editorial "Rooms & Suites" showcase section and gallery.
// Search results always come from the real API via useRooms / useAvailability.

const FEATURED_ROOMS = [
  { id: 'f1', name: 'The Azure Loft',        price: '₱3,500', rating: 5, image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80', desc: 'Breathtaking sea views with a private balcony — a masterclass in quiet luxury featuring local artisan textures and panoramic ocean panoramas.', badge: 'SIGNATURE SUITE', size: 'tall' },
  { id: 'f2', name: 'Stone Terrace Room',    price: '₱2,800', rating: 5, image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1200&q=80', desc: 'Classic Philippine heritage meets modern minimalism, with king-size comfort and refined executive amenities.', badge: null, size: 'short' },
  { id: 'f3', name: 'Royal Penthouse',       price: '₱7,200', rating: 5, image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',  desc: 'The pinnacle of luxury living in Cebu.', badge: null, size: 'sm' },
  { id: 'f4', name: 'Garden Terrace Room',   price: '₱2,200', rating: 4, image: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=800&q=80',  desc: 'Serene garden views with lush surrounding greenery.', badge: null, size: 'sm' },
  { id: 'f5', name: 'Classic Standard Room', price: '₱1,800', rating: 4, image: 'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=800&q=80',  desc: 'Timeless comfort at an exceptional value.', badge: null, size: 'sm' },
];

const AMENITIES = [
  { icon: <DiningIcon />, title: 'Terra Dining',  desc: 'Sustainable gastronomy highlighting the rich flavors of the Visayas region, crafted by award-winning chefs.' },
  { icon: <PoolIcon />,   title: 'Infinity Pool',  desc: 'Float above the city skyline — panoramic views, open 24 hours exclusively for hotel guests.' },
  { icon: <EventIcon />,  title: 'Event Hosting', desc: 'Elegant ballrooms and private function rooms for weddings, corporate events, and intimate celebrations.' },
];

const GALLERY = [
  { src: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=900&q=80',  label: 'Lobby & Reception' },
  { src: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=700&q=80',  label: 'Royal Suite' },
  { src: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=700&q=80', label: 'Fine Dining' },
  { src: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=700&q=80', label: 'Spa & Wellness' },
  { src: 'https://images.unsplash.com/photo-1439130490301-25e322d88054?w=700&q=80', label: 'Infinity Pool' },
  { src: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=700&q=80', label: 'Events Hall' },
];

const REVIEWS = [
  { name: 'Maria Santos',   rating: 5, date: 'February 2026',  text: 'Absolutely magnificent stay. The staff went above and beyond, and the room was immaculate. Made us feel like royalty. Will return every anniversary.', avatar: 'MS', location: 'Manila, Philippines' },
  { name: 'James Whitmore', rating: 5, date: 'January 2026',   text: 'Cebu Mini Hotel exceeded every expectation. Woke up to stunning views, had the most peaceful sleep of my life. A hidden gem in the heart of Cebu.',  avatar: 'JW', location: 'Sydney, Australia' },
  { name: 'Linh Nguyen',    rating: 5, date: 'January 2026',   text: 'Impeccable service and stunning rooms. The attention to detail is extraordinary — from the handwritten welcome note to the perfectly pressed linens.',   avatar: 'LN', location: 'Ho Chi Minh, Vietnam' },
  { name: 'Carlos Reyes',   rating: 5, date: 'December 2025',  text: 'A truly unforgettable experience. The rooftop pool at sunset was breathtaking. The concierge arranged everything flawlessly, including a private island day trip.', avatar: 'CR', location: 'Madrid, Spain' },
  { name: 'Ayaka Tanaka',   rating: 4, date: 'December 2025',  text: 'Beautifully designed hotel with a warm, personal touch. The spa was the highlight — the hilot massage left me completely renewed.',                       avatar: 'AT', location: 'Tokyo, Japan' },
  { name: 'Sophie Martin',  rating: 5, date: 'November 2025',  text: "From check-in to check-out, every moment felt curated. The room was immaculate, the views stunning, and the staff treated us like family.",               avatar: 'SM', location: 'Paris, France' },
];

const RATING_BARS = [
  { label: 'Cleanliness', val: '5.0' },
  { label: 'Comfort',     val: '4.9' },
  { label: 'Location',    val: '4.8' },
  { label: 'Service',     val: '5.0' },
];

const FAQS = [
  { q: 'What are the check-in and check-out times?',  a: 'Standard check-in is at 2:00 PM and check-out is at 12:00 PM noon. Early check-in and late check-out are available upon request, subject to availability. Contact our concierge team in advance to arrange a seamless experience.' },
  { q: 'Is breakfast included in the room rate?',      a: 'Select room categories include complimentary daily breakfast for two guests. Please verify your room package at booking. Our in-house restaurant, The Cebu Table, opens at 6:30 AM daily with an extensive Filipino and international spread.' },
  { q: 'Do you offer airport transfer services?',      a: 'Yes. We provide 24/7 luxury airport transfers to and from Mactan-Cebu International Airport. Rates vary by vehicle type. We recommend booking at least 24 hours in advance through our concierge desk.' },
  { q: 'Is the hotel pet-friendly?',                   a: 'We welcome small pets under 10 kg in select Garden Terrace rooms with prior arrangement. A refundable security deposit is required. Please inform us at the time of booking so we can prepare your room accordingly.' },
  { q: 'What payment methods are accepted?',           a: 'We accept all major credit cards (Visa, Mastercard, AMEX, JCB), GCash, Maya, bank transfers, and cash in Philippine Peso. Invoice billing is available for corporate accounts and group bookings.' },
  { q: 'What is your cancellation policy?',            a: 'Reservations cancelled 48 hours or more before check-in receive a full refund. Cancellations within 48 hours are subject to a one-night charge. No-shows are charged the full reservation amount.' },
];

const NAV_SECTION_MAP = {
  Rooms:    'hp-rooms',
  Services: 'hp-services',
  Gallery:  'hp-gallery',
  Reviews:  'hp-reviews',
  FAQs:     'hp-faqs',
  Contact:  'hp-contact',
};

// Room type options — values must match your backend's room_type field
const ROOM_TYPES = [
  { value: '',           label: 'All Rooms' },
  { value: 'standard',  label: 'Standard' },
  { value: 'deluxe',    label: 'Deluxe' },
  { value: 'suite',     label: 'Suite' },
  { value: 'family',    label: 'Family' },
  { value: 'penthouse', label: 'Penthouse' },
];

/* ─────────────────────────── SVG ICONS ─────────────────────────── */

function DiningIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
    </svg>
  );
}
function PoolIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h20"/><path d="M2 16c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><circle cx="12" cy="6" r="2"/><path d="M12 8v4"/>
    </svg>
  );
}
function EventIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  );
}
function ChevronDownIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}
function StarIcon({ filled, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#C9A84C' : 'rgba(1,0,13,0.12)'}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}
function SearchIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}
function ArrowRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}
function LockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

/* ─────────────────────────── HELPERS ─────────────────────────── */

function StarRating({ count, size = 14 }) {
  return (
    <div className="hp-stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon key={i} filled={i < count} size={size} />
      ))}
    </div>
  );
}

const today    = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const fmt = (d) => d.toISOString().split('T')[0];

/* ─────────────────────────── SEARCH RESULTS SECTION ─────────────────────────── */

function SearchResultsSection({ rooms, loading, error, isAuthenticated, onSeeMore, searchParams, hasDateRange }) {
  const nights = (hasDateRange && searchParams.checkIn && searchParams.checkOut)
    ? Math.max(1, Math.ceil((new Date(searchParams.checkOut) - new Date(searchParams.checkIn)) / 86400000))
    : 1;

  return (
    <section className="hp-search-results-section">
      <div className="hp-max">

        {/* Header */}
        <div className="hp-search-results-header">
          <span className="hp-search-results-eyebrow">Search Results</span>

          {loading ? (
            <h2 className="hp-search-results-title">Checking availability…</h2>
          ) : error ? (
            <h2 className="hp-search-results-title">Something went wrong</h2>
          ) : (
            <h2 className="hp-search-results-title">
              {rooms.length === 0
                ? 'No Rooms Available'
                : `${rooms.length} Room${rooms.length !== 1 ? 's' : ''} Found`}
            </h2>
          )}

          {!loading && hasDateRange && searchParams.checkIn && searchParams.checkOut && (
            <p className="hp-search-results-sub">
              {new Date(searchParams.checkIn).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
              {' — '}
              {new Date(searchParams.checkOut).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
              {' · '}{nights} night{nights !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Loading spinner */}
        {loading && (
          <div className="hp-search-loading">
            <div className="hp-search-spinner" />
            <p>Searching real-time availability…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="hp-search-no-results">
            <div className="hp-search-no-results-icon"><SearchIcon size={28} /></div>
            <p className="hp-search-no-results-title">Unable to load rooms</p>
            <p className="hp-search-no-results-sub">Please try again or adjust your search criteria.</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && rooms.length === 0 && (
          <div className="hp-search-no-results">
            <div className="hp-search-no-results-icon"><SearchIcon size={28} /></div>
            <p className="hp-search-no-results-title">No rooms match your criteria</p>
            <p className="hp-search-no-results-sub">
              {hasDateRange
                ? 'No rooms are available for your selected dates. Try different dates or a different room type.'
                : 'Try adjusting the room type or guest count.'}
            </p>
          </div>
        )}

        {/* Results — max 2 real RoomCards from the API */}
        {!loading && !error && rooms.length > 0 && (
          <>
            <div className="hp-search-rooms-grid">
              {rooms.slice(0, 2).map((room) => (
                <div key={room.id} className="hp-src-roomcard-wrap">
                  {/*
                    RoomCard already handles: image, status badge, discount badge,
                    360° badge, price, specs, and a "View Details" link to /rooms/:id.
                    We apply a thin auth overlay on top for unauthenticated users.
                  */}
                  <RoomCard room={room} />

                  {!isAuthenticated && (
                    <div className="hp-src-auth-overlay">
                      <div className="hp-src-auth-overlay-inner">
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* See More */}
            <div className="hp-search-see-more-wrap">
              {rooms.length > 2 && (
                <p className="hp-search-more-count">
                  +{rooms.length - 2} more room{rooms.length - 2 !== 1 ? 's' : ''} available
                </p>
              )}

              <button className="hp-search-see-more-btn" onClick={onSeeMore}>
                {isAuthenticated
                  ? <><span>View All Available Rooms</span> <ArrowRightIcon size={15} /></>
                  : <><LockIcon size={14} /> <span>Sign In to See All Rooms</span> <ArrowRightIcon size={15} /></>
                }
              </button>

              {!isAuthenticated && (
                <p className="hp-search-auth-hint">
                  Create a free account to unlock all available rooms and complete your booking
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function HotelHomepage() {
  const navigate = useNavigate();
  const [authModal, setAuthModal] = useState(null);
  const [scrolled, setScrolled]             = useState(false);
  const [activeSection, setActiveSection]   = useState('');
  const [visibleSections, setVisibleSections] = useState({});
  const [openFaq, setOpenFaq]               = useState(null);
  const [contactForm, setContactForm]       = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [contactSent, setContactSent]       = useState(false);
  const [searchExecuted, setSearchExecuted] = useState(false);

  /*
    Search form state.
    Field names deliberately match what useRooms / useAvailability / RoomFilters use:
      room_type, check_in, check_out, min_capacity
  */
  const [search, setSearch] = useState({
    room_type:    '',
    check_in:     fmt(today),
    check_out:    fmt(tomorrow),
    min_capacity: '',
  });

  const isAuthenticated = !!(
    localStorage.getItem('accessToken')  || sessionStorage.getItem('accessToken') ||
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
  );

  /* ── Real API hooks — same pattern as RoomListPage ── */
  const hasDateRange = Boolean(search.check_in && search.check_out && searchExecuted);

  // Strip empty values so the API isn't sent blank params
  const activeFilters = Object.fromEntries(
    Object.entries({
      room_type:    search.room_type    || undefined,
      min_capacity: search.min_capacity ? Number(search.min_capacity) : undefined,
      check_in:     hasDateRange ? search.check_in  : undefined,
      check_out:    hasDateRange ? search.check_out : undefined,
    }).filter(([, v]) => v !== undefined)
  );

  // useRooms: used when no date range, or as fallback
  const { rooms: regularRooms, loading: regularLoading, error: regularError } = useRooms(
    (searchExecuted && !hasDateRange) ? activeFilters : {}
  );

  // useAvailability: used when user provides check-in + check-out
  const {
    results: availabilityResults,
    loading: availLoading,
    error:   availError,
    search:  runAvailability,
  } = useAvailability();

  // Fire the availability search whenever the user hits Search with dates
  useEffect(() => {
    if (searchExecuted && hasDateRange) {
      runAvailability(activeFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchExecuted, hasDateRange, JSON.stringify(activeFilters)]);

  // Resolve final results — mirrors RoomListPage exactly
  const searchRooms   = hasDateRange ? (availabilityResults?.available_rooms ?? []) : regularRooms;
  const searchLoading = hasDateRange ? availLoading    : regularLoading;
  const searchError   = hasDateRange ? availError      : regularError;

  /* ── Refs ── */
  const heroRef    = useRef(null);
  const resultsRef = useRef(null);
  const sectionRefs = {
    'hp-hero':     useRef(null),
    'hp-rooms':    useRef(null),
    'hp-services': useRef(null),
    'hp-gallery':  useRef(null),
    'hp-reviews':  useRef(null),
    'hp-faqs':     useRef(null),
    'hp-contact':  useRef(null),
  };

  /* ── Scroll listener ── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Parallax ── */
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const bgScale        = useTransform(scrollYProgress, [0, 1],    [1, 1.12]);
  const bgOpacity      = useTransform(scrollYProgress, [0, 0.85], [1, 0]);
  const bgBlur         = useTransform(scrollYProgress, [0, 1],    [0, 8]);
  const bgFilter       = useTransform(bgBlur, (v) => `blur(${v}px)`);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.45], [1, 0]);
  const contentY       = useTransform(scrollYProgress, [0, 1],    [0, -80]);

  /* ── Intersection observer for fade-up animations ── */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisibleSections((p) => ({ ...p, [e.target.id]: true }));
            const found = Object.entries(NAV_SECTION_MAP).find(([, id]) => id === e.target.id);
            if (found) setActiveSection(found[0]);
          }
        });
      },
      { threshold: 0.12 }
    );
    Object.values(sectionRefs).forEach((r) => r.current && observer.observe(r.current));
    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 72, behavior: 'smooth' });
  }, []);

  const handleNavClick = (label) => {
    const id = NAV_SECTION_MAP[label];
    if (id) scrollToSection(id);
    setActiveSection(label);
  };

  /* ── SEARCH BUTTON ── */
  const handleSearch = () => {
    setSearchExecuted(true);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  /* ── AUTH-GATED NAVIGATION ── */
  const handleSeeMore = () => navigate(isAuthenticated ? '/rooms' : '/register');

  const handleContactChange = (e) => setContactForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const handleContactSubmit = (e) => {
    e.preventDefault();
    setContactSent(true);
    setTimeout(() => setContactSent(false), 5000);
    setContactForm({ name: '', email: '', phone: '', subject: '', message: '' });
  };

  const vis = (id) => `fade-up${visibleSections[id] ? ' visible' : ''}`;

  /* ══════════════════════════════════════════ RENDER ══════════════════════════════════════════ */
  return (
    <div className="hp-page">

      {/* ══ NAVBAR ══ */}
      <nav className={`hp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="hp-nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="hp-nav-logo-main">Cebu Mini Hotel</span>
        </div>
        <div className="hp-nav-links">
          {Object.keys(NAV_SECTION_MAP).map((label) => (
            <button
              key={label}
              className={`hp-nav-link${activeSection === label ? ' active' : ''}`}
              onClick={() => handleNavClick(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="hp-nav-actions">
          <button
            className="btn-outline-light"
            style={scrolled ? { color: 'var(--text)', borderColor: 'rgba(1,0,13,0.3)' } : {}}
            onClick={() => setAuthModal('login')}
          >
            Login
          </button>
          <button className="btn-dark" onClick={() => setAuthModal('register')}>Register</button>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section id="hp-hero" ref={heroRef} className="hero-section">
        <div ref={sectionRefs['hp-hero']} className="hero-sticky">

          <div className="hero-clip">
            <motion.div
              className="hero-background"
              style={{ scale: bgScale, opacity: bgOpacity, filter: bgFilter }}
            >
              <img src="https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1800&q=80" alt="Cebu Mini Hotel" />
            </motion.div>
            <div className="hero-overlay" />
          </div>

          <motion.div className="hero-content" style={{ y: contentY, opacity: contentOpacity }}>
            <h1 className="hp-hero-title">Cebu Mini Hotel</h1>
            <div className="hp-hero-btns">
              <button className="btn-white" onClick={() => scrollToSection('hp-rooms')}>Explore Rooms</button>
              <button className="btn-outline-light" onClick={() => navigate('/login')}>Book Your Stay</button>
            </div>
          </motion.div>

          <div className="hp-hero-scroll">
            <span>Scroll</span>
            <div className="hp-hero-scroll-line" />
          </div>

        </div>

        {/* ── SEARCH BAR ── */}
        <div className="hp-search-dock">
          <div className="hp-search-bar">

            {/* Room Type */}
            <div className="hp-search-field">
              <span className="hp-search-label">Room Type</span>
              <div className="hp-search-control">
                <select
                  value={search.room_type}
                  onChange={(e) => setSearch(p => ({ ...p, room_type: e.target.value }))}
                >
                  {ROOM_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <span className="hp-search-caret"><ChevronDownIcon /></span>
              </div>
            </div>

            <div className="hp-search-divider" />

            {/* Check-In */}
            <div className="hp-search-field">
              <span className="hp-search-label">Check-In</span>
              <div className="hp-search-control">
                <input
                  type="date"
                  value={search.check_in}
                  min={fmt(today)}
                  onChange={(e) => {
                    setSearch(p => ({ ...p, check_in: e.target.value }));
                    setSearchExecuted(false); // reset so user must hit Search again
                  }}
                />
              </div>
            </div>

            <div className="hp-search-divider" />

            {/* Check-Out */}
            <div className="hp-search-field">
              <span className="hp-search-label">Check-Out</span>
              <div className="hp-search-control">
                <input
                  type="date"
                  value={search.check_out}
                  min={search.check_in || fmt(tomorrow)}
                  onChange={(e) => {
                    setSearch(p => ({ ...p, check_out: e.target.value }));
                    setSearchExecuted(false);
                  }}
                />
              </div>
            </div>

            <div className="hp-search-divider" />

            {/* Guests — maps to min_capacity, matches RoomFilters */}
            <div className="hp-search-field hp-search-field--sm">
              <span className="hp-search-label">Guests</span>
              <div className="hp-search-control">
                <select
                  value={search.min_capacity}
                  onChange={(e) => setSearch(p => ({ ...p, min_capacity: e.target.value }))}
                >
                  <option value="">Any</option>
                  <option value="1">1 Guest</option>
                  <option value="2">2 Guests</option>
                  <option value="3">3 Guests</option>
                  <option value="4">4 Guests</option>
                </select>
                <span className="hp-search-caret"><ChevronDownIcon /></span>
              </div>
            </div>

            {/* Search button */}
            <button className="hp-search-btn" onClick={handleSearch}>
              <SearchIcon size={16} />
              <span>Search</span>
            </button>

          </div>
        </div>
      </section>

      {/* ══ SEARCH RESULTS — only shown after the user presses Search ══ */}
      <div ref={resultsRef}>
        {searchExecuted && (
          <SearchResultsSection
            rooms={searchRooms}
            loading={searchLoading}
            error={searchError}
            isAuthenticated={isAuthenticated}
            onSeeMore={handleSeeMore}
            hasDateRange={hasDateRange}
            searchParams={{ checkIn: search.check_in, checkOut: search.check_out }}
          />
        )}
      </div>

      {/* ══ INTRO ══ */}
      <div className={`hp-intro ${vis('hp-hero')}`}>
        <div className="hp-intro-inner">
          <span className="hp-intro-eyebrow">The Cebu Mini Hotel Experience</span>
          <p className="hp-intro-title">
            Where Philippine heritage meets modern minimalism. We curate moments of absolute tranquility in the{' '}
            <span className="hp-intro-gold">heart of Cebu City.</span>
          </p>
        </div>
      </div>

      {/* ══ ROOMS ══ */}
      <section id="hp-rooms" ref={sectionRefs['hp-rooms']} className={`hp-section bg-light ${vis('hp-rooms')}`}>
        <div className="hp-max">
          <div className="hp-section-header-row">
            <div className="hp-section-header">
              <span className="hp-section-chapter">Chapter I — The Residences</span>
              <h2 className="hp-section-title">Rooms &amp; Suites</h2>
              <p className="hp-section-subtitle">Each suite is a masterclass in quiet luxury, featuring local artisan textures and panoramic views of Cebu City.</p>
            </div>
            <button className="hp-view-all" onClick={() => isAuthenticated ? navigate('/rooms') : navigate('/register')}>
              View All Suites
            </button>
          </div>
          <div className="hp-rooms-grid">
            {FEATURED_ROOMS.slice(0, 2).map((room) => (
              <div key={room.id} className="hp-room-card">
                <div className={`hp-room-img-wrap ${room.size}`}>
                  <img className="hp-room-img" src={room.image} alt={room.name} />
                  {room.badge && <span className="hp-room-badge">{room.badge}</span>}
                </div>
                <div className="hp-room-header">
                  <h3 className="hp-room-name">{room.name}</h3>
                  <div className="hp-room-price-tag">
                    <span className="hp-room-price">{room.price}</span>
                    <span className="hp-room-price-sub">/ Night</span>
                  </div>
                </div>
                <p className="hp-room-desc">{room.desc}</p>
                <button className="hp-room-book" onClick={() => isAuthenticated ? navigate('/rooms') : navigate('/login')}>
                  Book This Room
                </button>
              </div>
            ))}
          </div>
          <div className="hp-rooms-more">
            {FEATURED_ROOMS.slice(2).map((room, i) => (
              <div key={room.id} className={`hp-room-card hp-room-card-sm fade-up s${i + 1}${visibleSections['hp-rooms'] ? ' visible' : ''}`}>
                <div className="hp-room-img-wrap"><img className="hp-room-img" src={room.image} alt={room.name} /></div>
                <div className="hp-room-header">
                  <h3 className="hp-room-name">{room.name}</h3>
                  <div className="hp-room-price-tag">
                    <span className="hp-room-price">{room.price}</span>
                    <span className="hp-room-price-sub">/ Night</span>
                  </div>
                </div>
                <p className="hp-room-desc">{room.desc}</p>
                <button className="hp-room-book" onClick={() => isAuthenticated ? navigate('/rooms') : navigate('/login')}>Book</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SERVICES ══ */}
      <section id="hp-services" ref={sectionRefs['hp-services']} className={`hp-section bg-warm ${vis('hp-services')}`}>
        <div className="hp-max">
          <div className="hp-section-header-row">
            <div className="hp-section-header">
              <span className="hp-section-chapter">Chapter II — Curated Amenities</span>
              <h2 className="hp-section-title">Premium Services</h2>
              <p className="hp-section-subtitle">Thoughtfully crafted experiences designed around your every comfort and desire.</p>
            </div>
          </div>
          <div className="hp-amenities-grid">
            <div className="hp-spa-card">
              <img src="https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=1200&q=80" alt="The Wellness Spa" />
              <div className="hp-spa-overlay">
                <h3 className="hp-spa-title">The Wellness Spa</h3>
                <p className="hp-spa-sub">Indigenous Cebuano Therapies</p>
              </div>
            </div>
            <div className="hp-amenities-list">
              {AMENITIES.map((item, i) => (
                <div key={item.title} className={`hp-amenity-item fade-up s${i + 1}${visibleSections['hp-services'] ? ' visible' : ''}`}>
                  <span className="hp-amenity-icon">{item.icon}</span>
                  <div>
                    <h4 className="hp-amenity-title">{item.title}</h4>
                    <p className="hp-amenity-desc">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ GALLERY ══ */}
      <section id="hp-gallery" ref={sectionRefs['hp-gallery']} className="hp-section bg-light hp-gallery-section">
        <div className="hp-max">
          <div className="hp-section-header centered">
            <span className="hp-section-chapter">Chapter III — Visual Journey</span>
            <h2 className="hp-section-title">Photo Gallery</h2>
            <p className="hp-section-subtitle">Glimpses of the spaces, flavours, and moments that define us.</p>
          </div>
        </div>
        <div className="hp-gallery-strip-wrap">
          <div className="hp-gallery-strip">
            {GALLERY.map((item, i) => (
              <div key={i} className="hp-gal-panel">
                <div className="hp-gal-panel-inner">
                  <img src={item.src} alt={item.label} className="hp-gal-panel-img" />
                  <div className="hp-gal-panel-caption">
                    <span className="hp-gal-panel-label">{item.label}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIAL ══ */}
      <div className="hp-testimonial">
        <div className="hp-testimonial-inner">
          <span className="hp-testimonial-quote-mark">"</span>
          <p className="hp-testimonial-text">
            A rare find in Cebu. An unparalleled sense of peace and architectural beauty. Every detail feels considered and intentional.
          </p>
          <div>
            <span className="hp-testimonial-author-name">Maria Santos</span>
            <span className="hp-testimonial-author-role">Verified Guest · Manila, Philippines</span>
          </div>
        </div>
      </div>

      {/* ══ REVIEWS ══ */}
      <section id="hp-reviews" ref={sectionRefs['hp-reviews']} className={`hp-section bg-light ${vis('hp-reviews')}`}>
        <div className="hp-max">
          <div className="hp-section-header centered">
            <span className="hp-section-chapter">Chapter IV — Guest Voices</span>
            <h2 className="hp-section-title">Ratings &amp; Reviews</h2>
          </div>
          <div className="hp-reviews-summary">
            <div>
              <p className="hp-reviews-score-num">4.9</p>
              <StarRating count={5} size={18} />
              <span className="hp-reviews-score-label">Overall Rating</span>
            </div>
            <div className="hp-reviews-bars">
              {RATING_BARS.map(({ label, val }) => (
                <div key={label} className="hp-reviews-bar-row">
                  <span className="hp-reviews-bar-label">{label}</span>
                  <div className="hp-reviews-bar-track">
                    <div className="hp-reviews-bar-fill" style={{ width: `${(parseFloat(val) / 5) * 100}%` }} />
                  </div>
                  <span className="hp-reviews-bar-val">{val}</span>
                </div>
              ))}
              <p className="hp-reviews-count">Based on 248 verified stays</p>
            </div>
          </div>
          <div className="hp-reviews-grid">
            {REVIEWS.map((r, i) => (
              <div key={i} className={`hp-rev-card fade-up s${(i % 3) + 1}${visibleSections['hp-reviews'] ? ' visible' : ''}`}>
                <div className="hp-rev-stars"><StarRating count={r.rating} /></div>
                <p className="hp-rev-text">{r.text}</p>
                <div className="hp-rev-footer">
                  <div className="hp-rev-avatar">{r.avatar}</div>
                  <div>
                    <p className="hp-rev-name">{r.name}</p>
                    <p className="hp-rev-meta">{r.location} · {r.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQs ══ */}
      <section id="hp-faqs" ref={sectionRefs['hp-faqs']} className={`hp-section bg-dark ${vis('hp-faqs')}`}>
        <div className="hp-max">
          <div className="hp-section-header centered">
            <span className="hp-section-chapter">Chapter V — Inquiries</span>
            <h2 className="hp-section-title">Frequently Asked</h2>
            <p className="hp-section-subtitle">Everything you need to know before your stay with us.</p>
          </div>
          <div className="hp-faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className="hp-faq-item">
                <button className="hp-faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{faq.q}</span>
                  <span className={`hp-faq-chevron${openFaq === i ? ' open' : ''}`}>
                    <ChevronDownIcon size={16} />
                  </span>
                </button>
                <div className={`hp-faq-answer${openFaq === i ? ' open' : ''}`}>
                  <p>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="hp-faq-cta">
            <p className="hp-faq-cta-title">Still have questions?</p>
            <p className="hp-faq-cta-sub">Our concierge team is available 24/7 to assist you</p>
            <div className="hp-faq-cta-btns">
              <button className="btn-white" onClick={() => scrollToSection('hp-contact')}>Contact Us</button>
              <button className="btn-outline-light">+63 32 123 4567</button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CONTACT ══ */}
      <section id="hp-contact" ref={sectionRefs['hp-contact']} className={`hp-section bg-light ${vis('hp-contact')}`}>
        <div className="hp-max">
          <div className="hp-section-header">
            <span className="hp-section-chapter">Chapter VI — Get in Touch</span>
            <h2 className="hp-section-title">Contact Us</h2>
            <p className="hp-section-subtitle">Reach out for reservations, inquiries, or just to say hello.</p>
          </div>
          <div className="hp-contact-grid">
            <div>
              <div className="hp-contact-info-list">
                {[
                  { label: 'Address', value: '123 Colon St., Cebu City, 6000\nCentral Visayas, Philippines' },
                  { label: 'Phone',   value: '+63 32 123 4567\n+63 917 123 4567' },
                  { label: 'Email',   value: 'reservations@cebu-mini.ph\nsupport@cebu-mini.ph' },
                  { label: 'Hours',   value: 'Front Desk: Open 24/7' },
                ].map((item, i) => (
                  <div key={i} className="hp-contact-info-item">
                    <span className="hp-contact-info-label">{item.label}</span>
                    <p className="hp-contact-info-value" style={{ whiteSpace: 'pre-line' }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <form className="hp-contact-form" onSubmit={handleContactSubmit}>
              <div className="hp-contact-form-row">
                <div className="hp-contact-field">
                  <label>Full Name</label>
                  <input className="hp-contact-input" name="name" value={contactForm.name} onChange={handleContactChange} placeholder="Juan dela Cruz" required />
                </div>
                <div className="hp-contact-field">
                  <label>Phone</label>
                  <input className="hp-contact-input" name="phone" value={contactForm.phone} onChange={handleContactChange} placeholder="+63 912 345 6789" type="tel" />
                </div>
              </div>
              <div className="hp-contact-field">
                <label>Email Address</label>
                <input className="hp-contact-input" name="email" value={contactForm.email} onChange={handleContactChange} placeholder="you@email.com" type="email" required />
              </div>
              <div className="hp-contact-field">
                <label>Subject</label>
                <input className="hp-contact-input" name="subject" value={contactForm.subject} onChange={handleContactChange} placeholder="Reservation Inquiry / Event / General" />
              </div>
              <div className="hp-contact-field">
                <label>Message</label>
                <textarea className="hp-contact-textarea" name="message" value={contactForm.message} onChange={handleContactChange} placeholder="Tell us how we can help you..." rows={5} required />
              </div>
              {contactSent && <div className="hp-contact-success">Message sent. We will get back to you within 24 hours.</div>}
              <button type="submit" className="btn-dark" style={{ alignSelf: 'flex-start', marginTop: '8px' }}>Send Message</button>
            </form>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="hp-footer">
        <div className="hp-footer-top">
          <div className="hp-footer-brand">
            <h3 className="hp-footer-logo">Cebu Mini Hotel</h3>
            <span className="hp-footer-logo-sub">. 2026 · Cebu City, Philippines</span>
            <p className="hp-footer-desc">Defining the new standard of Visayan luxury through silence, space, and genuine Filipino hospitality in the heart of Cebu City.</p>
            <div className="hp-footer-socials">
              {['fb', 'ig', 'tw', 'yt'].map((s) => <button key={s} className="hp-footer-social">{s}</button>)}
            </div>
          </div>
          <div className="hp-footer-nav">
            <div>
              <span className="hp-footer-col-title">Discover</span>
              {Object.entries(NAV_SECTION_MAP).map(([label, id]) => (
                <button key={label} className="hp-footer-link" onClick={() => scrollToSection(id)}>{label}</button>
              ))}
            </div>
            <div>
              <span className="hp-footer-col-title">Services</span>
              {AMENITIES.map((a) => (
                <button key={a.title} className="hp-footer-link" onClick={() => scrollToSection('hp-services')}>{a.title}</button>
              ))}
            </div>
            <div>
              <span className="hp-footer-col-title">Contact</span>
              {['123 Colon St., Cebu City', '+63 32 123 4567', 'reservations@cebu-mini.ph', 'www.cebu-mini.ph'].map((t, i) => (
                <p key={i} className="hp-footer-link" style={{ cursor: 'default' }}>{t}</p>
              ))}
            </div>
          </div>
        </div>
        <div className="hp-footer-divider" />
        <div className="hp-footer-bottom">
          <p className="hp-footer-copy">© 2026 Cebu Mini Hotel. All rights reserved.</p>
          <div className="hp-footer-legal">
            {['Privacy Policy', 'Terms & Conditions', 'Cookie Policy'].map((l) => (
              <button key={l} className="hp-footer-link" style={{ marginBottom: 0 }}>{l}</button>
            ))}
          </div>
        </div>
      </footer>

      {authModal && (
  <AuthModal
    mode={authModal}
    onClose={() => setAuthModal(null)}
      />
    )}

    </div>
  );
}

