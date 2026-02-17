import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useAdminRooms } from "../hooks/useRooms";
import RoomFormModal from "../rooms/RoomFormModal";

const STATUS_OPTIONS = ["available", "occupied", "maintenance", "reserved"];

const STATUS_STYLES = {
  available:   "bg-emerald-100 text-emerald-700",
  occupied:    "bg-red-100 text-red-700",
  maintenance: "bg-amber-100 text-amber-700",
  reserved:    "bg-blue-100 text-blue-700",
};

export default function AdminRoomsPage() {
  const {
    rooms, loading, error, submitting,
    createRoom, updateRoom, updateStatus, deleteRoom,
  } = useAdminRooms();

  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal,        setModal]        = useState({ open: false, room: null });
  const [deletingId,   setDeletingId]   = useState(null);
  const [toast,        setToast]        = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = rooms.filter((r) => {
    const matchSearch = !search ||
      r.room_number.toLowerCase().includes(search.toLowerCase()) ||
      r.room_type.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleSave = async (data) => {
    const result = modal.room
      ? await updateRoom(modal.room.id, data)
      : await createRoom(data);

    if (result.success) {
      setModal({ open: false, room: null });
      showToast(modal.room ? "Room updated." : "Room created.");
    }
    return result;
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Deactivate this room? It will be hidden from listings.")) return;
    setDeletingId(id);
    const result = await deleteRoom(id);
    setDeletingId(null);
    if (result.success) showToast("Room deactivated.");
  };

  const handleStatusChange = async (id, newStatus) => {
    const result = await updateStatus(id, newStatus);
    if (result.success) showToast(`Status updated to ${newStatus}.`);
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold text-gray-900">Room Management</h1>
          <button
            onClick={() => setModal({ open: true, room: null })}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <Plus size={15} /> Add Room
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {["all", ...STATUS_OPTIONS].map((s) => {
            const count = s === "all" ? rooms.length : rooms.filter((r) => r.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`bg-white rounded-xl p-4 border text-left transition-all ${
                  statusFilter === s ? "border-indigo-400 shadow-sm" : "border-gray-100"
                }`}
              >
                <p className="text-xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500 capitalize mt-0.5">
                  {s === "all" ? "Total" : s}
                </p>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by room number or type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <p className="text-center text-red-500 text-sm py-10">{error}</p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {["Room #", "Type", "Floor", "Bed", "Capacity", "Price/Night", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                        No rooms match your search.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((room) => (
                      <tr key={room.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-900">{room.room_number}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize">{room.room_type}</td>
                        <td className="px-4 py-3 text-gray-500">{room.floor}</td>
                        <td className="px-4 py-3 text-gray-500 capitalize">{room.bed_type}</td>
                        <td className="px-4 py-3 text-gray-500">{room.capacity}</td>
                        <td className="px-4 py-3 font-medium text-indigo-600">${room.price_per_night}</td>
                        <td className="px-4 py-3">
                          <select
                            value={room.status}
                            onChange={(e) => handleStatusChange(room.id, e.target.value)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer focus:ring-1 focus:ring-indigo-400 ${STATUS_STYLES[room.status]}`}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Btn label="Edit" onClick={() => setModal({ open: true, room })}>
                              ✏️
                            </Btn>
                            <Btn
                              label="Delete"
                              loading={deletingId === room.id}
                              onClick={() => handleDelete(room.id)}
                              danger
                            >
                              🗑️
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <RoomFormModal
          room={modal.room}
          onSave={handleSave}
          onClose={() => setModal({ open: false, room: null })}
          submitting={submitting}
        />
      )}
    </div>
  );
}

function Btn({ children, label, onClick, loading = false, danger = false }) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={loading}
      className={`p-1.5 rounded-lg text-sm transition-colors disabled:opacity-50 ${
        danger ? "hover:bg-red-50" : "hover:bg-gray-100"
      }`}
    >
      {loading
        ? <span className="block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        : children
      }
    </button>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-4 border-b border-gray-50">
          {[60, 80, 40, 60, 40, 60, 80, 60].map((w, j) => (
            <div key={j} className="h-4 bg-gray-100 rounded" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  );
}