import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, SearchX } from "lucide-react";
import RoomCard from "../rooms/RoomCard";
import RoomFilters from "../rooms/RoomFilters";
import { useRooms, useAvailability } from "../hooks/useRooms";

export default function RoomListPage() {
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    check_in:  searchParams.get("check_in")  || "",
    check_out: searchParams.get("check_out") || "",
  });

  const [isAvailabilityMode, setIsAvailabilityMode] = useState(
    !!(searchParams.get("check_in") && searchParams.get("check_out"))
  );

  const { rooms, loading: roomsLoading, error: roomsError } = useRooms(
    isAvailabilityMode ? {} : filters
  );
  const { results, loading: availLoading, error: availError, search, reset } = useAvailability();

  // Auto-trigger availability search when both dates are set
  useEffect(() => {
    if (filters.check_in && filters.check_out) {
      setIsAvailabilityMode(true);
      const { check_in, check_out, ...rest } = filters;
      search({ check_in, check_out, ...stripEmpty(rest) });
    } else {
      setIsAvailabilityMode(false);
      reset();
    }
  }, [filters.check_in, filters.check_out]);

  const displayRooms = isAvailabilityMode
    ? (results?.available_rooms || [])
    : rooms;

  const isLoading = isAvailabilityMode ? availLoading : roomsLoading;
  const error     = isAvailabilityMode ? availError  : roomsError;

  const handleReset = () => {
    setFilters({});
    setIsAvailabilityMode(false);
    reset();
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Banner */}
      <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 text-white py-12 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="flex justify-center mb-3">
            <Building2 size={36} className="opacity-80" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Find Your Perfect Room</h1>
          <p className="text-indigo-200">
            Browse our rooms or enter dates to check availability.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Availability result banner */}
        {isAvailabilityMode && results && (
          <div className="mb-6 bg-white border border-emerald-200 rounded-2xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                {results.total_found} room{results.total_found !== 1 ? "s" : ""} available
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {results.check_in} → {results.check_out} · {results.nights} night{results.nights !== 1 ? "s" : ""}
              </p>
            </div>
            <button onClick={handleReset} className="text-sm text-indigo-600 hover:underline">
              Clear dates
            </button>
          </div>
        )}

        <div className="flex gap-6">

          {/* Filters */}
          <RoomFilters
            filters={filters}
            onChange={setFilters}
            onReset={handleReset}
          />

          {/* Room Grid */}
          <div className="flex-1 min-w-0">
            {/* Mobile filters */}
            <div className="lg:hidden mb-4">
              <RoomFilters
                filters={filters}
                onChange={setFilters}
                onReset={handleReset}
              />
            </div>

            {isLoading ? (
              <GridSkeleton />
            ) : error ? (
              <ErrorState message={error} />
            ) : displayRooms.length === 0 ? (
              <EmptyState onReset={handleReset} isSearch={isAvailabilityMode} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {displayRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    dateRange={
                      filters.check_in && filters.check_out
                        ? { check_in: filters.check_in, check_out: filters.check_out }
                        : null
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 animate-pulse">
          <div className="h-48 bg-gray-200" />
          <div className="p-4 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="h-8 bg-gray-200 rounded-xl mt-4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onReset, isSearch }) {
  return (
    <div className="text-center py-20">
      <SearchX size={48} className="mx-auto text-gray-300 mb-4" />
      <h3 className="font-semibold text-gray-700 mb-1">
        {isSearch ? "No rooms available for these dates" : "No rooms found"}
      </h3>
      <p className="text-sm text-gray-400 mb-5">Try adjusting your filters or dates.</p>
      <button
        onClick={onReset}
        className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
      >
        Clear all filters
      </button>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="text-center py-20">
      <p className="text-red-500 text-sm">{message}</p>
    </div>
  );
}

// Remove empty/undefined filter values before sending to API
function stripEmpty(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && v !== null)
  );
}