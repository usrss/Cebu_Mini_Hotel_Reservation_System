import { useState, useEffect } from 'react';
import { Building2, SearchX } from 'lucide-react';
import RoomCard from './RoomCard';
import RoomFilters from './RoomFilters';
import { useRooms, useAvailability } from '../hooks/useRooms';
import './RoomListPage.css';

export default function RoomListPage() {
  const [filters, setFilters] = useState({});

  // Determine if we're in availability search mode (dates selected)
  const hasDateRange = Boolean(filters.check_in && filters.check_out);

  // Clean filters - remove undefined/empty values
  const cleanFilters = (obj) => {
    return Object.fromEntries(
      Object.entries(obj).filter(([key, value]) => {
        // Keep check_in and check_out for availability mode
        if (key === 'check_in' || key === 'check_out') return hasDateRange && value;
        // For other filters, keep non-empty values
        return value !== undefined && value !== '' && value !== null;
      })
    );
  };

  const activeFilters = cleanFilters(filters);

  console.log('🔍 Filters state:', filters);
  console.log('✅ Clean filters:', activeFilters);
  console.log('📅 Has date range:', hasDateRange);

  // Use regular room listing when no dates
  const { rooms: regularRooms, loading: regularLoading, error: regularError } = useRooms(
    hasDateRange ? {} : activeFilters  // Pass clean filters when not using availability
  );

  // Use availability check when dates are selected
  const { results: availabilityResults, loading: availLoading, error: availError, search } = useAvailability();

  // Trigger availability search when dates or other filters change
  useEffect(() => {
    if (hasDateRange) {
      console.log('🔎 Searching availability with:', activeFilters);
      search(activeFilters);
    }
  }, [JSON.stringify(activeFilters), hasDateRange]);

  // Determine which data to display
  const rooms = hasDateRange ? (availabilityResults?.available_rooms || []) : regularRooms;
  const loading = hasDateRange ? availLoading : regularLoading;
  const error = hasDateRange ? availError : regularError;

  console.log('📊 Displaying rooms:', rooms.length);

  const handleResetFilters = () => {
    console.log('🔄 Resetting filters');
    setFilters({});
  };

  return (
    <div className="room-list-page">
      {/* Hero Header */}
      <div className="room-list-hero">
        <div className="hero-background" />
        <div className="hero-content">
          <div className="hero-icon">
            <Building2 size={32} />
          </div>
          <h1 className="hero-title">Find Your Perfect Room</h1>
          <p className="hero-subtitle">
            Explore our collection of beautifully designed rooms for your stay
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="room-list-container">
        <div className="room-list-layout">
          {/* Filters Sidebar */}
          <RoomFilters
            filters={filters}
            onChange={setFilters}
            onReset={handleResetFilters}
          />

          {/* Room Grid */}
          <div className="room-list-content">
            {/* Availability Banner */}
            {hasDateRange && availabilityResults && (
              <div className="availability-banner">
                <div className="banner-content">
                  <div className="banner-info">
                    <strong>{availabilityResults.total_found}</strong> room{availabilityResults.total_found !== 1 ? 's' : ''} available
                    <span className="date-range">
                      {filters.check_in} to {filters.check_out} ({availabilityResults.nights} night{availabilityResults.nights !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <button onClick={handleResetFilters} className="banner-clear">
                    Clear dates
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <LoadingGrid />
            ) : error ? (
              <ErrorState message={error} />
            ) : rooms.length === 0 ? (
              <EmptyState onReset={handleResetFilters} />
            ) : (
              <>
                <div className="room-list-header">
                  <p className="room-count">
                    <span className="count-number">{rooms.length}</span> room{rooms.length !== 1 ? 's' : ''} available
                  </p>
                </div>
                <div className="room-grid">
                  {rooms.map((room) => (
                    <RoomCard key={room.id} room={room} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="loading-state">
      <div className="loading-header" />
      <div className="room-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="room-card-skeleton">
            <div className="skeleton-image" />
            <div className="skeleton-content">
              <div className="skeleton-title" />
              <div className="skeleton-text" />
              <div className="skeleton-specs">
                <div className="skeleton-spec" />
                <div className="skeleton-spec" />
              </div>
              <div className="skeleton-footer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onReset }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <SearchX size={40} />
      </div>
      <h3 className="empty-title">No rooms found</h3>
      <p className="empty-text">
        We couldn't find any rooms matching your criteria. Try adjusting your filters.
      </p>
      <button onClick={onReset} className="btn btn-primary">
        Clear All Filters
      </button>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="error-state">
      <div className="error-icon">
        <SearchX size={40} />
      </div>
      <h3 className="error-title">Something went wrong</h3>
      <p className="error-text">
        {message || 'Failed to load rooms. Please try again later.'}
      </p>
    </div>
  );
}