// src/features/home/HotelHomepage.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import './HotelHomepage.css';

/* ─────────────────────────── STATIC DATA ─────────────────────────── */

const ROOMS = [
  { id: 1, name: 'Deluxe Ocean Suite',     price: '₱3,500', rating: 5, image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80', desc: 'Breathtaking sea views with private balcony' },
  { id: 2, name: 'Executive Premier Room', price: '₱2,800', rating: 5, image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80', desc: 'Refined elegance with king-size comfort' },
  { id: 3, name: 'Royal Penthouse',        price: '₱7,200', rating: 5, image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80', desc: 'The pinnacle of luxury living in Cebu' },
  { id: 4, name: 'Garden Terrace Room',    price: '₱2,200', rating: 4, image: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=800&q=80', desc: 'Serene garden views with lush surroundings' },
  { id: 5, name: 'Classic Standard Room',  price: '₱1,800', rating: 4, image: 'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=800&q=80', desc: 'Timeless comfort at an exceptional value' },
];

const SERVICES = [
  { icon: '', title: 'Fine Dining',    desc: 'Savor artisanal cuisine crafted by award-winning chefs using locally-sourced Cebuano ingredients.',      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80' },
  { icon: '',  title: 'Spa & Wellness', desc: 'Rejuvenate with signature Filipino hilot massages and bespoke wellness rituals in a tranquil setting.',  image: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=600&q=80' },
  { icon: '',  title: 'Infinity Pool',  desc: 'Float above the city skyline in our rooftop infinity pool, open 24 hours exclusively for hotel guests.', image: 'https://images.unsplash.com/photo-1439130490301-25e322d88054?w=600&q=80' },
  { icon: '',  title: 'Airport Transfer', desc: 'Seamless door-to-door luxury transfers with professional drivers available around the clock.',          image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&q=80' },
  { icon: '',  title: 'Event Hosting',  desc: 'Elegant ballrooms and private function rooms for weddings, corporate events, and intimate celebrations.', image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600&q=80' },
  { icon: '', title: '24/7 Concierge', desc: 'Our dedicated concierge team is always on hand to fulfill every request, from tours to exclusive dining.',image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80' },
];

const GALLERY = [
  { image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=900&q=80', label: 'Lobby & Reception', cls: 'wide' },
  { image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=700&q=80', label: 'Royal Suite',        cls: 'tall' },
  { image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=700&q=80', label: 'Fine Dining',    cls: '' },
  { image: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=700&q=80', label: 'Spa & Wellness', cls: '' },

];

const REVIEWS = [
  { name: 'Maria Santos',   rating: 5, date: 'February 2026',  text: 'Absolutely magnificent stay. The staff went above and beyond, and the room was immaculate. The gold accents and navy decor made us feel like royalty. Will return every anniversary.', avatar: 'MS', location: 'Manila, Philippines' },
  { name: 'James Whitmore', rating: 5, date: 'January 2026',   text: 'Cebu Mini Hotel exceeded every expectation. Woke up to stunning views, had the most peaceful sleep of my life. Breakfast was divine. A hidden gem in the heart of Cebu.',           avatar: 'JW', location: 'Sydney, Australia' },
  { name: 'Linh Nguyen',    rating: 5, date: 'January 2026',   text: 'Impeccable service and stunning rooms. The attention to detail is extraordinary — from the handwritten welcome note to the perfectly pressed linens. Pure luxury.',                   avatar: 'LN', location: 'Ho Chi Minh, Vietnam' },
  { name: 'Carlos Reyes',   rating: 5, date: 'December 2025',  text: 'A truly unforgettable experience. The rooftop pool at sunset was breathtaking. The concierge arranged everything flawlessly, including a private island day trip.',                     avatar: 'CR', location: 'Madrid, Spain' },
  { name: 'Ayaka Tanaka',   rating: 4, date: 'December 2025',  text: 'Beautifully designed hotel with a warm, personal touch. The spa was the highlight — the hilot massage left me completely renewed. Would absolutely recommend to everyone.',              avatar: 'AT', location: 'Tokyo, Japan' },
  { name: 'Sophie Martin',  rating: 5, date: 'November 2025',  text: 'From check-in to check-out, every moment felt curated. The room was immaculate, the views stunning, and the staff treated us like family. Cebu\'s finest without question.',            avatar: 'SM', location: 'Paris, France' },
];

const FAQS = [
  { q: 'What are the check-in and check-out times?',   a: 'Standard check-in is at 2:00 PM and check-out is at 12:00 PM noon. Early check-in and late check-out are available upon request, subject to availability. Contact our concierge team in advance to arrange a seamless experience.' },
  { q: 'Is breakfast included in the room rate?',       a: 'Select room categories include complimentary daily breakfast for two guests. Please verify your room package at booking. Our in-house restaurant, The Cebu Table, opens at 6:30 AM daily with an extensive Filipino and international spread.' },
  { q: 'Do you offer airport transfer services?',       a: 'Yes. We provide 24/7 luxury airport transfers to and from Mactan-Cebu International Airport. Rates vary by vehicle type. We recommend booking at least 24 hours in advance through our concierge desk.' },
  { q: 'Is the hotel pet-friendly?',                    a: 'We welcome small pets under 10 kg in select Garden Terrace rooms with prior arrangement. A refundable security deposit is required. Please inform us at the time of booking so we can prepare your room accordingly.' },
  { q: 'What payment methods are accepted?',            a: 'We accept all major credit cards (Visa, Mastercard, AMEX, JCB), GCash, Maya, bank transfers, and cash in Philippine Peso. Invoice billing is available for corporate accounts and group bookings.' },
  { q: 'Is there parking available at the hotel?',      a: 'Complimentary covered parking is available for hotel guests on a first-come, first-served basis. Valet parking is also available at an additional charge. Our parking area is secured with 24-hour CCTV monitoring.' },
  { q: 'Can I book a room for a special occasion?',     a: 'Absolutely. Our events team specializes in unforgettable anniversary, birthday, and honeymoon setups. Contact us at least 48 hours in advance and we will arrange flowers, cake, personalized notes, and room decorations.' },
  { q: 'What is your cancellation policy?',             a: 'Reservations cancelled 48 hours or more before check-in receive a full refund. Cancellations within 48 hours are subject to a one-night charge. No-shows are charged the full reservation amount. Special event dates may have different policies.' },
];

const RATING_BARS = [
  { label: 'Cleanliness', val: '5.0' },
  { label: 'Comfort',     val: '4.9' },
  { label: 'Location',    val: '4.8' },
  { label: 'Service',     val: '5.0' },
];

/* ─────────────────────────── NAV SECTION IDS ─────────────────────────── */
// Maps nav link label → section element id
const NAV_SECTION_MAP = {
  Home:     'hp-hero',
  Rooms:    'hp-rooms',
  Services: 'hp-services',
  Gallery:  'hp-gallery',
  Contact:  'hp-contact',
};

/* ─────────────────────────── SMALL HELPERS ─────────────────────────── */

function StarRating({ count, size = 16 }) {
  return (
    <div className="hp-stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          fill={i < count ? '#C9A84C' : 'rgba(201,168,76,0.22)'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="hp-section-header">
      <span className="hp-section-eyebrow">{eyebrow}</span>
      <h2 className="hp-section-title">{title}</h2>
      <div className="hp-section-divider" />
      {subtitle && <p className="hp-section-subtitle">{subtitle}</p>}
    </div>
  );
}

/* ─────────────────────────── MAIN COMPONENT ─────────────────────────── */

export default function HotelHomepage() {
  const navigate = useNavigate();

  // ── State ──
  const [scrolled, setScrolled]               = useState(false);
  const [activeSection, setActiveSection]     = useState('Home');
  const [carouselIndex, setCarouselIndex]     = useState(0);
  const [visibleSections, setVisibleSections] = useState({});
  const [openFaq, setOpenFaq]                 = useState(null);
  const [contactForm, setContactForm]         = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [contactSent, setContactSent]         = useState(false);

  // Check auth — read whatever token key your api.js uses
  const isAuthenticated = !!(
    localStorage.getItem('accessToken') ||
    sessionStorage.getItem('accessToken') ||
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('access_token')
  );

  // ── Section refs for IntersectionObserver ──
  const sectionRefs = {
    'hp-hero':     useRef(null),
    'hp-rooms':    useRef(null),
    'hp-services': useRef(null),
    'hp-gallery':  useRef(null),
    'hp-reviews':  useRef(null),
    'hp-faqs':     useRef(null),
    'hp-contact':  useRef(null),
    'hp-footer':   useRef(null),
  };

  // ── Scroll handler (for navbar) ──
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Framer Motion hero: exact pattern from motion.dev/react/scroll-zoom-hero ──
  // useScroll targets the outer 200vh section; offset tracks top-of-section to
  // bottom-of-section hitting the top of the viewport (i.e. fully scrolled past)
  const heroRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target:  heroRef,
    offset:  ['start start', 'end start'],
  });

  // Direct useTransform on scrollYProgress — NO useSpring — matches the example
  const bgScale   = useTransform(scrollYProgress, [0, 1], [1, 1.5]);
  const bgOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const bgBlur    = useTransform(scrollYProgress, [0, 1], [0, 10]);
  const bgFilter  = useTransform(bgBlur, (v) => `blur(${v}px)`);

  // Content lifts and fades out slightly faster than the bg
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const contentY       = useTransform(scrollYProgress, [0, 1],   [0, -100]);

  // ── Intersection observer: fade-up + active nav tracking ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisibleSections((p) => ({ ...p, [e.target.id]: true }));
            // Update active nav link based on which section is in view
            const navEntry = Object.entries(NAV_SECTION_MAP).find(([, id]) => id === e.target.id);
            if (navEntry) setActiveSection(navEntry[0]);
          }
        });
      },
      { threshold: 0.15 }
    );
    Object.values(sectionRefs).forEach((r) => r.current && observer.observe(r.current));
    return () => observer.disconnect();
  }, []);

  // ── Smooth scroll to section ──
  const scrollToSection = useCallback((sectionId) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const offset = 70; // navbar height
    const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  // ── Nav link click ──
  const handleNavClick = (label) => {
    const sectionId = NAV_SECTION_MAP[label];
    if (sectionId) scrollToSection(sectionId);
    setActiveSection(label);
  };

  // ── Book Now ──
  const handleBookNow = (roomId) => {
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      navigate(`/rooms/${roomId}`);
    }
  };

  // ── Carousel ──
  const [isSliding, setIsSliding] = useState(false);
  const [slideDir, setSlideDir]   = useState('next');
  const CARDS_VISIBLE = 3;
  const isSlidingRef = useRef(false); // ref so autoplay timer always sees fresh value

  const slide = useCallback((dir) => {
    if (isSlidingRef.current) return;
    isSlidingRef.current = true;
    setSlideDir(dir);
    setIsSliding(true);
    setTimeout(() => {
      setCarouselIndex((i) =>
        dir === 'next'
          ? (i + 1) % ROOMS.length
          : (i - 1 + ROOMS.length) % ROOMS.length
      );
      setIsSliding(false);
      isSlidingRef.current = false;
    }, 440);
  }, []);

  const nextSlide = () => slide('next');
  const prevSlide = () => slide('prev');

  // Build a window of CARDS_VISIBLE + 1 extra on each side so we always have
  // a card sliding IN from the edge.
  const getCarouselCards = () => {
    // indices: [prev-extra, ...visible..., next-extra]
    const indices = [];
    for (let i = -1; i <= CARDS_VISIBLE; i++) {
      indices.push((carouselIndex + i + ROOMS.length * 10) % ROOMS.length);
    }
    return indices.map((idx) => ROOMS[idx]);
  };

  const carouselCards = getCarouselCards();

  // ── Carousel auto-play: advances every 4s, resets timer on manual nav ──
  useEffect(() => {
    const timer = setInterval(() => slide('next'), 4000);
    return () => clearInterval(timer);
  }, [slide, carouselIndex]);

  // ── Contact form ──
  const handleContactChange = (e) => {
    setContactForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    // TODO: wire to your backend — POST /api/contact
    setContactSent(true);
    setTimeout(() => setContactSent(false), 4000);
    setContactForm({ name: '', email: '', phone: '', subject: '', message: '' });
  };

  // ── Helper: vis class ──
  const vis = (id) => `fade-up${visibleSections[id] ? ' visible' : ''}`;

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="hp-page">

      {/* ══════════ NAVBAR ══════════ */}
      <nav className={`hp-nav${scrolled ? ' scrolled' : ''}`}>

        {/* Logo — clicks back to hero */}
        <div className="hp-nav-logo" onClick={() => scrollToSection('hp-hero')}>
          <div className="hp-nav-logo-icon">⟡</div>
          <span className="hp-nav-logo-text">CEBU MINI HOTEL</span>
        </div>

        {/* Nav links — smooth scroll to each section */}
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

        {/* Auth buttons — navigate to Login / Register routes */}
        <div className="hp-nav-actions">
          <button className="btn-outline sm" onClick={() => navigate('/login')}>
            Login
          </button>
          <button className="btn-gold sm" onClick={() => navigate('/register')}>
            Register
          </button>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      {/*
        Mirrors the exact structure from examples.motion.dev/react/scroll-zoom-hero:
          <section style={{height:'200vh'}}> ← scroll container, ref for useScroll
            <div style={{sticky, height:100vh, overflow:hidden}}> ← sticky frame
              <motion.div>background image</motion.div>
              <motion.div>content</motion.div>
            </div>
          </section>
      */}
      <section
        id="hp-hero"
        ref={heroRef}
        className="hero-section"
      >
        <div
          ref={sectionRefs['hp-hero']}
          className="hero-sticky"
        >
          {/* Background — scale + opacity + blur driven by scroll */}
          <motion.div
            className="hero-background"
            style={{
              scale:   bgScale,
              opacity: bgOpacity,
              filter:  bgFilter,
            }}
          >
            <img
              src="https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1800&q=80"
              alt="Cebu Mini Hotel"
            />
          </motion.div>

          {/* Dark overlay — static, always keeps text readable */}
          <div className="hero-overlay" />

          {/* Decorative corner accents */}
          <div className="hp-hero-corner tl" />
          <div className="hp-hero-corner br" />

          {/* Content — lifts and fades on scroll */}
          <motion.div
            className="hero-content"
            style={{
              y:       contentY,
              opacity: contentOpacity,
            }}
          >
            <p className="hp-hero-eyebrow">Welcome to</p>
            <h1 className="hp-hero-title">Cebu Mini Hotel</h1>
            <div className="hp-hero-divider" />
            <p className="hp-hero-subtitle">Where Luxury Meets the Soul of Cebu</p>
            <div className="hp-hero-btns">
              <button className="btn-gold md" onClick={() => navigate('/login')}>
                Login
              </button>
              <button className="btn-outline md" onClick={() => navigate('/register')}>
                Register
              </button>
            </div>
          </motion.div>

          {/* Scroll indicator */}
          <div className="hp-hero-scroll">
            <span>Scroll</span>
            <div className="hp-hero-scroll-line" />
          </div>
        </div>
      </section>

      {/* ══════════ ROOMS CAROUSEL ══════════ */}
      <section
        id="hp-rooms"
        ref={sectionRefs['hp-rooms']}
        className={`hp-section bg-navy ${vis('hp-rooms')}`}
      >
        <SectionHeader
          eyebrow="Discover Our Spaces"
          title="Curated Rooms & Suites"
          subtitle="Every room tells a story of craftsmanship and enduring elegance"
        />

        <div className="hp-max">
          {/* Outer viewport — clips the overflowing cards */}
          <div className="hp-carousel-viewport">
            {/* Inner track — shifted left by one card width so the "extra" card
                starts just off-screen left, giving us room to slide in/out */}
            <div
              className={`hp-carousel-inner${isSliding ? ` sliding-${slideDir}` : ''}`}
            >
              {carouselCards.map((room, i) => (
                <div key={`${room.id}-slot-${i}`} className="hp-room-card">
                  <div className="hp-room-img-wrap">
                    <img className="hp-room-img" src={room.image} alt={room.name} />
                    <div className="hp-room-gradient">
                      <div className="hp-room-info">
                        <div>
                          <h3 className="hp-room-name">{room.name}</h3>
                          <p className="hp-room-desc">{room.desc}</p>
                          <StarRating count={room.rating} />
                        </div>
                        <div className="hp-room-price">
                          {room.price}
                          <span className="hp-room-price-sub">/NIGHT</span>
                        </div>
                      </div>
                      <button className="hp-room-btn" onClick={() => handleBookNow(room.id)}>
                        Book Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hp-carousel-controls">
            <button className="hp-carousel-arrow" onClick={prevSlide} disabled={isSliding}>‹</button>
            <div className="hp-carousel-dots">
              {ROOMS.map((_, i) => (
                <button
                  key={i}
                  className={`hp-carousel-dot${carouselIndex === i ? ' active' : ''}`}
                  onClick={() => {
                    if (!isSliding) {
                      const dir = i > carouselIndex ? 'next' : 'prev';
                      setSlideDir(dir);
                      setIsSliding(true);
                      setTimeout(() => { setCarouselIndex(i); setIsSliding(false); }, 420);
                    }
                  }}
                />
              ))}
            </div>
            <button className="hp-carousel-arrow" onClick={nextSlide} disabled={isSliding}>›</button>
          </div>
        </div>
      </section>

      {/* ══════════ SERVICES ══════════ */}
      <section
        id="hp-services"
        ref={sectionRefs['hp-services']}
        className={`hp-section bg-navy-mid ${vis('hp-services')}`}
      >
        <SectionHeader
          eyebrow="What We Offer"
          title="Our Premium Services"
          subtitle="Thoughtfully crafted experiences designed around your every comfort and desire"
        />
        <div className="hp-max hp-services-grid">
          {SERVICES.map((s, i) => (
            <div key={i} className={`hp-svc-card fade-up s${(i % 3) + 1}${visibleSections['hp-services'] ? ' visible' : ''}`}>
              <div className="hp-svc-img-wrap">
                <img className="hp-svc-img" src={s.image} alt={s.title} />
                <div className="hp-svc-img-overlay" />
                <div className="hp-svc-badge">{s.icon}</div>
              </div>
              <div className="hp-svc-body">
                <h3 className="hp-svc-title">{s.title}</h3>
                <p className="hp-svc-desc">{s.desc}</p>
                <div className="hp-svc-line" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ GALLERY ══════════ */}
      <section
        id="hp-gallery"
        ref={sectionRefs['hp-gallery']}
        className={`hp-section bg-navy ${vis('hp-gallery')}`}
      >
        <SectionHeader
          eyebrow="A Visual Journey"
          title="Photo Gallery"
          subtitle="Glimpses of the spaces, flavours, and moments that define us"
        />
        <div className="hp-max hp-gallery-grid">
          {GALLERY.map((g, i) => (
            <div
              key={i}
              className={`hp-gal-item${g.cls ? ` ${g.cls}` : ''}`}
              style={
                i === 0 ? { gridColumn: '1 / 3', gridRow: '1 / 2' } :
                i === 1 ? { gridColumn: '3 / 4', gridRow: '1 / 3' } :
                i === 2 ? { gridColumn: '1 / 2', gridRow: '2 / 3' } :
                i === 3 ? { gridColumn: '2 / 3', gridRow: '2 / 3' } :
                          {}
              }
            >
              <img className="hp-gal-img" src={g.image} alt={g.label} />
              <div className="hp-gal-overlay">
                <span className="hp-gal-label">{g.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ RATINGS & REVIEWS ══════════ */}
      <section
        id="hp-reviews"
        ref={sectionRefs['hp-reviews']}
        className={`hp-section bg-navy-mid ${vis('hp-reviews')}`}
      >
        <SectionHeader eyebrow="Guest Experiences" title="Ratings & Reviews" />

        {/* Summary */}
        <div className="hp-reviews-summary">
          <div className="hp-reviews-score">
            <p className="hp-reviews-score-num">4.9</p>
            <div style={{ margin: '10px 0 8px' }}><StarRating count={5} size={20} /></div>
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

        {/* Review cards */}
        <div className="hp-max hp-reviews-grid">
          {REVIEWS.map((r, i) => (
            <div key={i} className={`hp-rev-card fade-up s${(i % 3) + 1}${visibleSections['hp-reviews'] ? ' visible' : ''}`}>
              <StarRating count={r.rating} />
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
      </section>

      {/* ══════════ FAQs ══════════ */}
      <section
        id="hp-faqs"
        ref={sectionRefs['hp-faqs']}
        className={`hp-section bg-navy ${vis('hp-faqs')}`}
      >
        <SectionHeader
          eyebrow="Got Questions?"
          title="Frequently Asked Questions"
          subtitle="Everything you need to know before your stay with us"
        />

        <div className="hp-faq-list">
          {FAQS.map((faq, i) => (
            <div key={i} className="hp-faq-item">
              <button
                className="hp-faq-question"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span>{faq.q}</span>
                <span className={`hp-faq-chevron${openFaq === i ? ' open' : ''}`}>▾</span>
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
            <button className="btn-gold md" onClick={() => scrollToSection('hp-contact')}>
              Contact Us
            </button>
            <button className="btn-outline md">
              +63 32 123 4567
            </button>
          </div>
        </div>
      </section>

      {/* ══════════ CONTACT ══════════ */}
      <section
        id="hp-contact"
        ref={sectionRefs['hp-contact']}
        className={`hp-section bg-navy-mid ${vis('hp-contact')}`}
      >
        <SectionHeader
          eyebrow="Get in Touch"
          title="Contact Us"
          subtitle="We'd love to hear from you — reach out for reservations, inquiries, or just to say hello"
        />

        <div className="hp-max hp-contact-grid">
          {/* Info column */}
          <div>
            <div className="hp-contact-info-list">
              {[
                { icon: 'fas fa pin', label: 'Address',       value: '123 Colon St., Cebu City, 6000\nCentral Visayas, Philippines' },
                { icon: 'fas fa phone', label: 'Phone',          value: '+63 32 123 4567\n+63 917 123 4567' },
                { icon: 'fas fa envelop', label: 'Email',          value: 'reservations@cebu-mini.ph\nsupport@cebu-mini.ph' },
                { icon: 'fas fa clock', label: 'Hours',          value: 'Front Desk: 24/7' },
              ].map((item, i) => (
                <div key={i} className="hp-contact-info-item">
                  <div className="hp-contact-icon">{item.icon}</div>
                  <div>
                    <p className="hp-contact-info-label">{item.label}</p>
                    <p className="hp-contact-info-value" style={{ whiteSpace: 'pre-line' }}>{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form column */}
          <form className="hp-contact-form" onSubmit={handleContactSubmit}>
            <div className="hp-contact-form-row">
              <div className="hp-contact-field">
                <label>Full Name</label>
                <input
                  className="hp-contact-input"
                  name="name"
                  value={contactForm.name}
                  onChange={handleContactChange}
                  placeholder="Juan dela Cruz"
                  required
                />
              </div>
              <div className="hp-contact-field">
                <label>Phone</label>
                <input
                  className="hp-contact-input"
                  name="phone"
                  value={contactForm.phone}
                  onChange={handleContactChange}
                  placeholder="+63 912 345 6789"
                  type="tel"
                />
              </div>
            </div>

            <div className="hp-contact-field">
              <label>Email Address</label>
              <input
                className="hp-contact-input"
                name="email"
                value={contactForm.email}
                onChange={handleContactChange}
                placeholder="you@email.com"
                type="email"
                required
              />
            </div>

            <div className="hp-contact-field">
              <label>Subject</label>
              <input
                className="hp-contact-input"
                name="subject"
                value={contactForm.subject}
                onChange={handleContactChange}
                placeholder="Reservation Inquiry / Event / General"
              />
            </div>

            <div className="hp-contact-field">
              <label>Message</label>
              <textarea
                className="hp-contact-textarea"
                name="message"
                value={contactForm.message}
                onChange={handleContactChange}
                placeholder="Tell us how we can help you..."
                rows={5}
                required
              />
            </div>

            {contactSent && (
              <div style={{
                padding: '14px 20px',
                background: 'rgba(201,168,76,0.08)',
                border: '1px solid rgba(201,168,76,0.35)',
                color: '#C9A84C',
                fontFamily: "'Raleway', sans-serif",
                fontSize: '13px',
                letterSpacing: '1px',
              }}>
                ✓ Message sent! We'll get back to you within 24 hours.
              </div>
            )}

            <button type="submit" className="btn-gold md" style={{ alignSelf: 'flex-start' }}>
              Send Message
            </button>
          </form>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer
        id="hp-footer"
        ref={sectionRefs['hp-footer']}
        className={`hp-footer ${vis('hp-footer')}`}
      >
        <div className="hp-footer-grid">

          {/* Brand */}
          <div>
            <div className="hp-footer-brand-logo">
              <div className="hp-footer-brand-icon">⟡</div>
              <span className="hp-footer-brand-name">CEBU MINI HOTEL</span>
            </div>
            <p className="hp-footer-desc">
              A sanctuary of refined luxury nestled in the heart of Cebu City.
              Where timeless elegance meets genuine Filipino hospitality.
            </p>
            <div className="hp-footer-socials">
              {['fb', 'ig', 'tw', 'yt'].map((s) => (
                <button key={s} className="hp-footer-social">{s}</button>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <p className="hp-footer-col-title">Quick Links</p>
            {Object.entries(NAV_SECTION_MAP).map(([label, id]) => (
              <button key={label} className="hp-footer-link" onClick={() => scrollToSection(id)}>
                {label}
              </button>
            ))}
            <button className="hp-footer-link" onClick={() => scrollToSection('hp-faqs')}>FAQs</button>
          </div>

          {/* Services */}
          <div>
            <p className="hp-footer-col-title">Services</p>
            {SERVICES.map((s) => (
              <button key={s.title} className="hp-footer-link" onClick={() => scrollToSection('hp-services')}>
                {s.title}
              </button>
            ))}
          </div>

          {/* Contact */}
          <div>
            <p className="hp-footer-col-title">Contact</p>
            {[
              { icon: 'fas fa pin', text: '123 Colon St., Cebu City, 6000' },
              { icon: 'fas fa phone', text: '+63 32 123 4567' },
              { icon: 'fas fa envelop', text: 'reservations@cebu-mini.ph' },
              { icon: '🌐', text: 'www.cebu-mini.ph' },
            ].map((item, i) => (
              <div key={i} className="hp-footer-contact-row">
                <span className="hp-footer-contact-icon">{item.icon}</span>
                <span className="hp-footer-contact-text">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hp-footer-divider" />

        <div className="hp-footer-bottom">
          <p className="hp-footer-copy">© 2026 Cebu Mini Hotel. All rights reserved.</p>
          <div className="hp-footer-legal">
            {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((l) => (
              <button key={l} className="hp-footer-link" style={{ marginBottom: 0 }}>{l}</button>
            ))}
          </div>
        </div>
      </footer>

    </div>
  );
}