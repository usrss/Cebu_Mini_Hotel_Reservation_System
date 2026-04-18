/**
 * AmenitiesInclusionsModal.jsx
 *
 * Standalone manager for Amenities and Inclusions.
 * Icons: Lucide icon components (no emojis).
 * The `icon` field stored in DB is now a string key (e.g. "Wifi", "Coffee")
 * which maps to the Lucide component. Existing emoji values gracefully fall back
 * to a plain text render so old data is never broken.
 */

import { useState, useEffect } from 'react';
import {
  X, Plus, Edit2, Trash2, Check, Star, Package,
  // Amenity icons
  Wifi, Wind, Tv, Coffee, Bath, Bed, Lock, Phone,
  Dumbbell, ParkingSquare, ShieldCheck, Sparkles,
  AirVent, Shirt, Flame, Monitor, Lamp, Eye,
  // Inclusion icons
  UtensilsCrossed, Car, Plane, Waves, Heart,
  Music, Trophy, Gift, Droplets, Sun, Flower2,
  Wine, Sandwich, Bus,
} from 'lucide-react';
import './AmenitiesInclusionsModal.css';

/* ── Icon registry ──────────────────────────────────────────── */
// Keys are stored in DB as the `icon` string value.
// Components render from this map; unknown keys render as text fallback.

const ICON_MAP = {
  // Amenities
  Wifi,
  Wind,
  AirVent,
  Tv,
  Coffee,
  Bath,
  Bed,
  Lock,
  Phone,
  Dumbbell,
  ParkingSquare,
  ShieldCheck,
  Sparkles,
  Shirt,
  Flame,
  Monitor,
  Lamp,
  Eye,
  // Inclusions
  UtensilsCrossed,
  Car,
  Plane,
  Waves,
  Heart,
  Music,
  Trophy,
  Gift,
  Droplets,
  Sun,
  Flower2,
  Wine,
  Sandwich,
  Bus,
};

// Renders a Lucide icon by string key, or falls back to a text character
function IconRenderer({ name, size = 16, className }) {
  if (!name) return null;
  const Comp = ICON_MAP[name];
  if (Comp) return <Comp size={size} className={className} />;
  // Graceful fallback for old emoji values stored in DB
  return <span style={{ fontSize: size - 2, lineHeight: 1 }}>{name}</span>;
}

/* ── Icon picker data ───────────────────────────────────────── */
const AMENITY_ICON_KEYS = [
  'Wifi', 'Wind', 'AirVent', 'Tv', 'Coffee', 'Bath', 'Bed',
  'Lock', 'Phone', 'Dumbbell', 'ParkingSquare', 'ShieldCheck',
  'Sparkles', 'Shirt', 'Flame', 'Monitor', 'Lamp', 'Eye',
];

const INCLUSION_ICON_KEYS = [
  'UtensilsCrossed', 'Sandwich', 'Car', 'Bus', 'Plane',
  'Waves', 'Heart', 'Music', 'Trophy', 'Gift',
  'Droplets', 'Sun', 'Flower2', 'Wine', 'Coffee',
];

/* ── Category constants ─────────────────────────────────────── */
const AMENITY_CATEGORIES   = ['Room','Bathroom','Entertainment','Connectivity','Safety','Service','Other'];
const INCLUSION_CATEGORIES = ['Food & Beverage','Transport','Activities','Wellness','Concierge','Other'];

const emptyAmenity   = () => ({ id: null, name: '', icon: '', category: 'Room' });
const emptyInclusion = () => ({ id: null, name: '', icon: '', category: 'Food & Beverage', description: '', is_highlighted: false });

/* ── ItemForm ───────────────────────────────────────────────── */
function ItemForm({ type, initial, onSave, onCancel, saving }) {
  const isAmenity  = type === 'amenities';
  const [form, setForm] = useState(initial);
  const [err,  setErr]  = useState({});

  useEffect(() => { setForm(initial); setErr({}); }, [initial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.name?.trim()) e.name = 'Name is required';
    setErr(e);
    return !Object.keys(e).length;
  };

  const iconKeys   = isAmenity ? AMENITY_ICON_KEYS : INCLUSION_ICON_KEYS;
  const categories = isAmenity ? AMENITY_CATEGORIES : INCLUSION_CATEGORIES;

  return (
    <div className="aim-item-form">
      <p className="aim-form-title">
        {form.id
          ? `Edit ${isAmenity ? 'Amenity' : 'Inclusion'}`
          : `New ${isAmenity ? 'Amenity' : 'Inclusion'}`}
      </p>

      {/* Name */}
      <div className="aim-field">
        <label className="aim-label">Name <span className="aim-required">*</span></label>
        <input
          className={`aim-input${err.name ? ' aim-input--error' : ''}`}
          placeholder={isAmenity ? 'e.g. Air Conditioning' : 'e.g. Complimentary Breakfast'}
          value={form.name || ''}
          onChange={(e) => set('name', e.target.value)}
        />
        {err.name && <span className="aim-error">{err.name}</span>}
      </div>

      {/* Category */}
      <div className="aim-field">
        <label className="aim-label">Category</label>
        <select
          className="aim-select"
          value={form.category || categories[0]}
          onChange={(e) => set('category', e.target.value)}
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Icon picker — Lucide buttons */}
      <div className="aim-field">
        <label className="aim-label">Icon</label>
        <div className="aim-icon-grid">
          {iconKeys.map(key => {
            const Comp = ICON_MAP[key];
            const active = form.icon === key;
            return (
              <button
                key={key}
                type="button"
                title={key}
                className={`aim-icon-btn${active ? ' aim-icon-btn--active' : ''}`}
                onClick={() => set('icon', active ? '' : key)}
              >
                {Comp && <Comp size={18} />}
              </button>
            );
          })}
        </div>
        {/* Selected preview */}
        {form.icon && (
          <div className="aim-icon-preview">
            <IconRenderer name={form.icon} size={16} />
            <span className="aim-icon-preview-label">{form.icon}</span>
            <button
              type="button"
              className="aim-icon-clear"
              onClick={() => set('icon', '')}
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Description (inclusions only) */}
      {!isAmenity && (
        <div className="aim-field">
          <label className="aim-label">
            Description <span className="aim-hint">(optional)</span>
          </label>
          <textarea
            className="aim-textarea"
            rows={2}
            placeholder="Brief description for guests…"
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
      )}

      {/* Highlighted (inclusions only) */}
      {!isAmenity && (
        <label className="aim-check-label">
          <input
            type="checkbox"
            checked={!!form.is_highlighted}
            onChange={(e) => set('is_highlighted', e.target.checked)}
          />
          <span>Highlighted (shown prominently in listings)</span>
        </label>
      )}

      <div className="aim-form-actions">
        <button type="button" className="aim-btn aim-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="aim-btn aim-btn--gold"
          disabled={saving}
          onClick={() => { if (validate()) onSave(form); }}
        >
          {saving
            ? <><span className="aim-spinner" /> Saving…</>
            : <><Check size={13} /> {form.id ? 'Update' : 'Create'}</>
          }
        </button>
      </div>
    </div>
  );
}

