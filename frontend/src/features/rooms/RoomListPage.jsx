import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, SearchX } from "lucide-react";
import RoomCard from "../rooms/RoomCard";
import RoomFilters from "../rooms/RoomFilters";
import { useRooms, useAvailability } from "../hooks/useRooms";
import './RoomListPage.css';

export default function RoomListPage() {
  const [filters, setFilters] = useState({});
  const { rooms, loading, error } = useRooms(filters);

  const handleResetFilters = () => setFilters({});

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