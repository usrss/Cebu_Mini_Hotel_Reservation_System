/**
 * src/features/staff/frontdesk/RoomStatusBoard.jsx
 *
 * Live grid of all hotel rooms showing current status.
 * Front Desk can filter by status. Read-only (status changes are
 * handled by housekeeping/maintenance through their own pages).
 *
 * RBAC: front_desk, admin, manager
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  frontDeskRoomsApi,
  ROOM_STATUS_CONFIG,
  ROOM_TYPE_LABELS,
  formatPHP,
} from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

const STATUS_FILTERS = ['all', 'available', 'occupied', 'cleaning', 'maintenance', 'reserved'];

export default function RoomStatusBoard() {
  const navigate = useNavigate();

  const [rooms,        setRooms]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [floorFilter,  setFloorFilter]  = useState('');
  const [lastRefresh,  setLastRefresh]  = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await frontDeskRoomsApi.list();
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setRooms(list);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load rooms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  // Status counts for tabs
  const counts = STATUS_FILTERS.reduce((acc, s) => {
    acc[s] = s === 'all' ? rooms.length : rooms.filter((r) => r.status === s).length;
    return acc;
  }, {});

  // Available floors from room data
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);

  // Available room types
  const types = [...new Set(rooms.map((r) => r.room_type))].sort();

  // Filtered rooms
  const filtered = rooms.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter  && r.room_type !== typeFilter)  return false;
    if (floorFilter && String(r.floor) !== floorFilter) return false;
    return true;
  });

  // Group by floor for display
  const byFloor = filtered.reduce((acc, r) => {
    const key = `Floor ${r.floor}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="fd-page">
      <div className="fd-inner">

        {/* Header */}
        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Room Status Board</h1>
            <p>
              {rooms.length} total rooms
              {lastRefresh && ` · Updated ${lastRefresh.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fd-btn" onClick={load}>↻ Refresh</button>
            <button className="fd-btn" onClick={() => navigate('/staff/front-desk')}>← Back</button>
          </div>
        </div>

        {/* Status tabs */}
        <div className="fd-status-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => {
            const cfg   = ROOM_STATUS_CONFIG[s];
            const label = s === 'all' ? 'All Rooms' : (cfg?.label || s);
            return (
              <button
                key={s}
                className={`fd-status-tab${statusFilter === s ? ' active' : ''}`}
                onClick={() => setStatusFilter(s)}
                style={statusFilter === s && s !== 'all' ? { color: cfg?.color } : {}}
              >
                {label}
                <span className="fd-status-tab-count">{counts[s]}</span>
              </button>
            );
          })}
        </div>

        {/* Secondary filters */}
        <div className="fd-filter-bar">
          <select
            className="fd-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>{ROOM_TYPE_LABELS[t] || t}</option>
            ))}
          </select>
          <select
            className="fd-select"
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
          >
            <option value="">All Floors</option>
            {floors.map((f) => (
              <option key={f} value={String(f)}>Floor {f}</option>
            ))}
          </select>
          {(typeFilter || floorFilter) && (
            <button
              className="fd-btn"
              style={{ padding: '6px 14px', fontSize: 9 }}
              onClick={() => { setTypeFilter(''); setFloorFilter(''); }}
            >
              Clear
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--white-dim)' }}>
            Showing {filtered.length} of {rooms.length} rooms
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {Object.entries(ROOM_STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                background: cfg.bg, border: `1px solid ${cfg.border}`,
              }} />
              <span style={{ color: 'var(--white-dim)', letterSpacing: 0.5 }}>{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Room grid */}
        {loading ? (
          <div className="fd-loading"><div className="fd-spinner" /><p>Loading rooms…</p></div>
        ) : error ? (
          <div className="fd-error"><p>{error}</p></div>
        ) : filtered.length === 0 ? (
          <div className="fd-card" style={{ textAlign: 'center', color: 'var(--white-dim)', fontSize: 13 }}>
            No rooms match the current filters.
          </div>
        ) : (
          Object.entries(byFloor).sort().map(([floorLabel, floorRooms]) => (
            <div key={floorLabel} style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12 }}>
                {floorLabel}
              </p>
              <div className="fd-rooms-grid">
                {floorRooms
                  .sort((a, b) => a.room_number.localeCompare(b.room_number))
                  .map((room) => {
                    const cfg = ROOM_STATUS_CONFIG[room.status] || ROOM_STATUS_CONFIG.available;
                    return (
                      <div
                        key={room.id}
                        className="fd-room-tile"
                        style={{
                          borderColor: cfg.border,
                          background:  cfg.bg,
                        }}
                      >
                        {/* Top accent bar */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                          background: cfg.color,
                        }} />

                        <div className="fd-room-number" style={{ color: cfg.color }}>
                          {room.room_number}
                        </div>
                        <div className="fd-room-type">
                          {ROOM_TYPE_LABELS[room.room_type] || room.room_type}
                        </div>
                        <div className="fd-room-floor" style={{ color: 'var(--white-dim)', fontSize: 11, marginBottom: 8 }}>
                          {room.bed_type} bed · {room.capacity} guest{room.capacity !== 1 ? 's' : ''}
                        </div>
                        <div className="fd-room-status-label" style={{ borderColor: cfg.border, color: cfg.color }}>
                          {cfg.label}
                        </div>
                        {Number(room.discount_percentage) > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 6 }}>
                            ↓ {room.discount_percentage}% off
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}