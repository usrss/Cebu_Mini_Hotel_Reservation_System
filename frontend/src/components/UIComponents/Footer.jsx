import { useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Footer.css';

/*
 * App Footer — used on Dashboard and all inner pages.
 *
 * Navigation links:
 *   - "Navigate" column → real app routes (/rooms, /login, /register)
 *   - "Explore" column  → homepage section anchors (scrolls to them if on /,
 *                          otherwise navigates to / and lets the user find them)
 *   - "Legal" column    → real legal routes (/privacy-policy, /terms-and-conditions,
 *                          /cookie-policy) consistent with useHotelSettings defaults
 *   - Contact block     → exact contact data used throughout HotelHomepage
 */

/* ── Icon components (inline, no extra dep) ─────────────── */
function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.84 12 19.79 19.79 0 0 1 1.75 3.37 2 2 0 0 1 3.73 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.64a16 16 0 0 0 6.29 6.29l1.16-1.16a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

/* ── Homepage section anchors ────────────────────────────── */
const HOMEPAGE_SECTIONS = {
  'Rooms & Suites': 'hp-rooms',
  'Services':       'hp-services',
  'Gallery':        'hp-gallery',
  'Reviews':        'hp-reviews',
  'FAQs':           'hp-faqs',
  'Contact Us':     'hp-contact',
};

export default function Footer() {
  const navigate = useNavigate();

  /**
   * Navigates to a section anchor on the homepage.
   * If already on /, scrolls smoothly. Otherwise, navigates to /
   * (the homepage will render and the user can scroll from there).
   */
  const goToSection = useCallback((sectionId) => {
    const el = document.getElementById(sectionId);
    if (el) {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.pageYOffset - 72,
        behavior: 'smooth',
      });
    } else {
      navigate('/');
    }
  }, [navigate]);

  return (
    <footer className="app-footer">

      {/* ── Upper: brand · nav groups · contact ── */}
      <div className="app-footer-upper">

        {/* Brand */}
        <div className="app-footer-brand">
          <span className="app-footer-logo">Cebu Mini Hotel</span>
          <span className="app-footer-tagline">Est. 2020 · Cebu City, Philippines</span>
        </div>

        {/* Nav groups */}
        <nav className="app-footer-nav">

          {/* Navigate — real app routes */}
          <div className="app-footer-nav-group">
            <span className="app-footer-nav-label">Navigate</span>
            <Link to="/"         className="app-footer-nav-link">Home</Link>
            <Link to="/rooms"    className="app-footer-nav-link">Browse Rooms</Link>
            <Link to="/login"    className="app-footer-nav-link">Sign In</Link>
            <Link to="/register" className="app-footer-nav-link">Create Account</Link>
          </div>

          {/* Explore — homepage section anchors */}
          <div className="app-footer-nav-group">
            <span className="app-footer-nav-label">Explore</span>
            {Object.entries(HOMEPAGE_SECTIONS).map(([label, id]) => (
              <button
                key={id}
                className="app-footer-nav-link"
                onClick={() => goToSection(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Legal — real legal routes */}
          <div className="app-footer-nav-group">
            <span className="app-footer-nav-label">Legal</span>
            <Link to="/privacy-policy"       className="app-footer-nav-link">Privacy Policy</Link>
            <Link to="/terms-and-conditions" className="app-footer-nav-link">Terms &amp; Conditions</Link>
            <Link to="/cookie-policy"        className="app-footer-nav-link">Cookie Policy</Link>
          </div>

        </nav>

        {/* Contact details — mirrors HotelHomepage contact section exactly */}
        <div className="app-footer-contact">
          <span className="app-footer-contact-label">Get in Touch</span>

          <span className="app-footer-contact-item">
            <MapPinIcon />
            123 Colon St., Cebu City, 6000
          </span>

          <a href="tel:+63321234567" className="app-footer-contact-item">
            <PhoneIcon />
            +63 32 123 4567
          </a>

          <a href="mailto:reservations@cebu-mini.ph" className="app-footer-contact-item">
            <MailIcon />
            reservations@cebu-mini.ph
          </a>
        </div>

      </div>

      {/* ── Lower: copyright · legal shorthand ── */}
      <div className="app-footer-lower">
        <p className="app-footer-copy">
          © 2026 Cebu Mini Hotel. All rights reserved.
        </p>
        <div className="app-footer-legal">
          <Link to="/privacy-policy"       className="app-footer-legal-link">Privacy</Link>
          <span className="app-footer-legal-sep" />
          <Link to="/terms-and-conditions" className="app-footer-legal-link">Terms</Link>
          <span className="app-footer-legal-sep" />
          <Link to="/cookie-policy"        className="app-footer-legal-link">Cookies</Link>
        </div>
      </div>

    </footer>
  );
}