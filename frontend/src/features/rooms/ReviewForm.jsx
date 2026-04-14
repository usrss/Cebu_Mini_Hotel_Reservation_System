/**
 * ReviewForm.jsx — Cebu Mini Hotel · Editorial Light Theme
 * ==========================================================
 * Post-checkout review modal.
 * Palette, typography, and spacing match Dashboard.css exactly.
 * No emoji — Lucide icons throughout.
 */

import { useState } from 'react';
import { X, Star, Send, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';
import './ReviewForm.css';

/* ── Star picker ──────────────────────────────────────── */
function StarPicker({ rating, onChange }) {
  const [hovered, setHovered] = useState(0);

  const labels = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Great',
    5: 'Excellent',
  };

  return (
    <div className="rf-star-picker">
      <div className="rf-stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`rf-star-btn${n <= (hovered || rating) ? ' rf-star-btn--filled' : ''}`}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(n)}
            aria-label={`${n} star${n !== 1 ? 's' : ''}`}
          >
            <Star
              size={28}
              fill={n <= (hovered || rating) ? 'currentColor' : 'none'}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
      {(hovered || rating) > 0 && (
        <span className="rf-star-label">{labels[hovered || rating]}</span>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────── */
export default function ReviewForm({ booking, onClose, onSubmit }) {
  const [rating,      setRating]      = useState(0);
  const [reviewText,  setReviewText]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);
  const [submitted,   setSubmitted]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a star rating before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ booking: booking.id, rating, review_text: reviewText });
      setSubmitted(true);
      setTimeout(() => onClose(), 2800);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to submit review. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (submitted) {
    return (
      <div className="rf-backdrop" onClick={onClose}>
        <div className="rf-modal" onClick={(e) => e.stopPropagation()}>
          <div className="rf-success">
            <div className="rf-success-icon">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="rf-success-title">Review Submitted</h3>
            <p className="rf-success-desc">
              Thank you for sharing your experience. Your feedback helps other guests.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rf-backdrop" onClick={onClose}>
      <div className="rf-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="rf-header">
          <div className="rf-header-inner">
            <div className="rf-header-text">
              <span className="rf-eyebrow">Post-Stay Feedback</span>
              <h3 className="rf-title">Rate Your Stay</h3>
            </div>
            <button className="rf-close" onClick={onClose} aria-label="Close review form">
              <X size={18} />
            </button>
          </div>

          {/* Room details strip */}
          <div className="rf-room-strip">
            <div className="rf-room-detail">
              <span className="rf-room-label">Room</span>
              <span className="rf-room-val">
                {booking.room_type} · #{booking.room_number}
              </span>
            </div>
            {booking.check_in && booking.check_out && (
              <div className="rf-room-detail">
                <span className="rf-room-label">Stay</span>
                <span className="rf-room-val">
                  {booking.check_in} → {booking.check_out}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <form className="rf-body" onSubmit={handleSubmit}>

          {/* Star rating */}
          <div className="rf-section">
            <label className="rf-section-label">
              <Star size={14} />
              Overall Rating <span className="rf-required">*</span>
            </label>
            <StarPicker rating={rating} onChange={setRating} />
            {rating === 0 && error && (
              <span className="rf-field-error">
                <AlertCircle size={12} /> {error}
              </span>
            )}
          </div>

          {/* Written review */}
          <div className="rf-section">
            <label className="rf-section-label" htmlFor="rf-review-text">
              <MessageSquare size={14} />
              Your Experience <span className="rf-optional">(optional)</span>
            </label>
            <textarea
              id="rf-review-text"
              className="rf-textarea"
              placeholder="Share what stood out — the room, the service, the location…"
              rows={4}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              maxLength={500}
            />
            <div className="rf-char-count">
              <span>{reviewText.length}</span> / 500
            </div>
          </div>

          {/* API error (non-rating) */}
          {error && rating > 0 && (
            <div className="rf-api-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="rf-actions">
            <button
              type="button"
              className="rf-btn rf-btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Skip for Now
            </button>
            <button
              type="submit"
              className="rf-btn rf-btn-primary"
              disabled={submitting || rating === 0}
            >
              {submitting ? (
                <>
                  <span className="rf-spinner" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send size={15} />
                  Submit Review
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}