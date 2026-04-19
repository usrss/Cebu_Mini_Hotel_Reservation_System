/**
 * src/features/chatbot/MessageBubble.jsx
 * All emojis replaced with Lucide icons.
 */

import { formatDistanceToNow } from 'date-fns';
import { Bot, User, Headphones, Bed, Users, Calendar, Key, Tag } from 'lucide-react';
import './ChatWidget.css';

const API_BASE   = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const MEDIA_ROOT = API_BASE.replace(/\/api\/?$/, '');

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${MEDIA_ROOT}${url}`;
}

function renderText(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|~~[^~]+~~)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('~~') && part.endsWith('~~'))
      return <s key={i}>{part.slice(2, -2)}</s>;
    return part.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
    ));
  });
}

function RoomCard({ room }) {
  const imgSrc = resolveImageUrl(room.image_url);
  return (
    <a href={`/rooms/${room.id}`} className="cmh-room-card" target="_blank" rel="noopener noreferrer">
      {imgSrc ? (
        <img src={imgSrc} alt={room.room_type} className="cmh-room-card-img" />
      ) : (
        <div className="cmh-room-card-img" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#F0EDE6', color: '#909090',
        }}>
          <Bed size={20} />
        </div>
      )}
      <div className="cmh-room-card-body">
        <span className="cmh-room-card-type">{room.room_type}</span>
        <span className="cmh-room-card-room">Room {room.room_number} · Floor {room.floor}</span>
        <div className="cmh-room-card-price">
          {parseFloat(room.discount_percentage) > 0 ? (
            <>
              <span className="cmh-price-original">₱{parseFloat(room.price_per_night).toLocaleString()}</span>
              <span className="cmh-price-current">₱{parseFloat(room.discounted_price).toLocaleString()}</span>
              <span className="cmh-discount-badge">-{Math.abs(parseFloat(room.discount_percentage)).toFixed(0)}%</span>
            </>
          ) : (
            <span className="cmh-price-current">₱{parseFloat(room.price_per_night).toLocaleString()}</span>
          )}
          <span className="cmh-price-night">/night</span>
        </div>
        <span className="cmh-room-card-cap" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={9} /> Up to {room.capacity} guests · {room.bed_type}
        </span>
      </div>
    </a>
  );
}

function BookingCard({ booking }) {
  const statusColors = {
    confirmed:       '#059669',
    checked_in:      '#C9A84C',
    pending_payment: '#BA7517',
    cancelled:       '#909090',
    checked_out:     '#909090',
  };
  const color = statusColors[booking.status_key] || '#909090';

  return (
    <a href={`/bookings/my/${booking.id}`} className="cmh-booking-card">
      <div className="cmh-booking-card-header">
        <span className="cmh-booking-ref">{booking.reference_number || `#${booking.id}`}</span>
        <span className="cmh-booking-status" style={{ color, borderColor: `${color}40` }}>
          {booking.status}
        </span>
      </div>
      <div className="cmh-booking-card-body">
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Bed size={11} /> Room {booking.room_number} — {booking.room_type}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Calendar size={11} /> {booking.check_in} → {booking.check_out} ({booking.nights} night{booking.nights !== 1 ? 's' : ''})
        </span>
        <span>₱{parseFloat(booking.total_price).toLocaleString()}</span>
        {booking.checkin_pin && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Key size={11} /> PIN: <strong>{booking.checkin_pin}</strong>
          </span>
        )}
      </div>
    </a>
  );
}

export default function MessageBubble({ message }) {
  const isUser    = message.sender === 'user';
  const isSupport = message.sender === 'support';

  const timeAgo = message.timestamp
    ? formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })
    : '';

  const rooms    = message.data?.rooms    || [];
  const bookings = message.data?.bookings || [];
  const AvatarIcon = isUser ? User : isSupport ? Headphones : Bot;

  return (
    <div className={`cmh-message-row cmh-message-row--${message.sender}`}>
      {!isUser && (
        <div className={`cmh-avatar cmh-avatar--${isSupport ? 'support' : 'bot'}`}>
          <AvatarIcon size={13} />
        </div>
      )}

      <div className="cmh-bubble-group">
        {isSupport && <span className="cmh-support-label">Support Agent</span>}

        <div className={`cmh-bubble cmh-bubble--${message.sender}`}>
          <p className="cmh-bubble-text">{renderText(message.text)}</p>
        </div>

        {!isUser && rooms.length > 0 && (
          <div className="cmh-cards-row">
            {rooms.map(room => <RoomCard key={room.id} room={room} />)}
          </div>
        )}

        {!isUser && bookings.length > 0 && (
          <div className="cmh-cards-col">
            {bookings.map(b => <BookingCard key={b.id} booking={b} />)}
          </div>
        )}

        <span className="cmh-timestamp">{timeAgo}</span>
      </div>

      {isUser && (
        <div className="cmh-avatar cmh-avatar--user">
          <User size={13} />
        </div>
      )}
    </div>
  );
}