/**
 * src/features/review/GuestReviewPage.jsx
 *
 * Token-based post-checkout review page.
 * No guest account or login required — the UUID token IS the credential.
 *
 * Route: /review/:token
 *
 * Flow:
 *   1. On mount: GET /rooms/reviews/token/<token>/ → validate token, load booking info
 *   2. Guest fills in rating (1–5 stars) and optional comment
 *   3. POST /rooms/reviews/token/<token>/ → submit review
 *   4. Token is marked used server-side → prevents resubmission
 *
 * Add to your router:
 *   <Route path="/review/:token" element={<GuestReviewPage />} />
 *
 * This page is intentionally NOT behind any auth protection — it must
 * be publicly accessible since walk-in guests have no account.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// ── Star rating component ──────────────────────────────────────────────────────

function StarRating({ value, onChange, disabled }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div
      style={{
        display:    'flex',
        gap:        8,
        justifyContent: 'center',
        margin:     '8px 0 20px',
      }}
      role="group"
      aria-label="Star rating"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onMouseEnter={() => !disabled && setHovered(star)}
          onMouseLeave={() => !disabled && setHovered(0)}
          onClick={() => !disabled && onChange(star)}
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          style={{
            background: 'none',
            border:     'none',
            cursor:     disabled ? 'default' : 'pointer',
            padding:    '4px',
            fontSize:   40,
            color:      (hovered || value) >= star ? '#C9A84C' : 'rgba(201,168,76,0.2)',
            transition: 'color 0.15s, transform 0.15s',
            transform:  !disabled && (hovered || value) >= star ? 'scale(1.1)' : 'scale(1)',
            lineHeight: 1,
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

const STAR_LABELS = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuestReviewPage() {
  const { token } = useParams();

  // Token validation state
  const [phase,       setPhase]       = useState('loading'); // loading | valid | invalid | submitted | error
  const [bookingInfo, setBookingInfo] = useState(null);
  const [errorMsg,    setErrorMsg]    = useState('');

  // Form state
  const [rating,      setRating]      = useState(0);
  const [reviewText,  setReviewText]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Validate token on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setPhase('invalid'); setErrorMsg('No review token found in the URL.'); return; }

    fetch(`${API_BASE}/rooms/reviews/token/${token}/`, {
      method:  'GET',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data.valid) {
          setBookingInfo(data.booking);
          setPhase('valid');
        } else {
          setErrorMsg(data.error || 'This review link is not valid.');
          setPhase('invalid');
        }
      })
      .catch(() => {
        setErrorMsg('Unable to verify your review link. Please check your connection.');
        setPhase('error');
      });
  }, [token]);

  // ── Submit review ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');

    if (rating === 0) { setSubmitError('Please select a star rating.'); return; }

    setSubmitting(true);
    try {
      const res  = await fetch(`${API_BASE}/rooms/reviews/token/${token}/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rating, review_text: reviewText.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setPhase('submitted');
      } else {
        setSubmitError(data.error || 'Submission failed. Please try again.');
      }
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles (inline — this page has no imported CSS) ───────────────────────
  const s = {
    page: {
      minHeight:       '100vh',
      background:      '#0A0E1A',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         '32px 16px',
      fontFamily:      "'Raleway', 'Helvetica Neue', sans-serif",
      color:           '#F8F6F0',
    },
    card: {
      background:   '#111827',
      border:       '1px solid rgba(201,168,76,0.22)',
      maxWidth:     520,
      width:        '100%',
      padding:      '40px 36px',
      position:     'relative',
      overflow:     'hidden',
    },
    topBar: {
      position:   'absolute',
      top:        0,
      left:       0,
      right:      0,
      height:     3,
      background: 'linear-gradient(90deg, #C9A84C, transparent)',
    },
    eyebrow: {
      fontSize:      10,
      fontWeight:    600,
      letterSpacing: 3,
      textTransform: 'uppercase',
      color:         '#C9A84C',
      margin:        '0 0 10px',
    },
    title: {
      fontFamily:  "'Playfair Display', Georgia, serif",
      fontSize:    28,
      fontWeight:  700,
      color:       '#F8F6F0',
      margin:      '0 0 6px',
      lineHeight:  1.2,
    },
    subtitle: {
      fontSize:   13,
      color:      'rgba(248,246,240,0.55)',
      margin:     '0 0 28px',
      lineHeight: 1.5,
    },
    infoGrid: {
      display:             'grid',
      gridTemplateColumns: '1fr 1fr',
      gap:                 '12px 20px',
      background:          'rgba(201,168,76,0.07)',
      border:              '1px solid rgba(201,168,76,0.15)',
      padding:             '16px 18px',
      marginBottom:        28,
    },
    infoLabel: {
      fontSize:      10,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color:         '#C9A84C',
      marginBottom:  2,
    },
    infoValue: {
      fontSize:   14,
      fontWeight: 600,
      color:      '#F8F6F0',
      margin:     0,
    },
    label: {
      display:       'block',
      fontSize:      10,
      fontWeight:    600,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color:         '#C9A84C',
      marginBottom:  8,
    },
    textarea: {
      width:       '100%',
      background:  '#0F1729',
      border:      '1px solid rgba(201,168,76,0.22)',
      color:       '#F8F6F0',
      fontFamily:  "'Raleway', sans-serif",
      fontSize:    13,
      padding:     '12px 14px',
      outline:     'none',
      resize:      'vertical',
      minHeight:   100,
      lineHeight:  1.6,
      boxSizing:   'border-box',
      marginBottom: 20,
    },
    btn: {
      width:         '100%',
      background:    'rgba(201,168,76,0.12)',
      border:        '1px solid #C9A84C',
      color:         '#C9A84C',
      fontFamily:    "'Raleway', sans-serif",
      fontSize:      11,
      fontWeight:    700,
      letterSpacing: 2,
      textTransform: 'uppercase',
      padding:       '14px',
      cursor:        'pointer',
      transition:    'background 0.18s',
    },
    error: {
      background:   'rgba(248,113,113,0.08)',
      border:       '1px solid rgba(248,113,113,0.3)',
      color:        '#F87171',
      fontSize:     13,
      padding:      '10px 14px',
      marginBottom: 16,
    },
    successIcon: {
      width:          72,
      height:         72,
      borderRadius:   '50%',
      background:     'rgba(52,211,153,0.1)',
      border:         '2px solid rgba(52,211,153,0.4)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      fontSize:       32,
      margin:         '0 auto 20px',
    },
    successTitle: {
      fontFamily: "'Playfair Display', serif",
      fontSize:   26,
      color:      '#34D399',
      margin:     '0 0 8px',
      textAlign:  'center',
    },
    successSub: {
      fontSize:   14,
      color:      'rgba(248,246,240,0.55)',
      textAlign:  'center',
      lineHeight: 1.6,
      margin:     0,
    },
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.topBar} />
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 32, height: 32, margin: '0 auto 16px',
              border: '2px solid rgba(201,168,76,0.3)',
              borderTopColor: '#C9A84C',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{ color: 'rgba(248,246,240,0.55)', fontSize: 13 }}>Verifying your review link…</p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Invalid / Error ────────────────────────────────────────────────────────
  if (phase === 'invalid' || phase === 'error') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ ...s.topBar, background: 'linear-gradient(90deg, #F87171, transparent)' }} />
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(248,113,113,0.1)', border: '2px solid rgba(248,113,113,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, margin: '0 auto 18px',
            }}>
              ✕
            </div>
            <h2 style={{ ...s.title, color: '#F87171', textAlign: 'center', marginBottom: 10 }}>
              Link Not Valid
            </h2>
            <p style={s.successSub}>{errorMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitted ──────────────────────────────────────────────────────────────
  if (phase === 'submitted') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.topBar} />
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={s.successIcon}>✓</div>
            <h2 style={s.successTitle}>Thank You!</h2>
            <p style={s.successSub}>
              Your review has been submitted successfully.{' '}
              {bookingInfo && (
                <>We appreciate your feedback about your stay in Room <strong>{bookingInfo.room_number}</strong>.</>
              )}
            </p>
            <p style={{ ...s.successSub, marginTop: 12, fontSize: 12 }}>
              Your review helps future guests and helps us improve.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Valid — show review form ────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.topBar} />

        {/* Header */}
        <p style={s.eyebrow}>Post-Stay Review</p>
        <h1 style={s.title}>How Was Your Stay?</h1>
        <p style={s.subtitle}>
          Your feedback is completely anonymous and helps us serve future guests better.
        </p>

        {/* Booking info */}
        {bookingInfo && (
          <div style={s.infoGrid}>
            {[
              ['Room',      `Room ${bookingInfo.room_number} — ${bookingInfo.room_type}`],
              ['Guest',     bookingInfo.full_name],
              ['Check-In',  new Date(bookingInfo.check_in  + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })],
              ['Check-Out', new Date(bookingInfo.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={s.infoLabel}>{label}</p>
                <p style={s.infoValue}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>

          {/* Star rating */}
          <label style={{ ...s.label, textAlign: 'center', display: 'block' }}>
            Your Rating *
          </label>
          <StarRating value={rating} onChange={setRating} disabled={submitting} />
          {rating > 0 && (
            <p style={{
              textAlign:   'center',
              fontSize:    13,
              color:       '#C9A84C',
              fontWeight:  600,
              letterSpacing: 1,
              marginBottom: 20,
              marginTop:   -12,
            }}>
              {STAR_LABELS[rating]}
            </p>
          )}

          {/* Review text */}
          <label style={s.label}>
            Your Review <span style={{ color: 'rgba(248,246,240,0.4)', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            style={s.textarea}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Tell us about your experience — what did you enjoy? What could be improved?"
            maxLength={1000}
            disabled={submitting}
          />
          {reviewText.length > 0 && (
            <p style={{ fontSize: 11, color: 'rgba(248,246,240,0.3)', textAlign: 'right', marginTop: -16, marginBottom: 16 }}>
              {reviewText.length}/1000
            </p>
          )}

          {/* Error */}
          {submitError && <div style={s.error}>{submitError}</div>}

          {/* Submit */}
          <button
            type="submit"
            style={{
              ...s.btn,
              opacity: submitting || rating === 0 ? 0.5 : 1,
              cursor:  submitting || rating === 0 ? 'not-allowed' : 'pointer',
            }}
            disabled={submitting || rating === 0}
          >
            {submitting ? 'Submitting…' : 'Submit Review'}
          </button>

          <p style={{ fontSize: 11, color: 'rgba(248,246,240,0.3)', textAlign: 'center', marginTop: 14 }}>
            This link can only be used once. Your review will appear on our room listing.
          </p>
        </form>

      </div>

      {/* Font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Raleway:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        textarea:focus { border-color: #C9A84C !important; outline: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}