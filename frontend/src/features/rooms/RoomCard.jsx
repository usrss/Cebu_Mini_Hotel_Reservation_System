// RoomCard.jsx — with discount % badge + discounted price display + rating badge
import { Link } from 'react-router-dom';
import { Users, Bed, Maximize2, ArrowRight, Tag } from 'lucide-react';
import './RoomCard.css';

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function RoomCard({ room }) {
  const {
    id,
    room_number,
    room_type_display,
    bed_type_display,
    capacity,
    price_per_night,
    discounted_price,
    discount_percentage,
    status,
    status_display,
    size_sqm,
    primary_image,
    panorama_image_url,
    average_rating,
    review_count,
  } = room;

  const hasDiscount    = Number(discount_percentage) > 0;
  const effectivePrice = hasDiscount ? discounted_price : price_per_night;

  return (
    <div className="room-card">
      {/* Image */}
      <Link to={`/rooms/${id}`} className="room-card-image-wrapper">
        {primary_image?.image_url ? (
          <img
            src={primary_image.image_url}
            alt={`${room_type_display} Room ${room_number}`}
            className="room-card-image"
          />
        ) : (
          <div className="room-card-image-placeholder">
            <Bed size={48} />
          </div>
        )}

        <div className="room-card-overlay" />

        {/* Status badge */}
        <div className={`room-card-status status-${status}`}>{status_display}</div>

        {/* Discount badge */}
        {hasDiscount && (
          <div className="room-card-discount-badge">
            <Tag size={11} />
            {Number(discount_percentage)}% OFF
          </div>
        )}

        {/* 360° badge */}
        {panorama_image_url && (
          <div className="room-card-360-badge">360° Available</div>
        )}
      </Link>

      {/* Content */}
      <div className="room-card-content">
        <div className="room-card-title-row">
          <Link to={`/rooms/${id}`}>
            <h3 className="room-card-title">{room_type_display} Room</h3>
          </Link>
          {review_count > 0 ? (
            <span className="room-card-rating">★ {Number(average_rating).toFixed(1)} | {review_count} {review_count === 1 ? 'review' : 'reviews'}</span>
          ) : (
            <span className="room-card-rating room-card-rating--new">No reviews yet</span>
          )}
        </div>

        {/* Specs */}
        <div className="room-card-specs">
          <div className="room-spec">
            <Users size={16} />
            <span>{capacity} {capacity === 1 ? 'Guest' : 'Guests'}</span>
          </div>
          <div className="room-spec">
            <Bed size={16} />
            <span>{bed_type_display}</span>
          </div>
          {size_sqm && (
            <div className="room-spec">
              <Maximize2 size={16} />
              <span>{size_sqm}m²</span>
            </div>
          )}
        </div>

        {/* Price & CTA */}
        <div className="room-card-footer">
          <div className="room-card-price">
            {hasDiscount && (
              <div className="price-original">₱{formatPrice(price_per_night)}</div>
            )}
            <div className="price-amount">₱{formatPrice(effectivePrice)}</div>
            <div className="price-label">per night</div>
          </div>
          <Link to={`/rooms/${id}`} className="btn btn-primary">
            View Details
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}