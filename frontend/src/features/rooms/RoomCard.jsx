// RoomCard.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Bed, Maximize2, ArrowRight, Tag, X } from 'lucide-react';
import './RoomCard.css';

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ── Auth Modal ─────────────────────────────────────────────── */
function AuthModal({ room, onClose }) {
  const navigate = useNavigate();

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="rc-modal-backdrop" onClick={handleBackdrop}>
      <div className="rc-modal">

        {/* Close */}
        <button className="rc-modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        {/* Room preview */}
        {room.primary_image?.image_url && (
          <div className="rc-modal-img-wrap">
            <img src={room.primary_image.image_url} alt={room.room_type_display} className="rc-modal-img" />
            <div className="rc-modal-img-overlay" />
            <div className="rc-modal-img-label">
              <span className="rc-modal-img-name">{room.room_type_display} Room</span>
              <span className="rc-modal-img-price">
                ₱{formatPrice(Number(room.discount_percentage) > 0 ? room.discounted_price : room.price_per_night)}
                <span> / night</span>
              </span>
            </div>
          </div>
        )}

        {/* Text */}
        <div className="rc-modal-body">
          <p className="rc-modal-eyebrow">Members Only</p>
          <h2 className="rc-modal-title">Sign in to view this room</h2>
          <p className="rc-modal-sub">
            Create a free account or log in to explore room details, check availability, and complete your booking.
          </p>

          {/* CTAs */}
          <div className="rc-modal-btns">
            <button
              className="rc-modal-btn-primary"
              onClick={() => { onClose(); navigate('/register'); }}
            >
              Create Account
            </button>
            <button
              className="rc-modal-btn-secondary"
              onClick={() => { onClose(); navigate('/login'); }}
            >
              Log In
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ── Main Card ──────────────────────────────────────────────── */
export default function RoomCard({ room }) {
  const [showModal, setShowModal] = useState(false);

  const isAuthenticated = !!(
    localStorage.getItem('accessToken')  || sessionStorage.getItem('accessToken') ||
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
  );

  const {
    id,
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

  const handleViewDetails = (e) => {
    if (!isAuthenticated) {
      e.preventDefault();
      setShowModal(true);
    }
    // if authenticated, the Link handles navigation normally
  };

  return (
    <>
      <div className="room-card">

        {/* Image */}
        <Link
          to={`/rooms/${id}`}
          className="room-card-image-wrapper"
          onClick={handleViewDetails}
        >
          {primary_image?.image_url ? (
            <img
              src={primary_image.image_url}
              alt={`${room_type_display} Room`}
              className="room-card-image"
            />
          ) : (
            <div className="room-card-image-placeholder">
              <Bed size={48} />
            </div>
          )}

          <div className="room-card-overlay" />

          {/* Status — top left */}
          <div className={`room-card-status status-${status}`}>{status_display}</div>

          {/* Discount — bottom right */}
          {hasDiscount && (
            <div className="room-card-discount-badge">
              <Tag size={10} />
              {Number(discount_percentage)}% OFF
            </div>
          )}

          {/* 360° — bottom left */}
          {panorama_image_url && (
            <div className="room-card-360-badge">360°</div>
          )}
        </Link>

        {/* Content */}
        <div className="room-card-content">

          {/* Title + rating */}
          <div className="room-card-title-row">
            <h3 className="room-card-title">{room_type_display} Room</h3>
            <span className="room-card-rating">
              {review_count > 0
                ? `★ ${Number(average_rating).toFixed(1)}`
                : 'No reviews yet'}
            </span>
          </div>

          {/* Specs */}
          <div className="room-card-specs">
            <div className="room-spec">
              <Users size={14} />
              <span>{capacity} {capacity === 1 ? 'Guest' : 'Guests'}</span>
            </div>
            <div className="room-spec">
              <Bed size={14} />
              <span>{bed_type_display}</span>
            </div>
            {size_sqm && (
              <div className="room-spec">
                <Maximize2 size={14} />
                <span>{size_sqm}m²</span>
              </div>
            )}
          </div>

          {/* Footer — price + button */}
          <div className="room-card-footer">
            <div className="room-card-price">
              {hasDiscount && (
                <div className="price-original">₱{formatPrice(price_per_night)}</div>
              )}
              <div className="price-amount">₱{formatPrice(effectivePrice)}</div>
              <div className="price-label">/ Night</div>
            </div>

            {/* Button — navigates if authed, opens modal if not */}
            {isAuthenticated ? (
              <Link to={`/rooms/${id}`} className="btn btn-primary">
                Details <ArrowRight size={14} />
              </Link>
            ) : (
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                Details <ArrowRight size={14} />
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Auth modal */}
      {showModal && (
        <AuthModal room={room} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}