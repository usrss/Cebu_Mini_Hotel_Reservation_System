import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import './RoomFilters.css';

const ROOM_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'standard', label: 'Standard' },
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'suite', label: 'Suite' },
  { value: 'family', label: 'Family' },
  { value: 'penthouse', label: 'Penthouse' },
];

const BED_TYPES = [
  { value: '', label: 'Any Bed' },
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'queen', label: 'Queen' },
  { value: 'king', label: 'King' },
  { value: 'twin', label: 'Twin' },
];

export default function RoomFilters({ filters, onChange, onReset }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const updateFilter = (key, value) => {
    onChange({ ...filters, [key]: value || undefined });
  };

  const hasActiveFilters = Object.values(filters).some(v => v && v !== '');

  return (
    <>
      {/* Mobile trigger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="filter-mobile-trigger"
      >
        <SlidersHorizontal size={18} />
        Filters
        {hasActiveFilters && <span className="filter-indicator" />}
      </button>

      {/* Desktop sidebar */}
      <aside className="filter-sidebar">
        <div className="filter-container">
          <FilterPanel
            filters={filters}
            updateFilter={updateFilter}
            onReset={onReset}
            hasActiveFilters={hasActiveFilters}
          />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="filter-overlay" onClick={() => setMobileOpen(false)} />
          <div className="filter-drawer">
            <div className="filter-drawer-header">
              <h3>Filters</h3>
              <button onClick={() => setMobileOpen(false)} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <FilterPanel
              filters={filters}
              updateFilter={updateFilter}
              onReset={onReset}
              hasActiveFilters={hasActiveFilters}
            />
            <button
              onClick={() => setMobileOpen(false)}
              className="filter-apply-btn"
            >
              Show Results
            </button>
          </div>
        </>
      )}
    </>
  );
}

function FilterPanel({ filters, updateFilter, onReset, hasActiveFilters }) {
  return (
    <div className="filter-panel">
      {/* Header */}
      <div className="filter-header">
        <h4 className="filter-title">
          <SlidersHorizontal size={18} />
          Filter Rooms
        </h4>
        {hasActiveFilters && (
          <button onClick={onReset} className="filter-reset">
            Clear all
          </button>
        )}
      </div>

      {/* Room Type */}
      <FilterSection title="Room Type">
        <div className="filter-button-group vertical">
          {ROOM_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateFilter('room_type', value)}
              className={`filter-btn ${(filters.room_type || '') === value ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Bed Type */}
      <FilterSection title="Bed Type">
        <div className="filter-button-group grid">
          {BED_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateFilter('bed_type', value)}
              className={`filter-btn ${(filters.bed_type || '') === value ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Price Range */}
      <FilterSection title="Price Range">
        <div className="price-range-inputs">
          <div className="price-input-wrapper">
            <label>Min</label>
            <div className="price-input-group">
              <span className="currency-symbol">$</span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={filters.min_price || ''}
                onChange={(e) => updateFilter('min_price', e.target.value)}
              />
            </div>
          </div>
          <span className="price-separator">—</span>
          <div className="price-input-wrapper">
            <label>Max</label>
            <div className="price-input-group">
              <span className="currency-symbol">$</span>
              <input
                type="number"
                min="0"
                placeholder="Any"
                value={filters.max_price || ''}
                onChange={(e) => updateFilter('max_price', e.target.value)}
              />
            </div>
          </div>
        </div>
      </FilterSection>

      {/* Capacity */}
      <FilterSection title="Number of Guests">
        <div className="filter-button-group grid capacity">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => updateFilter('min_capacity', n === filters.min_capacity ? undefined : n)}
              className={`filter-btn ${filters.min_capacity === n ? 'active' : ''}`}
            >
              {n}+
            </button>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}

function FilterSection({ title, children }) {
  return (
    <div className="filter-section">
      <h5 className="filter-section-title">{title}</h5>
      {children}
    </div>
  );
}