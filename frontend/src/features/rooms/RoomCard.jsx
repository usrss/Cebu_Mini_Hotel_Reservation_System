import { Link } from 'react-router-dom';
import { Users, Bed, Maximize2, ArrowRight } from 'lucide-react';
import './RoomCard.css';

export default function RoomCard({ room }) {
  const {
    id,
    room_number,
    room_type_display,
    bed_type_display,
    capacity,
    price_per_night,
    status,
    status_display,
    size_sqm,
    primary_image,
  } = room;

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

        {/* Room number badge */}
        <div className="room-card-number">
          Room {room_number}
        </div>

        {/* Status badge */}
        <div className={`room-card-status status-${status}`}>
          {status_display}
        </div>
      </Link>

      {/* Content */}
      <div className="room-card-content">
        <Link to={`/rooms/${id}`}>
          <h3 className="room-card-title">
            {room_type_display} Room
          </h3>
        </Link>

        {/* Room specs */}
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
            <div className="price-amount">${price_per_night}</div>
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