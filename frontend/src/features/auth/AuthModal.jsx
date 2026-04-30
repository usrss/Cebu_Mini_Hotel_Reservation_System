// src/features/auth/AuthModal.jsx
// Light editorial modal shell — image 2 palette
// All auth logic (mode switching, email passing, slide rotation) preserved exactly.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import VerifyCode from './VerifyCode';
import ForgotPassword from './ForgotPassword';
import { getStoredUser } from '../../services/api';
import './AuthModal.css';

const SLIDES = [
  {
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1400&q=80',
    label: 'Cebu Mini Hotel',
    caption: 'Quiet Luxury in the Heart of Cebu',
    sub: 'Experience a curated sanctuary designed for the modern traveler.',
  },
  {
    image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1400&q=80',
    label: 'Superior Rooms',
    caption: 'Spaces Crafted for Comfort',
    sub: 'Every detail is an intentional step towards serenity.',
  },
  {
    image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1400&q=80',
    label: 'Exclusive Views',
    caption: 'Wake Up to the City',
    sub: "Panoramic views of Cebu's vibrant skyline await you.",
  },
  {
    image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1400&q=80',
    label: 'Fine Dining',
    caption: 'Flavors of the Visayas',
    sub: 'A culinary journey through authentic Cebuano cuisine.',
  },
];

function getPostLoginRoute() {
  const user = getStoredUser();
  if (!user) return '/';
  if (!user?.is_staff) return '/dashboard';
  const role =
    user?.staff_profile?.effective_role ??
    (user?.is_staff ? 'admin' : null);
  switch (role) {
    case 'front_desk':   return '/staff/front-desk';
    case 'housekeeping': return '/staff/cleaning';
    case 'maintenance':  return '/staff/maintenance';
    case 'security':     return '/staff/incidents';
    default:             return '/admin/dashboard';
  }
}

export default function AuthModal({ mode: initialMode = 'login', verifyEmail = '', onClose }) {
  const navigate = useNavigate();
  const [mode, setMode]               = useState(initialMode);
  const [pendingEmail, setPendingEmail] = useState(verifyEmail);
  const [slideIndex, setSlideIndex]   = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0); // which slide is currently "visible"
  const timerRef = useRef(null);

  /* ── Preload all images on mount ── */
  useEffect(() => {
    SLIDES.forEach(s => {
      const img = new Image();
      img.src = s.image;
    });
  }, []);

  /* ── Auto-rotate: crossfade by toggling visibleIndex ── */
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSlideIndex(i => {
        const next = (i + 1) % SLIDES.length;
        // Small delay so the outgoing slide fades before the incoming one fades in
        setTimeout(() => setVisibleIndex(next), 50);
        return next;
      });
    }, 5000);
    return () => clearInterval(timerRef.current);
  }, []);

  /* ── Close on Escape ── */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* ── Lock body scroll while open ── */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  /* ── Manual dot navigation ── */
  const goToSlide = (i) => {
    clearInterval(timerRef.current);
    setSlideIndex(i);
    setTimeout(() => setVisibleIndex(i), 50);
    // Restart auto-rotate
    timerRef.current = setInterval(() => {
      setSlideIndex(prev => {
        const next = (prev + 1) % SLIDES.length;
        setTimeout(() => setVisibleIndex(next), 50);
        return next;
      });
    }, 5000);
  };

  /* ── Mode switching (all logic preserved) ── */
  const switchMode = (m, email) => {
    if (email) setPendingEmail(email);
    setMode(m);
  };

  /* ── Handle successful authentication ── */
  const handleAuthSuccess = () => {
    if (onClose) {
      onClose();
    }
    // Use the post-login routing logic to send users to the correct page
    navigate(getPostLoginRoute(), { replace: true });
  };

  const renderPanel = () => {
    switch (mode) {
      case 'register':
        return (
          <Register
            onSwitchToLogin={() => switchMode('login')}
            onVerify={(email) => switchMode('verify', email)}
            onSuccess={handleAuthSuccess}
          />
        );
      case 'verify':
        return (
          <VerifyCode
            email={pendingEmail}
            onSwitchToLogin={() => switchMode('login')}
            onSuccess={handleAuthSuccess}
          />
        );
      case 'forgot':
        return (
          <ForgotPassword
            onSwitchToLogin={() => switchMode('login')}
          />
        );
      default:
        return (
          <Login
            onSwitchToRegister={() => switchMode('register')}
            onForgotPassword={() => switchMode('forgot')}
            onClose={onClose}
            onSuccess={handleAuthSuccess}
          />
        );
    }
  };

  const currentSlide = SLIDES[visibleIndex];

  return (
    <div className="am-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="am-modal">

        {/* ── LEFT: Image panel with CSS crossfade ── */}
        <div className="am-image-panel">
          {/* Render ALL slides stacked; only the active one is visible */}
          {SLIDES.map((slide, i) => (
            <div
              key={i}
              className={`am-image-bg${visibleIndex === i ? ' am-image-bg--visible' : ''}`}
              style={{ backgroundImage: `url(${slide.image})` }}
            />
          ))}

          <div className="am-image-overlay" />

          <div className="am-image-content">
            <div className="am-brand">
              <span className="am-brand-name">Cebu Mini Hotel</span>
              <span className="am-brand-sub">Cebu City, Philippines</span>
            </div>

            <div className={`am-slide-text am-slide-text--visible`}>
              <span className="am-slide-label">{currentSlide.label}</span>
              <h2 className="am-slide-caption">{currentSlide.caption}</h2>
              <p className="am-slide-sub">{currentSlide.sub}</p>
            </div>

            <div className="am-slide-dots">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  className={`am-dot${visibleIndex === i ? ' am-dot--active' : ''}`}
                  onClick={() => goToSlide(i)}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Form panel ── */}
        <div className="am-form-panel">
          <button className="am-close-btn" onClick={onClose} aria-label="Close modal">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>

          {/* This div scrolls independently — the key fix */}
          <div className="am-form-scroll">
            {renderPanel()}
          </div>
        </div>

      </div>
    </div>
  );
}