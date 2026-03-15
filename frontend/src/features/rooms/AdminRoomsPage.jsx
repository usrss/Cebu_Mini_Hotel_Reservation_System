import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Image } from 'lucide-react';
import { useAdminRooms } from '../hooks/useRooms';
import RoomFormModal from './RoomFormModal';
import RoomImageModal from './RoomImageModal';
import './AdminRoomsPage.css';

const STATUS_OPTIONS = ['available', 'occupied', 'maintenance', 'reserved', 'cleaning'];

export default function AdminRoomsPage() {
  const {
    rooms, loading, error, submitting,
    createRoom, updateRoom, updateStatus, deleteRoom, uploadImages,
  } = useAdminRooms();

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal,        setModal]        = useState({ open: false, room: null });
  const [imageModal,   setImageModal]   = useState({ open: false, room: null });
  const [deletingId,   setDeletingId]   = useState(null);
  const [toast,        setToast]        = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = rooms.filter((r) => {
    const matchSearch =
      !search ||
      r.room_number.toLowerCase().includes(search.toLowerCase()) ||
      r.room_type.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleSave = async (data) => {
    const result = modal.room
      ? await updateRoom(modal.room.id, data)
      : await createRoom(data);
    if (result.success) {
      setModal({ open: false, room: null });
      showToast(modal.room ? 'Room updated successfully' : 'Room created successfully');
    }
    return result;
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this room? It will be hidden from guests.')) return;
    setDeletingId(id);
    const result = await deleteRoom(id);
    setDeletingId(null);
    if (result.success) showToast('Room deactivated');
    else showToast('Failed to deactivate room', 'error');
  };

  const handleStatusChange = async (id, newStatus) => {
    const result = await updateStatus(id, newStatus);
    if (result.success) showToast('Status updated');
    else showToast('Failed to update status', 'error');
  };

  const handleImageUpload = async (roomId, files) => {
    const result = await uploadImages(roomId, files);
    if (result.success) showToast(`${files.length} image(s) uploaded`);
    else showToast('Image upload failed', 'error');
    return result;
  };

  return (
    <div className="ar-page">

      {/* Toast */}
      {toast && (
        <div className={`ar-toast ar-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="ar-header">
        <div className="ar-header-left">
          <h1>Room Management</h1>
          <p>{rooms.length} total rooms · {rooms.filter(r => r.status === 'available').length} available</p>
        </div>
        <button className="ar-add-btn" onClick={() => setModal({ open: true, room: null })}>
          <Plus size={16} /> Add Room
        </button>
      </header>

      <div className="ar-body">

        {/* Stats */}
        <div className="ar-stats">
          {['all', ...STATUS_OPTIONS].map((s) => {
            const count = s === 'all' ? rooms.length : rooms.filter(r => r.status === s).length;
            const label = s === 'all' ? 'Total' : s.charAt(0).toUpperCase() + s.slice(1);
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`ar-stat-btn${statusFilter === s ? ' ar-stat-btn--active' : ''}`}
              >
                <div className="ar-stat-value">{count}</div>
                <div className="ar-stat-label">{label}</div>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="ar-toolbar">
          <div className="ar-search-wrap">
            <Search size={16} className="ar-search-icon" />
            <input
              className="ar-search"
              placeholder="Search by room number or type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="ar-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="ar-loading">
            <div className="ar-spinner" />
            <span>Loading rooms…</span>
          </div>
        ) : error ? (
          <div className="ar-error">{error}</div>
        ) : (
          <div className="ar-table-wrap">
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Type</th>
                  <th>Floor</th>
                  <th>Bed</th>
                  <th>Capacity</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Images</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="ar-empty">No rooms found</td>
                  </tr>
                ) : (
                  filtered.map((room) => (
                    <tr key={room.id}>
                      <td>
                        <div className="ar-room-number">#{room.room_number}</div>
                        {room.view_type && room.view_type !== 'none' && (
                          <div className="ar-room-view">{room.view_type} view</div>
                        )}
                        {!room.is_active && (
                          <div className="ar-inactive-tag">Inactive</div>
                        )}
                      </td>
                      <td className="ar-type">{room.room_type}</td>
                      <td>{room.floor}</td>
                      <td style={{ textTransform: 'capitalize' }}>{room.bed_type}</td>
                      <td>
                        <div className="ar-capacity-main">{room.max_adults}A + {room.max_children}C</div>
                        <div className="ar-capacity-sub">Max: {room.capacity}</div>
                      </td>
                      <td>
                        {Number(room.discount_percentage) > 0 ? (
                          <>
                            <div className="ar-price-original">₱{room.price_per_night}</div>
                            <div className="ar-price-discounted">₱{room.discounted_price}</div>
                            <div className="ar-price-discount-pct">-{room.discount_percentage}%</div>
                          </>
                        ) : (
                          <div className="ar-price-base">₱{room.price_per_night}</div>
                        )}
                      </td>
                      <td>
                        <select
                          value={room.status}
                          onChange={(e) => handleStatusChange(room.id, e.target.value)}
                          className={`ar-status-select ar-status--${room.status}`}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="ar-img-btn"
                          onClick={() => setImageModal({ open: true, room })}
                        >
                          <Image size={13} />
                          {room.images?.length ?? 0} photo{(room.images?.length ?? 0) !== 1 ? 's' : ''}
                        </button>
                      </td>
                      <td>
                        <div className="ar-actions">
                          <button
                            className="ar-action-btn"
                            onClick={() => setModal({ open: true, room })}
                            title="Edit room"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            className="ar-action-btn ar-action-btn--danger"
                            onClick={() => handleDelete(room.id)}
                            disabled={deletingId === room.id}
                            title="Deactivate room"
                          >
                            {deletingId === room.id
                              ? <div className="ar-spinner" style={{ width: 14, height: 14 }} />
                              : <Trash2 size={15} />
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal.open && (
        <RoomFormModal
          room={modal.room}
          onSave={handleSave}
          onClose={() => setModal({ open: false, room: null })}
          submitting={submitting}
        />
      )}

      {imageModal.open && (
        <RoomImageModal
          room={imageModal.room}
          onUpload={handleImageUpload}
          onClose={() => setImageModal({ open: false, room: null })}
        />
      )}
    </div>
  );
}