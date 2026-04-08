

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/* ── Mirrors HotelHomepage NAV_SECTION_MAP exactly ── */
const NAV_SECTION_MAP = {
  Rooms:    'hp-rooms',
  Services: 'hp-services',
  Gallery:  'hp-gallery',
  Reviews:  'hp-reviews',
  FAQs:     'hp-faqs',
  Contact:  'hp-contact',
};

const AMENITY_TITLES = ['Terra Dining', 'Infinity Pool', 'Event Hosting'];

export default function Footer() {
  const navigate = useNavigate();

  /**
   * Scroll to a section by id.
   * If the section doesn't exist on the current page (e.g. we're on /rooms,
   * not on the homepage), navigate home and let the hash handle scrolling.
   */
  const scrollToSection = useCallback((id) => {
    const el = document.getElementById(id);
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
    <footer className="hp-footer">

      {/* ── Top row: brand + nav columns ── */}
      <div className="hp-footer-top">

        {/* Brand */}
        <div className="hp-footer-brand">
          <h3 className="hp-footer-logo">Cebu Mini Hotel</h3>
          <span className="hp-footer-logo-sub">Est. 2020 · Cebu City, Philippines</span>
          <p className="hp-footer-desc">
            Defining the new standard of Visayan luxury through silence, space, and genuine Filipino
            hospitality in the heart of Cebu City.
          </p>
          <div className="hp-footer-socials">
            {['fb', 'ig', 'tw', 'yt'].map((s) => (
              <button key={s} className="hp-footer-social">{s}</button>
            ))}
          </div>
        </div>

        {/* Three nav columns */}
        <div className="hp-footer-nav">

          {/* Discover */}
          <div>
            <span className="hp-footer-col-title">Discover</span>
            {Object.entries(NAV_SECTION_MAP).map(([label, id]) => (
              <button
                key={label}
                className="hp-footer-link"
                onClick={() => scrollToSection(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Services */}
          <div>
            <span className="hp-footer-col-title">Services</span>
            {AMENITY_TITLES.map((title) => (
              <button
                key={title}
                className="hp-footer-link"
                onClick={() => scrollToSection('hp-services')}
              >
                {title}
              </button>
            ))}
          </div>

          {/* Contact */}
          <div>
            <span className="hp-footer-col-title">Contact</span>
            {[
              '123 Colon St., Cebu City',
              '+63 32 123 4567',
              'reservations@cebu-mini.ph',
              'www.cebu-mini.ph',
            ].map((text, i) => (
              <p key={i} className="hp-footer-link" style={{ cursor: 'default' }}>
                {text}
              </p>
            ))}
          </div>

        </div>
      </div>

      {/* ── Divider ── */}
      <div className="hp-footer-divider" />

      {/* ── Bottom bar ── */}
      <div className="hp-footer-bottom">
        <p className="hp-footer-copy">© 2026 Cebu Mini Hotel. All rights reserved.</p>
        <div className="hp-footer-legal">
          {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((l) => (
            <button key={l} className="hp-footer-link" style={{ marginBottom: 0 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

    </footer>
  );
}