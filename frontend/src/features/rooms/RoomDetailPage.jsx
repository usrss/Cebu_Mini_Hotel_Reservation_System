// current file with 360° viewer added
import { useState, lazy, Suspense } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Bed,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  RotateCw, // NEW: for 360° button
} from 'lucide-react';
import { useRoomDetail } from '../hooks/useRooms';
import BookingForm from '../bookings/BookingForm';
import './RoomDetailPage.css';

// NEW: Lazy load 360 viewer - only loads when button is clicked
const Room360Viewer = lazy(() => import('./Room360Viewer'));

const STATUS_CONFIG = {
  available:   { label: 'Available',         className: 'status-available' },
  maintenance: { label: 'Under Maintenance', className: 'status-maintenance' },
  disabled:    { label: 'Not Available',     className: 'status-disabled' },
};

export default function RoomDetailPage() {
  const { id }           = useParams();
  const [searchParams]   = useSearchParams();
  const { room, loading, error } = useRoomDetail(id);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [show360Viewer, setShow360Viewer] = useState(false); // NEW: 360 viewer state

  if (loading) return <LoadingSkeleton />;

  if (error || !room) {
    return (
      <div className="room-detail-error-container">
        <div className="error-content">
          <div className="error-icon-large">
            <ArrowLeft size={32} />
          </div>
          <h2 className="error-heading">Room Not Found</h2>
          <p className="error-message">{error || 'This room does not exist'}</p>
          <Link to="/rooms" className="btn btn-primary">
            <ArrowLeft size={18} />
            Back to Rooms
          </Link>
        </div>
      </div>
    );
  }

  const images      = room.images || [];
  const statusConfig = STATUS_CONFIG[room.status] || STATUS_CONFIG.disabled;
  const isAvailable  = room.status === 'available';

  // Group amenities by category
  const amenitiesByCategory = (room.amenities || []).reduce((acc, amenity) => {
    const category = amenity.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(amenity);
    return acc;
  }, {});

  const prevImage = () =>
    setActiveImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));

  const nextImage = () =>
    setActiveImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));

  // Pre-fill dates from room list if user came from availability search
  const prefillCheckIn  = searchParams.get('check_in')  || '';
  const prefillCheckOut = searchParams.get('check_out') || '';

  return (
    <div className="room-detail-page">
      {/* Navigation Bar */}
      <div className="room-detail-nav">
        <div className="nav-container">
          <Link to="/rooms" className="back-link">
            <ArrowLeft size={18} />
            Back to Rooms
          </Link>
        </div>
      </div>

      <div className="room-detail-container">
        <div className="room-detail-layout">
          {/* Left Column */}
          <div className="room-detail-main">
            {/* Image Gallery */}
            <div className="gallery-card">
              <div className="gallery-main">
                {images.length > 0 ? (
                  <>
                    <img
                      src={images[activeImageIndex]?.image_url}
                      alt={`Room ${room.room_number}`}
                      className="gallery-image"
                    />
                    {images.length > 1 && (
                      <>
                        <button onClick={prevImage} className="gallery-nav gallery-prev">
                          <ChevronLeft size={20} />
                        </button>
                        <button onClick={nextImage} className="gallery-nav gallery-next">
                          <ChevronRight size={20} />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="gallery-placeholder">
                    <Bed size={64} />
                  </div>
                )}
                <div className={`room-status-badge ${statusConfig.className}`}>
                  {statusConfig.label}
                </div>
              </div>

              {images.length > 1 && (
                <div className="gallery-thumbnails">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImageIndex(i)}
                      className={`thumbnail ${i === activeImageIndex ? 'active' : ''}`}
                    >
                      <img src={img.image_url} alt={`Thumbnail ${i + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* NEW: 360° Virtual Tour Button */}
            {room.panorama_image_url && (
              <button
                onClick={() => setShow360Viewer(true)}
                className="tour-360-button"
              >
                <RotateCw size={20} />
                <span>View 360° Virtual Tour</span>
              </button>
            )}

            {/* Room Info Card */}
            <div className="info-card">
              <div className="info-header">
                <div className="info-title-section">
                  <h1 className="room-title">{room.room_type_display} Room</h1>
                  <p className="room-subtitle">
                    Room #{room.room_number} • Floor {room.floor}
                  </p>
                </div>
                <div className="room-price-section">
                  <div className="price-large">₱{room.price_per_night}</div>
                  <div className="price-period">per night</div>
                </div>
              </div>

              <div className="room-features">
                <FeatureCard icon={<Users size={24} />} label="Capacity"  value={`${room.capacity} ${room.capacity === 1 ? 'Guest' : 'Guests'}`} />
                <FeatureCard icon={<Bed size={24} />}   label="Bed Type"  value={room.bed_type_display} />
                {room.size_sqm && (
                  <FeatureCard icon={<Maximize2 size={24} />} label="Room Size" value={`${room.size_sqm}m²`} />
                )}
              </div>

              {room.description && (
                <div className="room-description">
                  <h3 className="description-title">About This Room</h3>
                  <p className="description-text">{room.description}</p>
                </div>
              )}
            </div>

            {/* Amenities Card */}
            {Object.keys(amenitiesByCategory).length > 0 && (
              <div className="amenities-card">
                <h2 className="amenities-title">Room Amenities</h2>
                <div className="amenities-groups">
                  {Object.entries(amenitiesByCategory).map(([category, items]) => (
                    <div key={category} className="amenity-group">
                      <h3 className="amenity-category">{category}</h3>
                      <div className="amenity-list">
                        {items.map((amenity) => (
                          <div key={amenity.id} className="amenity-item">
                            <CheckCircle2 size={18} className="amenity-check" />
                            <span>{amenity.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Sticky Sidebar */}
          <div className="room-detail-sidebar">
            <div className="sidebar-card">
              <h3 className="sidebar-title">Room Information</h3>
              <div className="info-rows">
                <InfoRow label="Room Number" value={`#${room.room_number}`} />
                <InfoRow label="Floor"       value={room.floor} />
                <InfoRow label="Room Type"   value={room.room_type_display} />
                <InfoRow label="Bed Type"    value={room.bed_type_display} />
                <InfoRow label="Max Guests"  value={room.capacity} />
                {room.size_sqm && <InfoRow label="Room Size" value={`${room.size_sqm}m²`} />}
                <InfoRow label="Status"      value={statusConfig.label} />
              </div>

              <div className="sidebar-price">
                <div className="sidebar-price-label">Price per night</div>
                <div className="sidebar-price-amount">₱{room.price_per_night}</div>
              </div>

              {/* Booking Form — only when room is available */}
              {isAvailable ? (
                <div className="sidebar-booking-form">
                  <div className="sidebar-divider" />
                  <BookingForm
                    room={room}
                    prefillCheckIn={prefillCheckIn}
                    prefillCheckOut={prefillCheckOut}
                  />
                </div>
              ) : (
                <p className="sidebar-note">
                  This room is currently {statusConfig.label.toLowerCase()} and cannot be booked.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* NEW: 360° Viewer Modal - Lazy Loaded */}
      {show360Viewer && room.panorama_image_url && (
        <Suspense fallback={null}>
          <Room360Viewer
            imageUrl={room.panorama_image_url}
            roomName={`${room.room_type_display} Room ${room.room_number}`}
            onClose={() => setShow360Viewer(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

function FeatureCard({ icon, label, value }) {
  return (
    <div className="feature-card">
      <div className="feature-icon">{icon}</div>
      <div className="feature-label">{label}</div>
      <div className="feature-value">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="room-detail-page">
      <div className="room-detail-nav">
        <div className="nav-container">
          <div className="skeleton skeleton-back" />
        </div>
      </div>
      <div className="room-detail-container">
        <div className="room-detail-layout">
          <div className="room-detail-main">
            <div className="skeleton skeleton-gallery" />
            <div className="skeleton-card">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-text" />
            </div>
          </div>
          <div className="skeleton skeleton-sidebar" />
        </div>
      </div>
    </div>
  );
}