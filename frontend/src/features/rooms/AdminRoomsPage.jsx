import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useAdminRooms } from "../hooks/useRooms";
import RoomFormModal from "../rooms/RoomFormModal";


const STATUS_OPTIONS = ["available", "occupied", "maintenance", "reserved"];

const STATUS_COLORS = {
  available: "bg-emerald-100 text-emerald-700",
  occupied: "bg-red-100 text-red-700",
  maintenance: "bg-amber-100 text-amber-700",
  reserved: "bg-blue-100 text-blue-700",
};

export default function AdminRoomsPage() {
  const { rooms, loading, error, submitting, createRoom, updateRoom, updateStatus, deleteRoom } =
    useAdminRooms();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState({ open: false, room: null });
  const [deletingId, setDeletingId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = rooms.filter((r) => {
    const matchSearch =
      !search ||
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
      showToast(modal.room ? "Room updated successfully" : "Room created successfully");
    }
    return result;
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to deactivate this room?")) return;
    setDeletingId(id);
    const result = await deleteRoom(id);
    setDeletingId(null);
    if (result.success) showToast("Room deactivated");
  };

  const handleStatusChange = async (id, newStatus) => {
    const result = await updateStatus(id, newStatus);
    if (result.success) showToast("Status updated");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in">
          <CheckCircle size={18} />
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Room Management</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage all rooms and their availability
            </p>
          </div>
          <button
            onClick={() => setModal({ open: true, room: null })}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={18} />
            Add Room
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {["all", ...STATUS_OPTIONS].map((s) => {
            const count =
              s === "all" ? rooms.length : rooms.filter((r) => r.status === s).length;
            const label = s === "all" ? "Total Rooms" : s.charAt(0).toUpperCase() + s.slice(1);
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`bg-white rounded-lg p-4 border-2 transition-all ${
                  statusFilter === s
                    ? "border-indigo-500 shadow-md"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="text-3xl font-bold text-gray-900">{count}</div>
                <div className="text-sm text-gray-500 mt-1 capitalize">{label}</div>
              </button>
            );
          })}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search rooms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <LoadingTable />
        ) : error ? (
          <div className="text-center py-12 text-red-600">{error}</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Room", "Type", "Floor", "Bed", "Capacity", "Price", "Status", "Actions"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                        No rooms found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((room) => (
                      <tr key={room.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          #{room.room_number}
                        </td>
                        <td className="px-6 py-4 text-gray-700 capitalize">{room.room_type}</td>
                        <td className="px-6 py-4 text-gray-600">{room.floor}</td>
                        <td className="px-6 py-4 text-gray-600 capitalize">{room.bed_type}</td>
                        <td className="px-6 py-4 text-gray-600">{room.capacity}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          ${room.price_per_night}
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={room.status}
                            onChange={(e) => handleStatusChange(room.id, e.target.value)}
                            className={`px-3 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                              STATUS_COLORS[room.status]
                            }`}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setModal({ open: true, room })}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(room.id)}
                              disabled={deletingId === room.id}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingId === room.id ? (
                                <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
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

function LoadingTable() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {[80, 100, 60, 80, 60, 80, 100, 80].map((w, j) => (
              <div
                key={j}
                className="h-8 bg-gray-200 rounded animate-pulse"
                style={{ width: w }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}