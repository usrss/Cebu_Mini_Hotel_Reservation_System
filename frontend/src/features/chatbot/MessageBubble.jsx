/**
 * src/features/chatbot/MessageBubble.jsx
 *
 * Renders a single chat message — user, bot, or support agent.
 * Handles markdown-like formatting (bold, line breaks).
 * Bot messages may include structured room/booking data cards.
 */

import { formatDistanceToNow } from 'date-fns';
import './ChatWidget.css';

// ─── Media root — resolves room image URLs correctly in any environment ───────
const API_BASE   = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const MEDIA_ROOT = API_BASE.replace(/\/api\/?$/, '');

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${MEDIA_ROOT}${url}`;
}

// ─── Simple markdown renderer (bold + line breaks only) ──────────────────────
function renderText(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ));
  });
}

// ─── Room card (shown when intent = CHECK_AVAILABILITY) ──────────────────────
function RoomCard({ room }) {
  const imgSrc = resolveImageUrl(room.image_url);

  return (
    <a
      href={`/rooms/${room.id}`}
      className="cmh-room-card"
      target="_blank"
      rel="noopener noreferrer"
    >
      {imgSrc && (
        <img src={imgSrc} alt={room.room_type} className="cmh-room-card-img" />
      )}
      <div className="cmh-room-card-body">
        <span className="cmh-room-card-type">{room.room_type}</span>
        <span className="cmh-room-card-room">Room {room.room_number} · Floor {room.floor}</span>
        <div className="cmh-room-card-price">
          {parseFloat(room.discount_percentage) > 0 ? (
            <>
              <span className="cmh-price-original">₱{parseFloat(room.price_per_night).toLocaleString()}</span>
              <span className="cmh-price-current">₱{parseFloat(room.discounted_price).toLocaleString()}</span>
              <span className="cmh-discount-badge">-{room.discount_percentage}%</span>
            </>
          ) : (
            <span className="cmh-price-current">₱{parseFloat(room.price_per_night).toLocaleString()}</span>
          )}
          <span className="cmh-price-night">/night</span>
        </div>
        <span className="cmh-room-card-cap">👥 Up to {room.capacity} guests · {room.bed_type}</span>
      </div>
    </a>
  );
}

// ─── Booking card (shown when intent = VIEW_BOOKING) ─────────────────────────
function BookingCard({ booking }) {
  const statusColors = {
    confirmed:       '#6EE7B7',
    checked_in:      '#C9A84C',
    pending_payment: '#FCD34D',
    cancelled:       '#9ca3af',
    checked_out:     '#9ca3af',
  };
  const color = statusColors[booking.status_key] || '#9ca3af';

  return (
    <a href={`/bookings/my/${booking.id}`} className="cmh-booking-card">
      <div className="cmh-booking-card-header">
        <span className="cmh-booking-ref">{booking.reference_number || `#${booking.id}`}</span>
        <span className="cmh-booking-status" style={{ color, borderColor: `${color}40` }}>
          {booking.status}
        </span>
      </div>
      <div className="cmh-booking-card-body">
        <span>🛏 Room {booking.room_number} — {booking.room_type}</span>
        <span>📅 {booking.check_in} → {booking.check_out} ({booking.nights} night{booking.nights !== 1 ? 's' : ''})</span>
        <span>💰 ₱{parseFloat(booking.total_price).toLocaleString()}</span>
        {booking.checkin_pin && (
          <span>🔑 PIN: <strong>{booking.checkin_pin}</strong></span>
        )}
      </div>
    </a>
  );
}

// ─── Main MessageBubble ───────────────────────────────────────────────────────
export default function MessageBubble({ message }) {
  const isUser    = message.sender === 'user';
  const isSupport = message.sender === 'support';
  const isBot     = message.sender === 'bot';

  const timeAgo = message.timestamp
    ? formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })
    : '';

  const rooms    = message.data?.rooms    || [];
  const bookings = message.data?.bookings || [];

  return (
    <div className={`cmh-message-row cmh-message-row--${message.sender}`}>

      {/* Avatar — left side for bot/support */}
      {!isUser && (
        <div className={`cmh-avatar cmh-avatar--${isSupport ? 'support' : 'bot'}`}>
          {isSupport ? '👤' : '🏨'}
        </div>
      )}

      <div className="cmh-bubble-group">

        {/* Sender label for support agent */}
        {isSupport && (
          <span className="cmh-support-label">Support Agent</span>
        )}

        {/* Message bubble */}
        <div className={`cmh-bubble cmh-bubble--${message.sender}`}>
          <p className="cmh-bubble-text">{renderText(message.text)}</p>
        </div>

        {/* Room cards — shown on availability responses */}
        {isBot && rooms.length > 0 && (
          <div className="cmh-cards-row">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}

        {/* Booking cards — shown on booking responses */}
        {isBot && bookings.length > 0 && (
          <div className="cmh-cards-col">
            {bookings.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="cmh-timestamp">{timeAgo}</span>
      </div>

      {/* Avatar — right side for user */}
      {isUser && (
        <div className="cmh-avatar cmh-avatar--user">👤</div>
      )}
    </div>
  );
}