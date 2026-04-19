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
import { Star, ChevronDown, ChevronUp } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// ── Star rating component ──────────────────────────────────────────────────────

function StarRating({ value, onChange, disabled }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div
      style={{
        display:        'flex',
        gap:            6,
        justifyContent: 'center',
        margin:         '8px 0 20px',
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
            background:  'none',
            border:      'none',
            cursor:      disabled ? 'default' : 'pointer',
            padding:     '2px',
            fontSize:    36,
            color:       (hovered || value) >= star ? '#f59e0b' : '#e5e7eb',
            transition:  'color 0.15s, transform 0.15s',
            transform:   !disabled && (hovered || value) >= star ? 'scale(1.12)' : 'scale(1)',
            lineHeight:  1,
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

  // ── Shared styles ──────────────────────────────────────────────────────────
  const page = {
    minHeight:       '100vh',
    background:      '#f9fafb',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '32px 16px',
    fontFamily:      "'Raleway', 'Helvetica Neue', sans-serif",
    color:           '#1a1a1a',
  };

  const card = {
    background:   '#ffffff',
    border:       '1px solid #e5e7eb',
    borderRadius: 12,
    maxWidth:     520,
    width:        '100%',
    padding:      '36px 32px',
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width:          32,
              height:         32,
              margin:         '0 auto 16px',
              border:         '2px solid #e5e7eb',
              borderTopColor: '#f59e0b',
              borderRadius:   '50%',
              animation:      'spin 0.8s linear infinite',
            }} />
            <p style={{ color: '#888', fontSize: 13, margin: 0 }}>Verifying your review link…</p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Invalid / Error ────────────────────────────────────────────────────────
  if (phase === 'invalid' || phase === 'error') {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width:          64,
              height:         64,
              borderRadius:   '50%',
              background:     '#fef2f2',
              border:         '2px solid #fecaca',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       26,
              margin:         '0 auto 18px',
              color:          '#ef4444',
            }}>
              ✕
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#ef4444', margin: '0 0 8px' }}>
              Link Not Valid
            </h2>
            <p style={{ fontSize: 14, color: '#888', margin: 0, lineHeight: 1.6 }}>{errorMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitted ──────────────────────────────────────────────────────────────
  if (phase === 'submitted') {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width:          72,
              height:         72,
              borderRadius:   '50%',
              background:     '#f0fdf4',
              border:         '2px solid #bbf7d0',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       30,
              margin:         '0 auto 20px',
              color:          '#16a34a',
            }}>
              ✓
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#16a34a', margin: '0 0 8px' }}>
              Thank You!
            </h2>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, margin: 0 }}>
              Your review has been submitted successfully.{' '}
              {bookingInfo && (
                <>We appreciate your feedback about your stay in Room <strong>{bookingInfo.room_number}</strong>.</>
              )}
            </p>
            <p style={{ fontSize: 12, color: '#aaa', marginTop: 10 }}>
              Your review helps future guests and helps us improve.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Valid — show review form ───────────────────────────────────────────────
  return (
    <div style={page}>
      <div style={card}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{
            fontSize:      10,
            fontWeight:    600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color:         '#a78b6f',
            margin:        '0 0 6px',
          }}>
            Post-Stay Review
          </p>
          <h1 style={{
            fontSize:   22,
            fontWeight: 700,
            color:      '#1a1a1a',
            margin:     '0 0 6px',
            lineHeight: 1.2,
          }}>
            How Was Your Stay?
          </h1>
          <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.5 }}>
            Your feedback is completely anonymous and helps us serve future guests better.
          </p>
        </div>

        {/* Booking info grid */}
        {bookingInfo && (
          <div style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 '10px 16px',
            background:          '#f9fafb',
            border:              '1px solid #e5e7eb',
            borderRadius:        8,
            padding:             '14px 16px',
            marginBottom:        24,
          }}>
            {[
              ['Room',      `Room ${bookingInfo.room_number} — ${bookingInfo.room_type}`],
              ['Guest',     bookingInfo.full_name],
              ['Check-In',  new Date(bookingInfo.check_in  + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })],
              ['Check-Out', new Date(bookingInfo.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={{
                  fontSize:      10,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color:         '#a78b6f',
                  margin:        '0 0 2px',
                  fontWeight:    600,
                }}>
                  {label}
                </p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Rating summary display (mirrors RoomReviews rating-score) */}
        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20, marginBottom: 4 }}>

          {/* Label */}
          <p style={{
            fontSize:      10,
            fontWeight:    600,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color:         '#555',
            margin:        '0 0 4px',
            textAlign:     'center',
          }}>
            Your Rating *
          </p>

          {/* Interactive stars */}
          <StarRating value={rating} onChange={setRating} disabled={submitting} />

          {/* Score label (mirrors score-number + review-count style) */}
          {rating > 0 && (
            <div style={{ textAlign: 'center', marginTop: -12, marginBottom: 20 }}>
              <span style={{
                fontSize:    28,
                fontWeight:  700,
                color:       '#1a1a1a',
                lineHeight:  1,
                display:     'block',
              }}>
                {rating}.0
              </span>
              <span style={{
                fontSize:   12,
                color:      '#888',
                fontWeight: 500,
              }}>
                {STAR_LABELS[rating]}
              </span>
            </div>
          )}
        </div>

        {/* Review form */}
        <form onSubmit={handleSubmit}>

          {/* Review text */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20 }}>
            <label style={{
              display:       'block',
              fontSize:      10,
              fontWeight:    600,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color:         '#555',
              marginBottom:  8,
            }}>
              Your Review{' '}
              <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              style={{
                width:        '100%',
                background:   '#f9fafb',
                border:       '1px solid #e5e7eb',
                borderRadius: 8,
                color:        '#1a1a1a',
                fontFamily:   "'Raleway', sans-serif",
                fontSize:     13,
                padding:      '12px 14px',
                outline:      'none',
                resize:       'vertical',
                minHeight:    100,
                lineHeight:   1.6,
                boxSizing:    'border-box',
                marginBottom: 4,
                transition:   'border-color 0.15s',
              }}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Tell us about your experience — what did you enjoy? What could be improved?"
              maxLength={1000}
              disabled={submitting}
              onFocus={e  => e.target.style.borderColor = '#f59e0b'}
              onBlur={e   => e.target.style.borderColor = '#e5e7eb'}
            />
            {reviewText.length > 0 && (
              <p style={{ fontSize: 11, color: '#bbb', textAlign: 'right', margin: '0 0 16px' }}>
                {reviewText.length}/1000
              </p>
            )}
          </div>

          {/* Error */}
          {submitError && (
            <div style={{
              background:   '#fef2f2',
              border:       '1px solid #fecaca',
              borderRadius: 6,
              color:        '#dc2626',
              fontSize:     13,
              padding:      '10px 14px',
              marginBottom: 16,
            }}>
              {submitError}
            </div>
          )}

          {/* Submit — mirrors show-more-btn style */}
          <button
            type="submit"
            style={{
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
              width:         '100%',
              padding:       '0.65rem',
              background:    rating > 0 && !submitting ? '#f59e0b' : 'none',
              border:        '1px solid #e5e7eb',
              borderColor:   rating > 0 && !submitting ? '#f59e0b' : '#e5e7eb',
              borderRadius:  8,
              fontFamily:    "'Raleway', sans-serif",
              fontSize:      '0.88rem',
              fontWeight:    700,
              color:         rating > 0 && !submitting ? '#fff' : '#aaa',
              cursor:        submitting || rating === 0 ? 'not-allowed' : 'pointer',
              opacity:       submitting || rating === 0 ? 0.6 : 1,
              transition:    'background 0.18s, border-color 0.18s, color 0.18s',
              letterSpacing: 0.5,
              marginTop:     8,
            }}
            disabled={submitting || rating === 0}
          >
            {submitting ? 'Submitting…' : 'Submit Review'}
          </button>

          <p style={{ fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
            This link can only be used once. Your review will appear on our room listing.
          </p>
        </form>

      </div>

      {/* Font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Raleway:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #f9fafb; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}