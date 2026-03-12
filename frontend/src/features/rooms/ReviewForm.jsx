import { useState } from 'react';
import { X, Send } from 'lucide-react';
import StarRating from './StarRating';
import './ReviewForm.css';

/**
 * ReviewForm Modal
 * Opens after checkout to collect guest rating and review
 */
export default function ReviewForm({ booking, onClose, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (rating === 0) {
      setError('Please select a star rating');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        booking: booking.id,
        rating,
        review_text: reviewText
      });
      setSubmitted(true);
      setTimeout(() => onClose(), 2500);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="review-form-modal" onClick={onClose}>
        <div className="review-form-container" onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '220px' }}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⭐</div>
            <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.2rem', fontWeight: 600 }}>Thank You!</h3>
            <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>Your review has been submitted successfully.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="review-form-modal" onClick={onClose}>
      <div className="review-form-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="review-form-header">
          <h3>Rate Your Stay</h3>
          <button onClick={onClose} className="close-btn">
            <X size={20} />
          </button>
        </div>

        {/* Room Info */}
        <div className="review-room-info">
          <p className="room-name">
            {booking.room_type} Room {booking.room_number}
          </p>
          <p className="stay-dates">
            {booking.check_in} to {booking.check_out}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="review-form">
          {/* Star Rating */}
          <div className="form-group">
            <label>How was your experience? <span className="required">*</span></label>
            <div className="rating-input">
              <StarRating
                rating={rating}
                interactive={true}
                onChange={setRating}
                size={32}
              />
              {rating > 0 && (
                <span className="rating-text">
                  {rating === 5 && '⭐ Excellent!'}
                  {rating === 4 && '😊 Great'}
                  {rating === 3 && '👍 Good'}
                  {rating === 2 && '😐 Fair'}
                  {rating === 1 && '😞 Poor'}
                </span>
              )}
            </div>
          </div>

          {/* Written Review */}
          <div className="form-group">
            <label>Share your experience (optional)</label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Tell us about your stay..."
              rows={4}
              className="review-textarea"
              maxLength={500}
            />
            <span className="char-count">{reviewText.length}/500</span>
          </div>

          {/* Error */}
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Skip for Now
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || rating === 0}>
              {submitting ? (
                'Submitting...'
              ) : (
                <>
                  <Send size={16} />
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