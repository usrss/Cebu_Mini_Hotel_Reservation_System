import { Link } from "react-router-dom";
import { Users, Maximize2, BedDouble } from "lucide-react";

const STATUS_STYLES = {
  available:   "bg-emerald-100 text-emerald-700",
  occupied:    "bg-red-100 text-red-700",
  maintenance: "bg-amber-100 text-amber-700",
  reserved:    "bg-blue-100 text-blue-700",
};

export default function RoomCard({ room, showBookButton = true, dateRange = null }) {
  const {
    id,
    room_number,
    room_type_display,
    bed_type_display,
    bed_type,
    capacity,
    price_per_night,
    status,
    status_display,
    size_sqm,
    primary_image,
    amenity_names = [],
  } = room;

  const bookingQuery = dateRange
    ? `?check_in=${dateRange.check_in}&check_out=${dateRange.check_out}`
    : "";

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 flex flex-col">

      {/* Image */}
      <div className="relative h-48 bg-gray-100 overflow-hidden">
        {primary_image?.image_url ? (
          <img
            src={primary_image.image_url}
            alt={`Room ${room_number}`}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <BedDouble size={48} />
          </div>
        )}

        {/* Status badge */}
        <span className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}>
          {status_display}
        </span>

        {/* Room number badge */}
        <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-gray-800 text-xs font-bold px-2.5 py-1 rounded-full">
          #{room_number}
        </span>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-gray-900 text-base leading-tight">
            {room_type_display} Room
          </h3>
          <div className="text-right shrink-0">
            <span className="text-lg font-bold text-indigo-600">${price_per_night}</span>
            <span className="text-gray-400 text-xs block">/night</span>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1">
            <Users size={12} /> {capacity} guests
          </span>
          <span className="flex items-center gap-1">
            <BedDouble size={12} /> {bed_type_display}
          </span>
          {size_sqm && (
            <span className="flex items-center gap-1">
              <Maximize2 size={12} /> {size_sqm}m²
            </span>
          )}
        </div>

        {/* Amenities preview */}
        {amenity_names.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {amenity_names.slice(0, 3).map((name) => (
              <span key={name} className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md border border-gray-200">
                {name}
              </span>
            ))}
            {amenity_names.length > 3 && (
              <span className="text-xs text-gray-400">+{amenity_names.length - 3} more</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex gap-2">
          <Link
            to={`/rooms/${id}`}
            className="flex-1 text-center text-sm text-indigo-600 border border-indigo-200 rounded-xl py-2 hover:bg-indigo-50 transition-colors font-medium"
          >
            View Details
          </Link>
          {showBookButton && status === "available" && (
            <Link
              to={`/book/${id}${bookingQuery}`}
              className="flex-1 text-center text-sm bg-indigo-600 text-white rounded-xl py-2 hover:bg-indigo-700 transition-colors font-medium"
            >
              Book Now
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}