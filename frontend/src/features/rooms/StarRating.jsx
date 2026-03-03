import { Star } from 'lucide-react';
import './StarRating.css';

/**
 * StarRating Component
 *
 * @param {number} rating - Current rating (1-5)
 * @param {boolean} interactive - Whether stars are clickable
 * @param {function} onChange - Callback when rating changes (interactive mode)
 * @param {number} size - Star size in pixels (default: 20)
 */
export default function StarRating({ rating = 0, interactive = false, onChange, size = 20 }) {
  const stars = [1, 2, 3, 4, 5];

  const handleClick = (starValue) => {
    if (interactive && onChange) {
      onChange(starValue);
    }
  };

  return (
    <div className={`star-rating ${interactive ? 'interactive' : ''}`}>
      {stars.map((star) => (
        <Star
          key={star}
          size={size}
          className={`star ${star <= rating ? 'filled' : 'empty'}`}
          fill={star <= rating ? 'currentColor' : 'none'}
          onClick={() => handleClick(star)}
          style={{ cursor: interactive ? 'pointer' : 'default' }}
        />
      ))}
    </div>
  );
}