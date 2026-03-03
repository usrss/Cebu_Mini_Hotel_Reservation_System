import { useState } from 'react';
import { Star, ChevronDown, ChevronUp } from 'lucide-react';
import StarRating from './StarRating';
import './RoomReviews.css';

/**
 * RoomReviews Component
 * Displays rating summary and list of reviews
 */
export default function RoomReviews({ reviews, averageRating, reviewCount, ratingBreakdown }) {
  const [showAll, setShowAll] = useState(false);

  if (!reviews || reviews.length === 0) {
    return (
      <div className="room-reviews-empty">
        <Star size={40} className="empty-icon" />
        <p>No reviews yet</p>
        <span>Be the first to review this room!</span>
      </div>
    );
  }

  const displayedReviews = showAll ? reviews : reviews.slice(0, 3);

  return (
    <div className="room-reviews">
      {/* Rating Summary */}
      <div className="rating-summary">
        <div className="rating-score">
          <div className="score-number">{averageRating?.toFixed(1) || '0.0'}</div>
          <StarRating rating={Math.round(averageRating || 0)} size={20} />
          <div className="review-count">{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</div>
        </div>

        {/* Rating Breakdown */}
        {ratingBreakdown && (
          <div className="rating-breakdown">
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className="breakdown-row">
                <span className="star-label">{star} ★</span>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(ratingBreakdown[star] / reviewCount) * 100}%` }}
                  />
                </div>
                <span className="count">{ratingBreakdown[star]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reviews List */}
      <div className="reviews-list">
        <h3 className="reviews-title">Guest Reviews</h3>
        {displayedReviews.map((review) => (
          <div key={review.id} className="review-item">
            <div className="review-header">
              <div className="reviewer-info">
                <div className="reviewer-avatar">
                  {review.guest_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="reviewer-name">{review.guest_name}</div>
                  <div className="review-date">
                    {new Date(review.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>
              </div>
              <StarRating rating={review.rating} size={16} />
            </div>
            {review.review_text && (
              <p className="review-text">{review.review_text}</p>
            )}
            {review.is_verified && (
              <span className="verified-badge">✓ Verified Stay</span>
            )}
          </div>
        ))}

        {/* Show More/Less Button */}
        {reviews.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="show-more-btn"
          >
            {showAll ? (
              <>
                <ChevronUp size={16} />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                Show All {reviews.length} Reviews
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}