import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Users, Maximize2, BedDouble, ChevronLeft, ChevronRight, ArrowLeft, CheckCircle } from "lucide-react";
import { useRoomDetail } from "../hooks/useRooms";

const STATUS_CONFIG = {
  available:   { label: "Available",         cls: "bg-emerald-100 text-emerald-700" },
  occupied:    { label: "Occupied",           cls: "bg-red-100 text-red-700" },
  maintenance: { label: "Under Maintenance",  cls: "bg-amber-100 text-amber-700" },
  reserved:    { label: "Reserved",           cls: "bg-blue-100 text-blue-700" },
};

export default function RoomDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { room, loading, error } = useRoomDetail(id);
  const [activeImage, setActiveImage] = useState(0);
  const [checkIn,  setCheckIn]  = useState("");
  const [checkOut, setCheckOut] = useState("");

  if (loading) return <Skeleton />;

  if (error || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-sm mb-4">{error || "Room not found."}</p>
          <Link to="/rooms" className="text-indigo-600 hover:underline text-sm flex items-center gap-1 justify-center">
            <ArrowLeft size={14} /> Back to Rooms
          </Link>
        </div>
      </div>
    );
  }

  const images     = room.images || [];
  const statusCfg  = STATUS_CONFIG[room.status] || { label: room.status, cls: "bg-gray-100 text-gray-600" };
  const nights     = checkIn && checkOut
    ? Math.max(0, (new Date(checkOut) - new Date(checkIn)) / 86400000)
    : 0;
  const totalPrice = (nights * parseFloat(room.price_per_night || 0)).toFixed(2);

  // Group amenities by category
  const byCategory = (room.amenities || []).reduce((acc, a) => {
    const cat = a.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});

  const handleBook = () => {
    if (!checkIn || !checkOut) return;
    navigate(`/book/${id}?check_in=${checkIn}&check_out=${checkOut}`);
  };

  const prevImage = () => setActiveImage((p) => (p - 1 + images.length) % images.length);
  const nextImage = () => setActiveImage((p) => (p + 1) % images.length);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">

        {/* Back link */}
        <Link to="/rooms" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to Rooms
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Left Column ────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Image Gallery */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="relative h-72 sm:h-80 bg-gray-100">
                {images.length > 0 ? (
                  <>
                    <img
                      src={images[activeImage]?.image_url}
                      alt={`Room ${room.room_number}`}
                      className="w-full h-full object-cover"
                    />
                    {images.length > 1 && (
                      <>
                        <button onClick={prevImage} className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm rounded-full p-1.5 shadow hover:bg-white transition-colors">
                          <ChevronLeft size={16} />
                        </button>
                        <button onClick={nextImage} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm rounded-full p-1.5 shadow hover:bg-white transition-colors">
                          <ChevronRight size={16} />
                        </button>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {images.map((_, i) => (
                            <button key={i} onClick={() => setActiveImage(i)}
                              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === activeImage ? "bg-white" : "bg-white/50"}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-200">
                    <BedDouble size={56} />
                  </div>
                )}
                <span className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.cls}`}>
                  {statusCfg.label}
                </span>
              </div>

              {/* Thumbnail strip */}
              {images.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {images.map((img, i) => (
                    <button key={i} onClick={() => setActiveImage(i)}
                      className={`shrink-0 w-14 h-10 rounded-lg overflow-hidden border-2 transition-colors ${i === activeImage ? "border-indigo-500" : "border-transparent"}`}
                    >
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Room Info */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    {room.room_type_display} Room
                    <span className="ml-2 text-gray-400 font-normal text-base">#{room.room_number}</span>
                  </h1>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Floor {room.floor} · {room.bed_type_display} bed
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-indigo-600">${room.price_per_night}</span>
                  <span className="text-gray-400 text-sm"> /night</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-5 py-4 border-y border-gray-100 mb-4">
                <Stat icon={<Users size={14} />}    label="Capacity" value={`${room.capacity} guests`} />
                <Stat icon={<BedDouble size={14} />} label="Bed"      value={room.bed_type_display} />
                {room.size_sqm && (
                  <Stat icon={<Maximize2 size={14} />} label="Size" value={`${room.size_sqm} m²`} />
                )}
              </div>

              {room.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{room.description}</p>
              )}
            </div>

            {/* Amenities */}
            {Object.keys(byCategory).length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Amenities</h3>
                <div className="space-y-4">
                  {Object.entries(byCategory).map(([cat, items]) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {items.map((a) => (
                          <div key={a.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                            <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                            {a.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right Column: Booking Panel ───────────────────────── */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-4">Reserve this Room</h3>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Check-in</label>
                  <input
                    type="date"
                    value={checkIn}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Check-out</label>
                  <input
                    type="date"
                    value={checkOut}
                    min={checkIn || new Date().toISOString().split("T")[0]}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {/* Price summary */}
              {nights > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm">
                  <div className="flex justify-between text-gray-500 mb-1">
                    <span>${room.price_per_night} × {nights} night{nights !== 1 ? "s" : ""}</span>
                    <span>${totalPrice}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-200">
                    <span>Total</span>
                    <span className="text-indigo-600">${totalPrice}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleBook}
                disabled={!checkIn || !checkOut || room.status !== "available"}
                className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {room.status !== "available" ? statusCfg.label : "Book Now"}
              </button>

              {room.status === "available" && (
                <p className="text-xs text-gray-400 text-center mt-2">No charge until confirmed</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-700">
      <span className="text-indigo-400">{icon}</span>
      <span className="text-gray-400 text-xs">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 animate-pulse">
      <div className="h-4 w-24 bg-gray-200 rounded mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-72 bg-gray-200 rounded-2xl" />
          <div className="bg-white rounded-2xl p-6 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-100 rounded w-1/3" />
          </div>
        </div>
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    </div>
  );
}