// src/features/rooms/RoomListPage.jsx
// Auto-search: triggers availability search automatically when check_in + check_out
// are both filled (debounced 400ms). Guests default to 1 if not set.
// Initial load: shows all rooms. Once dates filled: shows only available rooms.

import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import {
  SearchX, ChevronDown, X, Search, Calendar, Users,
  Tag, Bed, Maximize2, Star, ArrowRight, CheckCircle2,
  AlertCircle,
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

/* ── Price filter ────────────────────────────────────── */
function applyPriceFilter(rooms, minPrice, maxPrice) {
  return rooms.filter(room => {
    const effectivePrice = Number(
      Number(room.discount_percentage) > 0 ? room.discounted_price : room.price_per_night
    );
    if (minPrice && effectivePrice < Number(minPrice)) return false;
    if (maxPrice && effectivePrice > Number(maxPrice)) return false;
    return true;
  });
}

/* ── Validation ──────────────────────────────────────── */
function validateFilters(filters) {
  const errors = {};

  if (filters.check_in && filters.check_out) {
    const nights = calculateNights(filters.check_in, filters.check_out);
    if (nights < 1) errors.check_out = 'Check-out must be after check-in';
  }

  if (filters.min_price && filters.max_price) {
    if (Number(filters.min_price) > Number(filters.max_price)) {
      errors.max_price = 'Max price must be greater than min price';
    }
  }

  return errors;
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

  useEffect(() => {
    setFetching(true);
    setActiveImg(0);
    fetch(`${API_BASE}/rooms/${listRoom.id}/`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setRoom(data))
      .catch(() => setRoom(listRoom))
      .finally(() => setFetching(false));
  }, [listRoom.id]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

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
            <div className="rdm-photo-grid">
              <div className="rdm-photo-main">
                {images[activeImg]?.image_url ? (
                  <img src={images[activeImg].image_url} alt={`${room.room_type_display} Room`} className="rdm-photo-img" />
                ) : room.primary_image?.image_url ? (
                  <img src={room.primary_image.image_url} alt={`${room.room_type_display} Room`} className="rdm-photo-img" />
                ) : (
                  <div className="rdm-photo-placeholder"><Bed size={56} /></div>
                )}
              </div>
              <div className="rdm-photo-side">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`rdm-photo-thumb${activeImg === i ? ' rdm-photo-thumb-active' : ''}`}
                    onClick={() => images[i] && setActiveImg(i)}
                    style={{ cursor: images[i] ? 'pointer' : 'default' }}
                  >
                    {images[i]?.image_url ? (
                      <img src={images[i].image_url} alt={`Room view ${i + 1}`} className="rdm-photo-img" />
                    ) : (
                      <div className="rdm-photo-placeholder small"><Bed size={22} /></div>
                    )}
                  </div>
                ))}
              </div>
              {images.length > 5 && (
                <button className="rdm-all-photos-btn">
                  <Bed size={13} /> All Photos ({images.length})
                </button>
              )}
            </div>

            <div className="rdm-content">
              <div className="rdm-info">
                <div className="rdm-info-header">
                  <div>
                    <h3 className="rdm-info-title">
                      {room.room_type_display}
                      {room.bed_type_display ? ` · ${room.bed_type_display} bed` : ''}
                      {room.size_sqm ? ` · ${room.size_sqm}m²` : ''}
                    </h3>
                    <div className="rdm-specs-row">
                      <span className="rdm-spec"><Users size={14} />{room.capacity} {room.capacity === 1 ? 'guest' : 'guests'}</span>
                      <span className="rdm-spec-sep">·</span>
                      <span className="rdm-spec"><Bed size={14} /> {room.bed_type_display}</span>
                      {room.size_sqm && (<><span className="rdm-spec-sep">·</span><span className="rdm-spec"><Maximize2 size={14} /> {room.size_sqm}m²</span></>)}
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

                {room.panorama_image_url && (
                  <button className="rdm-360-btn" onClick={() => setShow360(true)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/>
                      <path d="M3.6 9h16.8M3.6 15h16.8M12 3c-1.66 2.49-2.5 4.99-2.5 9S10.34 18.51 12 21M12 3c1.66 2.49 2.5 4.99 2.5 9S13.66 18.51 12 21"/>
                    </svg>
                    View 360° Virtual Tour
                  </button>
                )}

                {room.description && (
                  <>
                    <div className="rdm-section-title">About this room</div>
                    <p className="rdm-description">{room.description}</p>
                    <div className="rdm-divider" />
                  </>
                )}

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

                <div className="rdm-reviews-section">
                  <div className="rdm-section-title">
                    {room.review_count > 0 ? (
                      <><Star size={18} fill="currentColor" />{Number(room.average_rating).toFixed(1)} · {room.review_count} review{room.review_count !== 1 ? 's' : ''}</>
                    ) : 'Reviews'}
                  </div>
                  {room.review_count > 0 && room.rating_breakdown && (
                    <div className="rdm-reviews-summary">
                      <div className="rdm-rating-big">
                        <div className="rdm-rating-big-num">{Number(room.average_rating).toFixed(1)}</div>
                        <div className="rdm-rating-big-stars"><StarIcons rating={room.average_rating} size={16} /></div>
                        <div className="rdm-rating-big-label">Overall</div>
                      </div>
                      <div className="rdm-rating-bars">
                        {[5, 4, 3, 2, 1].map((star) => (
                          <div key={star} className="rdm-bar-row">
                            <span className="rdm-bar-label">{star}</span>
                            <div className="rdm-bar-track">
                              <div className="rdm-bar-fill" style={{ width: room.review_count ? `${((room.rating_breakdown[star] || 0) / room.review_count) * 100}%` : '0%' }} />
                            </div>
                            <span className="rdm-bar-count">{room.rating_breakdown[star] || 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {reviews.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#909090', fontStyle: 'italic', margin: 0 }}>No reviews yet for this room.</p>
                  ) : (
                    <>
                      <div className="rdm-reviews-list">
                        {displayedReviews.map((r) => (
                          <div key={r.id} className="rdm-review-item">
                            <div className="rdm-reviewer-avatar">{r.guest_name?.charAt(0)?.toUpperCase() || '?'}</div>
                            <div className="rdm-review-body">
                              <div className="rdm-reviewer-name">{r.guest_name}</div>
                              <div className="rdm-review-date">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                              <div className="rdm-review-stars"><StarIcons rating={r.rating} size={12} /></div>
                              {r.review_text && <p className="rdm-review-text">{r.review_text}</p>}
                              {r.is_verified && <span className="rdm-verified-badge">Verified Stay</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {reviews.length > 4 && (
                        <button className="rdm-show-more-btn" onClick={() => setShowAllReviews(v => !v)}>
                          {showAllReviews ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="rdm-booking-panel">
                <div className="rdm-price-display">
                  {hasDiscount && <span className="rdm-price-original">₱{formatPrice(room.price_per_night)}</span>}
                  <span className="rdm-price-main">₱{formatPrice(hasDiscount ? room.discounted_price : room.price_per_night)}</span>
                  <span className="rdm-price-night">/ night</span>
                </div>
                {hasDiscount && (
                  <div className="rdm-discount-badge"><Tag size={11} /> {Number(room.discount_percentage)}% off</div>
                )}
                <div className="rdm-booking-form-wrap">
                  <BookingForm room={room} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
   FLOATING FILTER BAR
   Auto-search fires when check_in + check_out are both set.
   Guests default to 1 if not explicitly set.
   Search button still available for manual re-trigger.
   ══════════════════════════════════════════════════════ */
function FilterDropdown({ children, style }) {
  return <div className="filter-dropdown" style={style}>{children}</div>;
}

function FloatingFilterBar({ filters, onChange, onSearch, validationErrors, isSearching, isAvailabilityMode }) {
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
  const update = (key, value) => {
    const next = { ...filters, [key]: value || undefined };
    // Clear check_out if new check_in is >= check_out
    if (key === 'check_in' && next.check_out && next.check_out <= value) {
      next.check_out = undefined;
    }
    onChange(next);
  };

  const nights       = calculateNights(filters.check_in, filters.check_out);
  const roomTypeLabel = filters.room_type ? cap(filters.room_type) : 'All Rooms';
  const checkInLabel  = filters.check_in  || 'Add date';
  const checkOutLabel = filters.check_out || 'Add date';
  const guestsLabel   = filters.min_capacity
    ? `${filters.min_capacity} guest${filters.min_capacity > 1 ? 's' : ''}`
    : 'Add guests';

  const hasMoreFilters = filters.min_price || filters.max_price || filters.bed_type;
  const checkOutError  = validationErrors?.check_out;
  const priceError     = validationErrors?.max_price;

  return (
    <div className="room-filter-bar-wrapper">
      <div className="room-filter-bar" ref={barRef}>

        {/* Room Type */}
        <div
          className={`filter-segment${filters.room_type ? ' has-value' : ''}`}
          onClick={() => toggle('type')}
        >
          <span className="filter-segment-label">Room Type</span>
          <span className="filter-segment-value">{roomTypeLabel} <ChevronDown size={14} /></span>
          {openSegment === 'type' && (
            <FilterDropdown>
              <div className="filter-dropdown-title">Select type</div>
              <div className="filter-chips">
                <button
                  className={`filter-chip${!filters.room_type ? ' active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); update('room_type', ''); setOpenSegment(null); }}
                >All Rooms</button>
                {ROOM_TYPES.map(t => (
                  <button
                    key={t}
                    className={`filter-chip${filters.room_type === t ? ' active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); update('room_type', t); setOpenSegment(null); }}
                  >{cap(t)}</button>
                ))}
              </div>
            </FilterDropdown>
          )}
        </div>

        {/* Check-in */}
        <div
          className={`filter-segment${filters.check_in ? ' has-value' : ''}`}
          onClick={() => toggle('checkin')}
        >
          <span className="filter-segment-label">Check-in</span>
          <span className="filter-segment-value">
            <Calendar size={14} /> {checkInLabel}
          </span>
          {openSegment === 'checkin' && (
            <FilterDropdown>
              <div className="filter-dropdown-title">Check-in date</div>
              <div className="filter-date-row">
                <div className="filter-date-field">
                  <label>Date</label>
                  <input
                    type="date"
                    min={getTodayDate()}
                    value={filters.check_in || ''}
                    onChange={(e) => { update('check_in', e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    className="filter-date-input"
                  />
                </div>
              </div>
              {filters.check_in && !filters.check_out && (
                <p className="filter-hint-text">
                  <AlertCircle size={11} />
                  Now select a check-out date to search availability.
                </p>
              )}
            </FilterDropdown>
          )}
        </div>

        {/* Check-out */}
        <div
          className={`filter-segment${filters.check_out ? ' has-value' : ''}${checkOutError ? ' has-error' : ''}`}
          onClick={() => toggle('checkout')}
        >
          <span className="filter-segment-label">Check-out</span>
          <span className="filter-segment-value">
            <Calendar size={14} /> {checkOutError ? <span className="filter-error-inline">{checkOutError}</span> : checkOutLabel}
          </span>
          {openSegment === 'checkout' && (
            <FilterDropdown>
              <div className="filter-dropdown-title">Check-out date</div>
              <div className="filter-date-row">
                <div className="filter-date-field">
                  <label>Date</label>
                  <input
                    type="date"
                    min={filters.check_in ? (() => { const d = new Date(filters.check_in); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() : getTodayDate()}
                    value={filters.check_out || ''}
                    disabled={!filters.check_in}
                    onChange={(e) => { update('check_out', e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    className="filter-date-input"
                  />
                </div>
              </div>
              {!filters.check_in && (
                <p className="filter-hint-text"><AlertCircle size={11} /> Select a check-in date first.</p>
              )}
              {nights > 0 && <p className="filter-nights-note">{nights} night{nights !== 1 ? 's' : ''}</p>}
            </FilterDropdown>
          )}
        </div>

        {/* Guests */}
        <div
          className={`filter-segment${filters.min_capacity ? ' has-value' : ''}`}
          onClick={() => toggle('guests')}
        >
          <span className="filter-segment-label">Guests</span>
          <span className="filter-segment-value">
            <Users size={14} /> {guestsLabel}
          </span>
          {openSegment === 'guests' && (
            <FilterDropdown>
              <div className="filter-dropdown-title">Number of guests</div>
              <input
                type="number"
                min="1"
                max="20"
                placeholder="e.g. 2"
                value={filters.min_capacity || ''}
                onChange={(e) => update('min_capacity', e.target.value ? parseInt(e.target.value) : undefined)}
                onClick={(e) => e.stopPropagation()}
                className="filter-guests-input"
              />
              <div className="filter-guests-quick">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    className={`filter-guests-quick-btn${filters.min_capacity === n ? ' active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); update('min_capacity', n === filters.min_capacity ? undefined : n); }}
                  >{n}</button>
                ))}
              </div>
              <p className="filter-hint-text">
                <AlertCircle size={11} />
                Only rooms with sufficient capacity will be shown.
              </p>
            </FilterDropdown>
          )}
        </div>

        {/* More filters — price + bed type */}
        <div
          className={`filter-segment${hasMoreFilters ? ' has-value' : ''}${priceError ? ' has-error' : ''}`}
          onClick={() => toggle('more')}
        >
          <span className="filter-segment-label">More Filters</span>
          <span className="filter-segment-value">
            {priceError
              ? <span className="filter-error-inline">{priceError}</span>
              : hasMoreFilters ? 'Active' : 'Price · Bed'
            }
            <ChevronDown size={14} />
          </span>
          {openSegment === 'more' && (
            <FilterDropdown style={{ minWidth: 320, right: 0, left: 'auto' }}>
              <div className="filter-dropdown-title" style={{ marginBottom: 12 }}>Price per night (₱)</div>
              <div className="filter-price-row">
                <div className="filter-price-input-wrap">
                  <span className="filter-price-prefix">₱</span>
                  <input
                    type="number"
                    placeholder="Min"
                    min="0"
                    value={filters.min_price || ''}
                    onChange={(e) => update('min_price', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="filter-price-input"
                  />
                </div>
                <span className="filter-price-sep">—</span>
                <div className="filter-price-input-wrap">
                  <span className="filter-price-prefix">₱</span>
                  <input
                    type="number"
                    placeholder="Max"
                    min="0"
                    value={filters.max_price || ''}
                    onChange={(e) => update('max_price', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="filter-price-input"
                  />
                </div>
              </div>
              {priceError && (
                <p className="filter-field-error"><AlertCircle size={11} /> {priceError}</p>
              )}
              <div className="filter-dropdown-title" style={{ marginTop: 16, marginBottom: 12 }}>Bed type</div>
              <div className="filter-chips">
                <button
                  className={`filter-chip${!filters.bed_type ? ' active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); update('bed_type', ''); }}
                >Any</button>
                {BED_TYPES.map(t => (
                  <button
                    key={t}
                    className={`filter-chip${filters.bed_type === t ? ' active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); update('bed_type', t); }}
                  >{cap(t)}</button>
                ))}
              </div>
              {hasMoreFilters && (
                <button
                  className="filter-clear-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ ...filters, min_price: undefined, max_price: undefined, bed_type: undefined });
                    setOpenSegment(null);
                  }}
                >Clear price &amp; bed filters</button>
              )}
              <p className="filter-hint-text" style={{ marginTop: 10 }}>
                <AlertCircle size={11} />
                Price filter applies to the discounted rate when a discount is active.
              </p>
            </FilterDropdown>
          )}
        </div>

        {/* Search button — shows spinner when auto-searching */}
        <button
          className={`filter-search-btn${isSearching ? ' filter-search-btn--searching' : ''}`}
          onClick={() => { setOpenSegment(null); onSearch(); }}
          disabled={isSearching}
        >
          {isSearching ? (
            <span className="filter-search-spinner" />
          ) : (
            <Search size={16} />
          )}
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Availability mode indicator */}
      {isAvailabilityMode && !isSearching && (
        <div className="filter-availability-bar">
          <Calendar size={13} />
          Showing availability for your selected dates
        </div>
      )}

      {/* Date error */}
      {checkOutError && (
        <div className="filter-validation-bar">
          <AlertCircle size={14} />
          <span>{checkOutError}</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   ROOM CARD ITEM — opens detail modal
   ══════════════════════════════════════════════════════ */
function RoomCardItem({ room, onViewDetails, availabilityDates }) {
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

          {/* Restore original status badge with real status class */}
          <div className={`room-card-status status-${status}`}>
            {status_display}
          </div>

          {hasDiscount && (
            <div className="room-card-discount-badge"><Tag size={10} /> {Number(discount_percentage)}% OFF</div>
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

      {showAuthModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(1,0,13,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowAuthModal(false)}
        >
          <div
            style={{ background: '#FAF9F6', border: '1px solid rgba(1,0,13,0.09)', maxWidth: 440, width: '100%', padding: '32px 28px' }}
            onClick={(e) => e.stopPropagation()}
          >
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
  const [filters,         setFilters]         = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [selectedRoom,    setSelectedRoom]    = useState(null);

  // Track whether we're in availability mode (dates filled)
  const hasDates = Boolean(filters.check_in && filters.check_out);

  // Build params for the regular rooms endpoint
  const regularParams = (() => {
    const p = {};
    if (filters.room_type)   p.room_type    = filters.room_type;
    if (filters.bed_type)    p.bed_type     = filters.bed_type;
    if (filters.min_price)   p.min_price    = filters.min_price;
    if (filters.max_price)   p.max_price    = filters.max_price;
    if (filters.min_capacity && !hasDates) p.min_capacity = filters.min_capacity;
    return p;
  })();

  // Only fetch regular rooms when NOT in date-search mode
  const { rooms: regularRooms, loading: regularLoading, error: regularError } = useRooms(
    hasDates ? null : regularParams
  );

  const { results: availabilityResults, loading: availLoading, error: availError, search } = useAvailability();

  /* ── Auto-search logic ───────────────────────────────
     Fires automatically when both check_in and check_out
     are set. Debounced 400ms so rapid date changes don't
     hammer the API. Guests default to 1 if not set.
  ─────────────────────────────────────────────────── */
  const autoSearchTimerRef = useRef(null);

  const runAvailabilitySearch = useCallback((currentFilters) => {
    const errors = validateFilters(currentFilters);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      check_in:     currentFilters.check_in,
      check_out:    currentFilters.check_out,
      // Default to 1 guest if not specified — availability search still runs
      guests_count: currentFilters.min_capacity || 1,
      ...(currentFilters.room_type && { room_type: currentFilters.room_type }),
      ...(currentFilters.bed_type  && { bed_type:  currentFilters.bed_type }),
    };
    search(payload);
  }, [search]);

  useEffect(() => {
    // Only auto-search when BOTH dates are present
    if (!filters.check_in || !filters.check_out) return;

    // Cancel any pending search
    if (autoSearchTimerRef.current) clearTimeout(autoSearchTimerRef.current);

    // Debounce 400ms
    autoSearchTimerRef.current = setTimeout(() => {
      runAvailabilitySearch(filters);
    }, 400);

    return () => {
      if (autoSearchTimerRef.current) clearTimeout(autoSearchTimerRef.current);
    };
  }, [filters.check_in, filters.check_out, filters.min_capacity, filters.room_type, filters.bed_type]);

  /* ── Manual search (Search button) ──────────────────── */
  const handleSearch = () => {
    if (hasDates) {
      runAvailabilitySearch(filters);
    }
    // If no dates, button is a no-op (regular list already updates reactively)
  };

  /* ── Filter change handler ───────────────────────────── */
  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    // Clear errors when dates are cleared
    if (!newFilters.check_in || !newFilters.check_out) {
      setValidationErrors({});
    }
  };

  /* ── Clear search ────────────────────────────────────── */
  const handleClearSearch = () => {
    setFilters({});
    setValidationErrors({});
  };

  /* ── Derive displayed rooms ──────────────────────────── */
  let rooms   = [];
  let loading = false;
  let error   = null;

  if (hasDates && availabilityResults) {
    // Availability mode: server returns only available rooms
    // Apply client-side price filter on top
    const raw = availabilityResults.available_rooms || [];
    rooms   = applyPriceFilter(raw, filters.min_price, filters.max_price);
    loading = availLoading;
    error   = availError;
  } else if (hasDates && availLoading) {
    // Still searching
    rooms   = [];
    loading = true;
    error   = null;
  } else if (!hasDates) {
    // No dates: show all rooms (server-filtered by type/bed/price/capacity)
    rooms   = regularRooms || [];
    loading = regularLoading;
    error   = regularError;
  }

  const hasResults    = rooms.length > 0;
  const showNoResults = !loading && !error && !hasResults && (hasDates ? !!availabilityResults : true);

  /* ── Summary text ─────────────────────────────────────── */
  const summaryText = (() => {
    if (hasDates && availabilityResults) {
      const nights = calculateNights(filters.check_in, filters.check_out);
      const guestStr = filters.min_capacity
        ? `${filters.min_capacity} guest${filters.min_capacity > 1 ? 's' : ''}`
        : 'all capacities';
      return `${rooms.length} room${rooms.length !== 1 ? 's' : ''} available · ${nights} night${nights !== 1 ? 's' : ''} · ${guestStr}`;
    }
    return `${rooms.length} room${rooms.length !== 1 ? 's' : ''} found`;
  })();

  return (
    <div className="room-list-page">
      <Navbar />

      <FloatingFilterBar
        filters={filters}
        onChange={handleFiltersChange}
        onSearch={handleSearch}
        validationErrors={validationErrors}
        isSearching={availLoading}
        isAvailabilityMode={hasDates && !!availabilityResults && !availLoading}
      />

      <div className="room-list-container">
        {!loading && !error && (hasResults || showNoResults) && (
          <div className="room-results-header">
            <div>
              <p className="room-results-count">
                <span>{rooms.length}</span> {rooms.length === 1 ? 'Room' : 'Rooms'} {hasDates ? 'Available' : 'Found'}
              </p>
              {hasDates && availabilityResults && (
                <p className="room-results-subtitle">{summaryText}</p>
              )}
            </div>
            {hasDates && (
              <button
                className="rl-reset-btn"
                style={{ fontSize: 10, padding: '8px 18px' }}
                onClick={handleClearSearch}
              >
                Clear Search
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="room-list-loading">
            <div className="rl-spinner" />
            <p>{hasDates ? 'Checking availability…' : 'Loading rooms…'}</p>
          </div>
        )}

        {error && !loading && (
          <div className="room-list-error">
            <div className="rl-empty-icon"><SearchX size={24} /></div>
            <p className="rl-empty-title">Something went wrong</p>
            <p className="rl-empty-desc">Unable to load rooms. Please try again.</p>
            <button className="rl-reset-btn" onClick={handleClearSearch}>Reset Filters</button>
          </div>
        )}

        {showNoResults && (
          <div className="room-list-empty">
            <div className="rl-empty-icon"><SearchX size={24} /></div>
            <p className="rl-empty-title">No Rooms Available</p>
            <p className="rl-empty-desc">
              {hasDates
                ? 'No rooms are available for your selected dates. Try different dates or adjust your filters.'
                : 'No rooms match your current filters.'}
            </p>
            <button className="rl-reset-btn" onClick={handleClearSearch}>Clear Filters</button>
          </div>
        )}

        {!loading && !error && hasResults && (
          <div className="room-grid">
            {rooms.map((room) => (
              <RoomCardItem
                key={room.id}
                room={room}
                onViewDetails={setSelectedRoom}
                availabilityDates={hasDates ? { check_in: filters.check_in, check_out: filters.check_out } : null}
              />
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