/* ── Main Modal ─────────────────────────────────────────────── */
export default function AmenitiesInclusionsModal({
  type = 'amenities',
  items = [],
  onSave,
  onDelete,
  onClose,
}) {
  const isAmenity = type === 'amenities';
  const [editing,   setEditing]   = useState(null);
  const [deleting,  setDeleting]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const categories = isAmenity ? AMENITY_CATEGORIES : INCLUSION_CATEGORIES;

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = catFilter === 'all' || i.category === catFilter;
    return matchSearch && matchCat;
  });

  const grouped = filtered.reduce((acc, i) => {
    const c = i.category || 'Other';
    if (!acc[c]) acc[c] = [];
    acc[c].push(i);
    return acc;
  }, {});

  const handleSave = async (form) => {
    setSaving(true);
    const result = await onSave(form);
    setSaving(false);
    if (result?.success) setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item? It will be removed from all rooms.')) return;
    setDeleting(id);
    await onDelete(id);
    setDeleting(null);
  };

  return (
    <div className="aim-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="aim-modal">

        {/* ── Header ── */}
        <div className="aim-header">
          <div>
            <p className="aim-eyebrow">Room Management</p>
            <h2 className="aim-title">
              {isAmenity
                ? <><Star size={17} style={{ marginRight: 8 }} />Amenities Manager</>
                : <><Package size={17} style={{ marginRight: 8 }} />Inclusions Manager</>
              }
            </h2>
          </div>
          <div className="aim-header-actions">
            <button
              className="aim-add-btn"
              onClick={() => setEditing(isAmenity ? emptyAmenity() : emptyInclusion())}
            >
              <Plus size={14} />
              Add {isAmenity ? 'Amenity' : 'Inclusion'}
            </button>
            <button className="aim-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="aim-body">

          {/* Left: list */}
          <div className="aim-list-col">
            <div className="aim-filters">
              <input
                className="aim-search"
                placeholder={`Search ${isAmenity ? 'amenities' : 'inclusions'}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="aim-cat-select"
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="aim-count">
              {filtered.length} of {items.length} {isAmenity ? 'amenities' : 'inclusions'}
            </div>

            <div className="aim-list">
              {filtered.length === 0 ? (
                <div className="aim-empty">No items found</div>
              ) : (
                Object.entries(grouped).map(([cat, catItems]) => (
                  <div key={cat} className="aim-group">
                    <div className="aim-group-label">{cat}</div>
                    {catItems.map(item => (
                      <div
                        key={item.id}
                        className={`aim-item${editing?.id === item.id ? ' aim-item--active' : ''}`}
                      >
                        <span className="aim-item-icon">
                          <IconRenderer name={item.icon} size={15} />
                        </span>
                        <div className="aim-item-info">
                          <span className="aim-item-name">{item.name}</span>
                          {!isAmenity && item.is_highlighted && (
                            <span className="aim-item-badge">Highlighted</span>
                          )}
                        </div>
                        <div className="aim-item-actions">
                          <button
                            className="aim-action-btn"
                            onClick={() => setEditing({ ...item })}
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="aim-action-btn aim-action-btn--danger"
                            onClick={() => handleDelete(item.id)}
                            disabled={deleting === item.id}
                            title="Delete"
                          >
                            {deleting === item.id
                              ? <span className="aim-spinner" style={{ width: 12, height: 12 }} />
                              : <Trash2 size={13} />
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: form */}
          <div className={`aim-form-col${editing ? ' aim-form-col--open' : ''}`}>
            {editing ? (
              <ItemForm
                type={type}
                initial={editing}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
                saving={saving}
              />
            ) : (
              <div className="aim-form-placeholder">
                {isAmenity ? <Star size={32} /> : <Package size={32} />}
                <p>Select an item to edit,<br />or create a new one.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}