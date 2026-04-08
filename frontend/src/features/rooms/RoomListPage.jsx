// src/features/rooms/RoomListPage.jsx
// Fixed: wider modal, Airbnb photo grid, reviews rendered below amenities
// All filtering/availability/booking logic unchanged.

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  SearchX, ChevronDown, X, Search, Calendar, Users,
  Tag, Bed, Maximize2, Star, ArrowRight, CheckCircle2,
} from 'lucide-react';
import RoomCard from './RoomCard';
import { useRooms, useAvailability } from '../hooks/useRooms';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
import BookingForm from '../bookings/BookingForm';
import './RoomListPage.css';

const Room360Viewer = lazy(() => import('./Room360Viewer'));

/* ── helpers ─────────────────────────────────────────── */
const getTodayDate = () => new Date().toISOString().split('T')[0];

function calculateNights(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.ceil((new Date(b) - new Date(a)) / 86400000));
}

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

function authHeaders() {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ── Constants ───────────────────────────────────────── */
const ROOM_TYPES = ['standard', 'deluxe', 'suite', 'family'];
const BED_TYPES  = ['single', 'double', 'queen', 'king', 'twin'];
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/* ── Star helper ─────────────────────────────────────── */
function StarIcons({ rating, size = 14 }) {
  return (
    <span style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          fill={i < Math.round(rating) ? '#01000D' : 'transparent'}
          stroke="#01000D"
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

/* ══════════════════════════════════════════════════════
   ROOM DETAIL MODAL
   ══════════════════════════════════════════════════════ */
function RoomDetailModal({ room: listRoom, onClose }) {
  const [room,     setRoom]     = useState(null);
  const [fetching, setFetching] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [show360,   setShow360]   = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);

  /* Fetch full room detail (images, amenities, reviews) */
  useEffect(() => {
    setFetching(true);
    setActiveImg(0);
    fetch(`${API_BASE}/rooms/${listRoom.id}/`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setRoom(data))
      .catch(() => setRoom(listRoom))
      .finally(() => setFetching(false));
  }, [listRoom.id]);

  /* Lock body scroll while open */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  /* ── Loading ── */
  if (fetching) {
    return (
      <div className="rdm-backdrop" onClick={handleBackdrop}>
        <div className="rdm-modal">
          <div className="rdm-header">
            <div className="rdm-header-left">
              <p className="rdm-eyebrow">Loading…</p>
              <h2 className="rdm-title">{listRoom.room_type_display} Room</h2>
            </div>
            <button className="rdm-close-btn" onClick={onClose}><X size={20} /></button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
            <div style={{
              width: 36, height: 36,
              border: '2px solid rgba(1,0,13,0.08)',
              borderTopColor: '#0A0E1A',
              borderRadius: '50%',
              animation: 'rl-spin 0.8s linear infinite',
            }} />
          </div>
        </div>
      </div>
    );
  }

  const images = room.images || [];

  const amenitiesByCategory = (room.amenities || []).reduce((acc, a) => {
    const cat = a.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});

  const reviews = room.reviews || [];
  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 4);

  const hasDiscount = Number(room.discount_percentage) > 0;

  return (
    <>
      <div className="rdm-backdrop" onClick={handleBackdrop}>
        <div className="rdm-modal">

          {/* ── Sticky header ── */}
          <div className="rdm-header">
            <div className="rdm-header-left">
              <p className="rdm-eyebrow">Room #{room.room_number} · Floor {room.floor}</p>
              <h2 className="rdm-title">{room.room_type_display} Room</h2>
            </div>
            <button className="rdm-close-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>

          <div className="rdm-body">

            {/* ══════════════════════════════════════════
                PHOTO GRID — Airbnb style (image 1)
                Left: 1 tall main image
                Right: 2×2 thumbnail sub-grid
                ══════════════════════════════════════════ */}
            <div className="rdm-photo-grid">

              {/* Main image (left, full height) */}
              <div className="rdm-photo-main">
                {images[activeImg]?.image_url ? (
                  <img
                    src={images[activeImg].image_url}
                    alt={`${room.room_type_display} Room`}
                    className="rdm-photo-img"
                  />
                ) : room.primary_image?.image_url ? (
                  <img
                    src={room.primary_image.image_url}
                    alt={`${room.room_type_display} Room`}
                    className="rdm-photo-img"
                  />
                ) : (
                  <div className="rdm-photo-placeholder"><Bed size={56} /></div>
                )}
              </div>

              {/* Right 2×2 sub-grid (slots 1–4) */}
              <div className="rdm-photo-side">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`rdm-photo-thumb${activeImg === i ? ' rdm-photo-thumb-active' : ''}`}
                    onClick={() => images[i] && setActiveImg(i)}
                    style={{ cursor: images[i] ? 'pointer' : 'default' }}
                  >
                    {images[i]?.image_url ? (
                      <img
                        src={images[i].image_url}
                        alt={`Room view ${i + 1}`}
                        className="rdm-photo-img"
                      />
                    ) : (
                      <div className="rdm-photo-placeholder small">
                        <Bed size={22} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* "All photos" overlay button */}
              {images.length > 5 && (
                <button className="rdm-all-photos-btn">
                  <Bed size={13} />
                  All Photos ({images.length})
                </button>
              )}
            </div>

            {/* ── Content: info left, booking right ── */}
            <div className="rdm-content">

              {/* LEFT — info column */}
              <div className="rdm-info">

                {/* Title + rating */}
                <div className="rdm-info-header">
                  <div>
                    <h3 className="rdm-info-title">
                      {room.room_type_display}
                      {room.bed_type_display ? ` · ${room.bed_type_display} bed` : ''}
                      {room.size_sqm ? ` · ${room.size_sqm}m²` : ''}
                    </h3>
                    <div className="rdm-specs-row">
                      <span className="rdm-spec">
                        <Users size={14} />
                        {room.capacity} {room.capacity === 1 ? 'guest' : 'guests'}
                      </span>
                      <span className="rdm-spec-sep">·</span>
                      <span className="rdm-spec">
                        <Bed size={14} /> {room.bed_type_display}
                      </span>
                      {room.size_sqm && (
                        <>
                          <span className="rdm-spec-sep">·</span>
                          <span className="rdm-spec">
                            <Maximize2 size={14} /> {room.size_sqm}m²
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {room.review_count > 0 && (
                    <div className="rdm-rating-block">
                      <Star size={16} fill="currentColor" />
                      <span>{Number(room.average_rating).toFixed(1)}</span>
                      <span className="rdm-review-ct">({room.review_count})</span>
                    </div>
                  )}
                </div>

                <div className="rdm-divider" />

                {/* 360° button */}
                {room.panorama_image_url && (
                  <button className="rdm-360-btn" onClick={() => setShow360(true)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/>
                      <path d="M3.6 9h16.8M3.6 15h16.8M12 3c-1.66 2.49-2.5 4.99-2.5 9S10.34 18.51 12 21M12 3c1.66 2.49 2.5 4.99 2.5 9S13.66 18.51 12 21"/>
                    </svg>
                    View 360° Virtual Tour
                  </button>
                )}

                {/* Description */}
                {room.description && (
                  <>
                    <div className="rdm-section-title">About this room</div>
                    <p className="rdm-description">{room.description}</p>
                    <div className="rdm-divider" />
                  </>
                )}

                {/* Amenities */}
                {Object.keys(amenitiesByCategory).length > 0 && (
                  <>
                    <div className="rdm-section-title">What this room offers</div>
                    <div className="rdm-amenities-grid">
                      {(room.amenities || []).map((a) => (
                        <div key={a.id} className="rdm-amenity-item">
                          <CheckCircle2 size={16} className="rdm-amenity-check" />
                          <span>{a.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="rdm-divider" />
                  </>
                )}

                {/* ── REVIEWS — always rendered below amenities ── */}
                <div className="rdm-reviews-section">
                  <div className="rdm-section-title">
                    {room.review_count > 0 ? (
                      <>
                        <Star size={18} fill="currentColor" />
                        {Number(room.average_rating).toFixed(1)} · {room.review_count} review{room.review_count !== 1 ? 's' : ''}
                      </>
                    ) : (
                      'Reviews'
                    )}
                  </div>

                  {/* Rating breakdown summary (if reviews exist) */}
                  {room.review_count > 0 && room.rating_breakdown && (
                    <div className="rdm-reviews-summary">
                      <div className="rdm-rating-big">
                        <div className="rdm-rating-big-num">
                          {Number(room.average_rating).toFixed(1)}
                        </div>
                        <div className="rdm-rating-big-stars">
                          <StarIcons rating={room.average_rating} size={16} />
                        </div>
                        <div className="rdm-rating-big-label">Overall</div>
                      </div>
                      <div className="rdm-rating-bars">
                        {[5, 4, 3, 2, 1].map((star) => (
                          <div key={star} className="rdm-bar-row">
                            <span className="rdm-bar-label">{star}</span>
                            <div className="rdm-bar-track">
                              <div
                                className="rdm-bar-fill"
                                style={{
                                  width: room.review_count
                                    ? `${((room.rating_breakdown[star] || 0) / room.review_count) * 100}%`
                                    : '0%',
                                }}
                              />
                            </div>
                            <span className="rdm-bar-count">{room.rating_breakdown[star] || 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review list */}
                  {reviews.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#909090', fontStyle: 'italic', margin: 0 }}>
                      No reviews yet for this room.
                    </p>
                  ) : (
                    <>
                      <div className="rdm-reviews-list">
                        {displayedReviews.map((r) => (
                          <div key={r.id} className="rdm-review-item">
                            <div className="rdm-reviewer-avatar">
                              {r.guest_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="rdm-review-body">
                              <div className="rdm-reviewer-name">{r.guest_name}</div>
                              <div className="rdm-review-date">
                                {new Date(r.created_at).toLocaleDateString('en-US', {
                                  month: 'long',
                                  year: 'numeric',
                                })}
                              </div>
                              <div className="rdm-review-stars">
                                <StarIcons rating={r.rating} size={12} />
                              </div>
                              {r.review_text && (
                                <p className="rdm-review-text">{r.review_text}</p>
                              )}
                              {r.is_verified && (
                                <span className="rdm-verified-badge">Verified Stay</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {reviews.length > 4 && (
                        <button
                          className="rdm-show-more-btn"
                          onClick={() => setShowAllReviews(v => !v)}
                        >
                          {showAllReviews
                            ? 'Show fewer reviews'
                            : `Show all ${reviews.length} reviews`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* RIGHT — sticky booking panel */}
              <div className="rdm-booking-panel">
                <div className="rdm-price-display">
                  {hasDiscount && (
                    <span className="rdm-price-original">₱{formatPrice(room.price_per_night)}</span>
                  )}
                  <span className="rdm-price-main">
                    ₱{formatPrice(hasDiscount ? room.discounted_price : room.price_per_night)}
                  </span>
                  <span className="rdm-price-night">/ night</span>
                </div>

                {hasDiscount && (
                  <div className="rdm-discount-badge">
                    <Tag size={11} /> {Number(room.discount_percentage)}% off
                  </div>
                )}

                <div className="rdm-booking-form-wrap">
                  <BookingForm room={room} />
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* 360° viewer — outside modal for proper stacking */}
      {show360 && room.panorama_image_url && (
        <Suspense fallback={null}>
          <Room360Viewer
            imageUrl={room.panorama_image_url}
            roomName={`${room.room_type_display} Room ${room.room_number}`}
            onClose={() => setShow360(false)}
          />
        </Suspense>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════
   FILTER DROPDOWN — generic container
   ══════════════════════════════════════════════════════ */
function FilterDropdown({ children, style }) {
  return <div className="filter-dropdown" style={style}>{children}</div>;
}

/* ══════════════════════════════════════════════════════
   FLOATING FILTER BAR
   ══════════════════════════════════════════════════════ */
function FloatingFilterBar({ filters, onChange, onSearch }) {
  const [openSegment, setOpenSegment] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (barRef.current && !barRef.current.contains(e.target)) setOpenSegment(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (seg) => setOpenSegment(openSegment === seg ? null : seg);
  const update = (key, value) => onChange({ ...filters, [key]: value || undefined });

  const nights = calculateNights(filters.check_in, filters.check_out);
  const hasActiveFilters = Object.values(filters).some(v => v && v !== '');

  const roomTypeLabel = filters.room_type ? cap(filters.room_type) : 'All Rooms';
  const checkInLabel  = filters.check_in  || 'Add date';
  const checkOutLabel = filters.check_out || 'Add date';
  const guestsLabel   = filters.min_capacity ? `${filters.min_capacity} guest${filters.min_capacity > 1 ? 's' : ''}` : 'Any';

  return (
    <div className="room-filter-bar-wrapper">
      <div className="room-filter-bar" ref={barRef}>

        {/* Room Type */}
        <div className={`filter-segment${filters.room_type ? ' has-value' : ''}`} onClick={() => toggle('type')}>
          <span className="filter-segment-label">Room Type</span>
          <span className="filter-segment-value">{roomTypeLabel} <ChevronDown size={14} /></span>
          {openSegment === 'type' && (
            <FilterDropdown>
              <div className="filter-dropdown-title">Select type</div>
              <div className="filter-chips">
                <button className={`filter-chip${!filters.room_type ? ' active' : ''}`} onClick={(e) => { e.stopPropagation(); update('room_type', ''); }}>All Rooms</button>
                {ROOM_TYPES.map(t => (
                  <button key={t} className={`filter-chip${filters.room_type === t ? ' active' : ''}`} onClick={(e) => { e.stopPropagation(); update('room_type', t); }}>{cap(t)}</button>
                ))}
              </div>
            </FilterDropdown>
          )}
        </div>

        {/* Check-in */}
        <div className={`filter-segment${filters.check_in ? ' has-value' : ''}`} onClick={() => toggle('checkin')}>
          <span className="filter-segment-label">Check-in</span>
          <span className="filter-segment-value"><Calendar size={14} /> {checkInLabel}</span>
          {openSegment === 'checkin' && (
            <FilterDropdown>
              <div className="filter-dropdown-title">Check-in date</div>
              <div className="filter-date-row">
                <div className="filter-date-field">
                  <label>Date</label>
                  <input type="date" min={getTodayDate()} value={filters.check_in || ''} onChange={(e) => update('check_in', e.target.value)} onClick={(e) => e.stopPropagation()} className="filter-date-input" />
                </div>
              </div>
            </FilterDropdown>
          )}
        </div>

        {/* Check-out */}
        <div className={`filter-segment${filters.check_out ? ' has-value' : ''}`} onClick={() => toggle('checkout')}>
          <span className="filter-segment-label">Check-out</span>
          <span className="filter-segment-value"><Calendar size={14} /> {checkOutLabel}</span>
          {openSegment === 'checkout' && (
            <FilterDropdown>
              <div className="filter-dropdown-title">Check-out date</div>
              <div className="filter-date-row">
                <div className="filter-date-field">
                  <label>Date</label>
                  <input type="date" min={filters.check_in || getTodayDate()} value={filters.check_out || ''} disabled={!filters.check_in} onChange={(e) => update('check_out', e.target.value)} onClick={(e) => e.stopPropagation()} className="filter-date-input" />
                </div>
              </div>
              {nights > 0 && <p className="filter-nights-note">{nights} night{nights !== 1 ? 's' : ''}</p>}
            </FilterDropdown>
          )}
        </div>

        {/* Guests */}
        <div className={`filter-segment${filters.min_capacity ? ' has-value' : ''}`} onClick={() => toggle('guests')}>
          <span className="filter-segment-label">Guests</span>
          <span className="filter-segment-value"><Users size={14} /> {guestsLabel}</span>
          {openSegment === 'guests' && (
            <FilterDropdown>
              <div className="filter-dropdown-title">Number of guests</div>
              <input type="number" min="1" max="20" placeholder="e.g. 2" value={filters.min_capacity || ''} onChange={(e) => update('min_capacity', e.target.value ? parseInt(e.target.value) : undefined)} onClick={(e) => e.stopPropagation()} className="filter-guests-input" />
              <div className="filter-guests-quick">
                {[1, 2, 3, 4].map(n => (
                  <button key={n} className={`filter-guests-quick-btn${filters.min_capacity === n ? ' active' : ''}`} onClick={(e) => { e.stopPropagation(); update('min_capacity', n === filters.min_capacity ? undefined : n); }}>{n}</button>
                ))}
              </div>
            </FilterDropdown>
          )}
        </div>

        {/* More filters */}
        <div className={`filter-segment${(filters.min_price || filters.max_price || filters.bed_type) ? ' has-value' : ''}`} onClick={() => toggle('more')}>
          <span className="filter-segment-label">More Filters</span>
          <span className="filter-segment-value">
            {filters.min_price || filters.max_price || filters.bed_type ? 'Active' : 'Price · Bed'}
            <ChevronDown size={14} />
          </span>
          {openSegment === 'more' && (
            <FilterDropdown style={{ minWidth: 320, right: 0, left: 'auto' }}>
              <div className="filter-dropdown-title" style={{ marginBottom: 12 }}>Price per night</div>
              <div className="filter-price-row">
                <div className="filter-price-input-wrap">
                  <span className="filter-price-prefix">₱</span>
                  <input type="number" placeholder="Min" value={filters.min_price || ''} onChange={(e) => update('min_price', e.target.value)} onClick={(e) => e.stopPropagation()} className="filter-price-input" />
                </div>
                <span className="filter-price-sep">—</span>
                <div className="filter-price-input-wrap">
                  <span className="filter-price-prefix">₱</span>
                  <input type="number" placeholder="Max" value={filters.max_price || ''} onChange={(e) => update('max_price', e.target.value)} onClick={(e) => e.stopPropagation()} className="filter-price-input" />
                </div>
              </div>
              <div className="filter-dropdown-title" style={{ marginTop: 16, marginBottom: 12 }}>Bed type</div>
              <div className="filter-chips">
                <button className={`filter-chip${!filters.bed_type ? ' active' : ''}`} onClick={(e) => { e.stopPropagation(); update('bed_type', ''); }}>Any</button>
                {BED_TYPES.map(t => (
                  <button key={t} className={`filter-chip${filters.bed_type === t ? ' active' : ''}`} onClick={(e) => { e.stopPropagation(); update('bed_type', t); }}>{cap(t)}</button>
                ))}
              </div>
              {hasActiveFilters && (
                <button className="filter-clear-btn" onClick={(e) => { e.stopPropagation(); onChange({}); setOpenSegment(null); }}>Clear all filters</button>
              )}
            </FilterDropdown>
          )}
        </div>

        {/* Search */}
        <button className="filter-search-btn" onClick={() => { setOpenSegment(null); onSearch(); }}>
          <Search size={16} />
          Search
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   ROOM CARD — opens detail modal
   ══════════════════════════════════════════════════════ */
function RoomCardItem({ room, onViewDetails }) {
  const {
    room_type_display, bed_type_display, capacity,
    price_per_night, discounted_price, discount_percentage,
    status, status_display, size_sqm, primary_image,
    average_rating, review_count, panorama_image_url,
  } = room;

  const hasDiscount    = Number(discount_percentage) > 0;
  const effectivePrice = hasDiscount ? discounted_price : price_per_night;

  const isAuthenticated = !!(
    localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') ||
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
  );

  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <div className="room-card">
        <div
          className="room-card-image-wrapper"
          style={{ cursor: 'pointer' }}
          onClick={() => isAuthenticated ? onViewDetails(room) : setShowAuthModal(true)}
        >
          {primary_image?.image_url ? (
            <img src={primary_image.image_url} alt={`${room_type_display} Room`} className="room-card-image" />
          ) : (
            <div className="room-card-image-placeholder"><Bed size={48} /></div>
          )}
          <div className="room-card-overlay" />
          <div className={`room-card-status status-${status}`}>{status_display}</div>
          {hasDiscount && (
            <div className="room-card-discount-badge">
              <Tag size={10} /> {Number(discount_percentage)}% OFF
            </div>
          )}
          {panorama_image_url && <div className="room-card-360-badge">360°</div>}
        </div>

        <div className="room-card-content">
          <div className="room-card-title-row">
            <h3 className="room-card-title">{room_type_display} Room</h3>
            <span className="room-card-rating">
              {review_count > 0 ? `★ ${Number(average_rating).toFixed(1)}` : 'No reviews yet'}
            </span>
          </div>
          <div className="room-card-specs">
            <div className="room-spec"><Users size={14} /><span>{capacity} {capacity === 1 ? 'Guest' : 'Guests'}</span></div>
            <div className="room-spec"><Bed size={14} /><span>{bed_type_display}</span></div>
            {size_sqm && <div className="room-spec"><Maximize2 size={14} /><span>{size_sqm}m²</span></div>}
          </div>
          <div className="room-card-footer">
            <div className="room-card-price">
              {hasDiscount && <div className="price-original">₱{formatPrice(price_per_night)}</div>}
              <div className="price-amount">₱{formatPrice(effectivePrice)}</div>
              <div className="price-label">/ Night</div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => isAuthenticated ? onViewDetails(room) : setShowAuthModal(true)}
            >
              Details <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Unauthenticated gate modal */}
      {showAuthModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(1,0,13,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowAuthModal(false)}
        >
          <div style={{ background: '#FAF9F6', border: '1px solid rgba(1,0,13,0.09)', maxWidth: 440, width: '100%', padding: '32px 28px' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#909090', marginBottom: 10 }}>Members Only</p>
            <h2 style={{ fontFamily: 'Montserrat,sans-serif', fontSize: 20, fontWeight: 900, textTransform: 'uppercase', color: '#01000D', marginBottom: 10 }}>Sign in to view this room</h2>
            <p style={{ fontSize: 13, color: '#535252', marginBottom: 24, lineHeight: 1.65 }}>Create a free account or log in to explore room details, check availability, and complete your booking.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button style={{ padding: '14px 24px', background: '#0A0E1A', color: '#FAF9F6', border: 'none', fontFamily: 'Montserrat,sans-serif', fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }} onClick={() => { setShowAuthModal(false); window.location.href = '/register'; }}>Create Account</button>
              <button style={{ padding: '14px 24px', background: 'transparent', color: '#01000D', border: '1.5px solid rgba(1,0,13,0.18)', fontFamily: 'Montserrat,sans-serif', fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }} onClick={() => { setShowAuthModal(false); window.location.href = '/login'; }}>Log In</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */
export default function RoomListPage() {
  const [filters,      setFilters]      = useState({});
  const [triggered,    setTriggered]    = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);

  const hasDateRange = Boolean(filters.check_in && filters.check_out);

  const cleanFilters = (obj) => Object.fromEntries(
    Object.entries(obj).filter(([key, value]) => {
      if (key === 'check_in' || key === 'check_out') return hasDateRange && value;
      return value !== undefined && value !== '' && value !== null;
    })
  );

  const activeFilters = cleanFilters(filters);

  const { rooms: regularRooms, loading: regularLoading, error: regularError } = useRooms(hasDateRange ? {} : activeFilters);
  const { results: availabilityResults, loading: availLoading, error: availError, search } = useAvailability();

  const handleSearch = () => {
    if (hasDateRange) {
      search(activeFilters);
      setTriggered(true);
    }
  };

  useEffect(() => {
    if (hasDateRange && triggered) search(activeFilters);
  }, [JSON.stringify(activeFilters), hasDateRange]);

  const rooms   = hasDateRange ? (availabilityResults?.available_rooms || []) : regularRooms;
  const loading = hasDateRange ? availLoading  : regularLoading;
  const error   = hasDateRange ? availError    : regularError;

  return (
    <div className="room-list-page">
      <Navbar />

      <FloatingFilterBar filters={filters} onChange={setFilters} onSearch={handleSearch} />

      <div className="room-list-container">
        {!loading && !error && (
          <div className="room-results-header">
            <div>
              <p className="room-results-count">
                <span>{rooms.length}</span> {rooms.length === 1 ? 'Room' : 'Rooms'} Found
              </p>
              {hasDateRange && <p className="room-results-subtitle">Available for your selected dates</p>}
            </div>
          </div>
        )}

        {loading && (
          <div className="room-list-loading">
            <div className="rl-spinner" />
            <p>Searching rooms…</p>
          </div>
        )}

        {error && !loading && (
          <div className="room-list-error">
            <div className="rl-empty-icon"><SearchX size={24} /></div>
            <p className="rl-empty-title">Something went wrong</p>
            <p className="rl-empty-desc">Unable to load rooms. Please try again.</p>
            <button className="rl-reset-btn" onClick={() => setFilters({})}>Reset Filters</button>
          </div>
        )}

        {!loading && !error && rooms.length === 0 && (
          <div className="room-list-empty">
            <div className="rl-empty-icon"><SearchX size={24} /></div>
            <p className="rl-empty-title">No Rooms Found</p>
            <p className="rl-empty-desc">
              {hasDateRange ? 'No rooms are available for your selected dates.' : 'No rooms match your current filters.'}
            </p>
            <button className="rl-reset-btn" onClick={() => setFilters({})}>Clear Filters</button>
          </div>
        )}

        {!loading && !error && rooms.length > 0 && (
          <div className="room-grid">
            {rooms.map((room) => (
              <RoomCardItem key={room.id} room={room} onViewDetails={setSelectedRoom} />
            ))}
          </div>
        )}
      </div>

      <Footer />

      {selectedRoom && (
        <RoomDetailModal room={selectedRoom} onClose={() => setSelectedRoom(null)} />
      )}
    </div>
  );
}