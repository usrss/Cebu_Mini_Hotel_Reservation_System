// src/features/rooms/RoomListPage.jsx
import { useState, useEffect } from 'react';
import { Building2, SearchX } from 'lucide-react';
import RoomCard from './RoomCard';
import RoomFilters from './RoomFilters';
import { useRooms, useAvailability } from '../hooks/useRooms';
import './RoomListPage.css';

export default function RoomListPage() {
  const [filters, setFilters] = useState({});

  const hasDateRange = Boolean(filters.check_in && filters.check_out);

  const cleanFilters = (obj) => {
    return Object.fromEntries(
      Object.entries(obj).filter(([key, value]) => {
        if (key === 'check_in' || key === 'check_out') return hasDateRange && value;
        return value !== undefined && value !== '' && value !== null;
      })
    );
  };

  const activeFilters = cleanFilters(filters);

  const { rooms: regularRooms, loading: regularLoading, error: regularError } = useRooms(
    hasDateRange ? {} : activeFilters
  );
  const { results: availabilityResults, loading: availLoading, error: availError, search } = useAvailability();

  useEffect(() => {
    if (hasDateRange) {
      search(activeFilters);
    }
  }, [JSON.stringify(activeFilters), hasDateRange]);

  const rooms   = hasDateRange ? (availabilityResults?.available_rooms || []) : regularRooms;
  const loading = hasDateRange ? availLoading : regularLoading;
  const error   = hasDateRange ? availError : regularError;

  const handleResetFilters = () => setFilters({});

  return (
    <div className="room-list-page">
      {/* ── Hero ── */}
      <div className="room-list-hero">
        <div className="hero-background" />
        <div className="hero-content">
          <div className="hero-icon">
            <Building2 size={28} />
          </div>
          <p className="hero-eyebrow">Our Collection</p>
          <h1 className="hero-title">Find Your Perfect Room</h1>
          <p className="hero-subtitle">
            Explore our beautifully designed rooms and suites, each crafted for comfort and elegance.
          </p>
          <div className="hero-divider" />
        </div>
      </div>

      {/* ── Main ── */}
      <div className="room-list-container">
        <div className="room-list-layout">
          {/* Filters */}
          <RoomFilters
            filters={filters}
            onChange={setFilters}
            onReset={handleResetFilters}
          />

          {/* Results */}
          <div className="room-list-results">
            {/* Results header */}
            {!loading && !error && (
              <div className="room-results-header">
                <p className="room-results-count">
                  <span>{rooms.length}</span> {rooms.length === 1 ? 'Room' : 'Rooms'} Found
                  {hasDateRange && ' · Availability Search'}
                </p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="room-list-loading">
                <div className="rl-spinner" />
                <p>Searching rooms…</p>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="room-list-error">
                <div className="rl-empty-icon">
                  <SearchX size={24} />
                </div>
                <p className="rl-empty-title">Something went wrong</p>
                <p className="rl-empty-desc">Unable to load rooms. Please try again.</p>
                <button className="rl-reset-btn" onClick={handleResetFilters}>Reset Filters</button>
              </div>
            )}

            {/* Empty */}
            {!loading && !error && rooms.length === 0 && (
              <div className="room-list-empty">
                <div className="rl-empty-icon">
                  <SearchX size={24} />
                </div>
                <p className="rl-empty-title">No Rooms Found</p>
                <p className="rl-empty-desc">
                  {hasDateRange
                    ? 'No rooms are available for your selected dates.'
                    : 'No rooms match your current filters.'}
                </p>
                <button className="rl-reset-btn" onClick={handleResetFilters}>
                  Clear Filters
                </button>
              </div>
            )}

            {/* Grid */}
            {!loading && !error && rooms.length > 0 && (
              <div className="room-grid">
                {rooms.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}