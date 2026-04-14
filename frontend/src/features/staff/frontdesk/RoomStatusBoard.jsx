/**
 * RoomStatusBoard.jsx — Redesigned light theme
 * Removed: refresh button, border colors, gold color refs
 * Added: real-time auto-refresh every 60s, accent strip on tiles only
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  frontDeskRoomsApi,
  ROOM_STATUS_CONFIG,
  ROOM_TYPE_LABELS,
} from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

const STATUS_FILTERS = ['all', 'available', 'occupied', 'cleaning', 'maintenance', 'reserved'];

// Clean status color map — no gold, only readable semantic colors
const STATUS_COLORS = {
  available:   { badge: 'var(--fd-green-bg)',  text: 'var(--fd-black)',  label: 'Available'   },
  occupied:    { badge: 'var(--fd-accent-lt)', text: 'var(--fd-accent)', label: 'Occupied'    },
  cleaning:    { badge: 'var(--fd-amber-bg)',  text: 'var(--fd-amber)',  label: 'Cleaning'    },
  maintenance: { badge: 'var(--fd-red-bg)',    text: 'var(--fd-red)',    label: 'Maintenance' },
  all:         { badge: 'var(--fd-surface-2)', text: 'var(--fd-text-muted)', label: 'All'   },
};

export default function RoomStatusBoard() {
  const navigate = useNavigate();

  const [rooms,        setRooms]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [floorFilter,  setFloorFilter]  = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await frontDeskRoomsApi.list();
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setRooms(list);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load rooms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Real-time: auto-refresh every 60s, no manual refresh button
  useEffect(() => {
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const counts = STATUS_FILTERS.reduce((acc, s) => {
    acc[s] = s === 'all' ? rooms.length : rooms.filter((r) => r.status === s).length;
    return acc;
  }, {});

  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const types  = [...new Set(rooms.map((r) => r.room_type))].sort();

  const filtered = rooms.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter  && r.room_type !== typeFilter)  return false;
    if (floorFilter && String(r.floor) !== floorFilter) return false;
    return true;
  });

  const byFloor = filtered.reduce((acc, r) => {
    const key = `Floor ${r.floor}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="fd-page">
      <div className="fd-inner">

        {/* Header — no eyebrow, no refresh button */}
        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <h1>Room Status Board</h1>
            <p>{rooms.length} total rooms · updates automatically</p>
          </div>
        </div>

        {/* Status tabs */}
        <div className="fd-status-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => {
            const cfg   = STATUS_COLORS[s] || STATUS_COLORS.all;
            const label = s === 'all' ? 'All Rooms' : cfg.label;
            return (
              <button
                key={s}
                className={`fd-status-tab${statusFilter === s ? ' active' : ''}`}
                onClick={() => setStatusFilter(s)}
                style={statusFilter === s && s !== 'all' ? { color: cfg.text, background: cfg.badge } : {}}
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
              style={{ padding: '6px 14px', fontSize: 11 }}
              onClick={() => { setTypeFilter(''); setFloorFilter(''); }}
            >
              Clear
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fd-text-muted)' }}>
            Showing {filtered.length} of {rooms.length} rooms
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'all').map(([key, cfg]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: cfg.strip, flexShrink: 0,
              }} />
              <span style={{ color: 'var(--fd-text-sec)', fontWeight: 500 }}>{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Room grid */}
        {loading ? (
          <div className="fd-loading"><div className="fd-spinner" /><p>Loading rooms</p></div>
        ) : error ? (
          <div className="fd-error"><p>{error}</p></div>
        ) : filtered.length === 0 ? (
          <div className="fd-card" style={{ textAlign: 'center', color: 'var(--fd-text-muted)', fontSize: 13 }}>
            No rooms match the current filters.
          </div>
        ) : (
          Object.entries(byFloor).sort().map(([floorLabel, floorRooms]) => {
            const cfg = STATUS_COLORS;
            return (
              <div key={floorLabel} style={{ marginBottom: 28 }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: 'var(--fd-text-muted)', marginBottom: 12,
                }}>
                  {floorLabel}
                </p>
                <div className="fd-rooms-grid">
                  {floorRooms
                    .sort((a, b) => a.room_number.localeCompare(b.room_number))
                    .map((room) => {
                      const sc = STATUS_COLORS[room.status] || STATUS_COLORS.available;
                      return (
                        <div key={room.id} className="fd-room-tile">
                          {/* Top accent strip — no border color */}
                          <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0,
                            height: 3, background: sc.strip,
                            borderRadius: '14px 14px 0 0',
                          }} />

                          <div className="fd-room-number" style={{ marginTop: 6 }}>
                            {room.room_number}
                          </div>
                          <div className="fd-room-type">
                            {ROOM_TYPE_LABELS[room.room_type] || room.room_type}
                          </div>
                          <div className="fd-room-floor">
                            {room.bed_type} bed · {room.capacity} guest{room.capacity !== 1 ? 's' : ''}
                          </div>
                          <div
                            className="fd-room-status-label"
                            style={{ background: sc.badge, color: sc.text }}
                          >
                            {sc.label}
                          </div>
                          {Number(room.discount_percentage) > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--fd-accent)', marginTop: 6, fontWeight: 600 }}>
                              {room.discount_percentage}% off
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}