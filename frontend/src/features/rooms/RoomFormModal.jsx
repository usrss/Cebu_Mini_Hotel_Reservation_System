import { useState, useEffect, useRef } from 'react';
import { X, Camera } from 'lucide-react';
import './RoomFormModal.css';

const ROOM_TYPES = ['standard', 'deluxe', 'suite', 'family', 'penthouse'];
const BED_TYPES  = ['single', 'double', 'queen', 'king', 'twin'];
const STATUSES   = ['available', 'occupied', 'maintenance', 'reserved', 'cleaning'];
const VIEW_TYPES = ['none', 'city', 'sea', 'ocean', 'pool', 'garden', 'mountain', 'courtyard'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

const EMPTY = {
  room_number: '', room_type: 'standard', floor: 1,
  bed_type: 'double', view_type: 'none',
  capacity: 2, max_adults: 2, max_children: 0,
  price_per_night: '', discount_percentage: 0,
  size_sqm: '', status: 'available',
  is_active: true, is_featured: false,
  description: '', cancellation_policy: '',
  checkin_time: '', checkout_time: '',
  panorama_image: null,  // File object or null
};

export default function RoomFormModal({ room, onSave, onClose, submitting }) {
  const isEdit  = !!room;
  const [form,   setForm]   = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [tab,    setTab]    = useState('basic');
  const [panoramaPreview, setPanoramaPreview] = useState(null);
  const panoramaRef = useRef();

  useEffect(() => {
    if (room) {
      setForm({
        room_number:         room.room_number         ?? '',
        room_type:           room.room_type           ?? 'standard',
        floor:               room.floor               ?? 1,
        bed_type:            room.bed_type            ?? 'double',
        view_type:           room.view_type           ?? 'none',
        capacity:            room.capacity            ?? 2,
        max_adults:          room.max_adults          ?? 2,
        max_children:        room.max_children        ?? 0,
        price_per_night:     room.price_per_night     ?? '',
        discount_percentage: room.discount_percentage ?? 0,
        size_sqm:            room.size_sqm            ?? '',
        status:              room.status              ?? 'available',
        is_active:           room.is_active           ?? true,
        is_featured:         room.is_featured         ?? false,
        description:         room.description         ?? '',
        cancellation_policy: room.cancellation_policy ?? '',
        checkin_time:        room.checkin_time        ?? '',
        checkout_time:       room.checkout_time       ?? '',
        panorama_image:      null, // never pre-fill File input
      });
      setPanoramaPreview(room.panorama_image_url ?? null);
    } else {
      setForm(EMPTY);
      setPanoramaPreview(null);
    }
  }, [room]);

  const set = (key, val) => {
    setForm(p => ({ ...p, [key]: val }));
    setErrors(p => ({ ...p, [key]: undefined }));
  };

  const handlePanoramaFile = (e) => {
    const file = e.target.files[0] ?? null;
    set('panorama_image', file);
    if (file) {
      setPanoramaPreview(URL.createObjectURL(file));
    } else {
      setPanoramaPreview(room?.panorama_image_url ?? null);
    }
  };

  const clearPanorama = () => {
    set('panorama_image', null);
    setPanoramaPreview(null);
    if (panoramaRef.current) panoramaRef.current.value = '';
  };

  const handleSubmit = async () => {
    setErrors({});
    const payload = {
      ...form,
      floor:               Number(form.floor),
      capacity:            Number(form.capacity),
      max_adults:          Number(form.max_adults),
      max_children:        Number(form.max_children),
      price_per_night:     parseFloat(form.price_per_night),
      discount_percentage: parseFloat(form.discount_percentage) || 0,
      size_sqm:            form.size_sqm ? parseFloat(form.size_sqm) : null,
      checkin_time:        form.checkin_time  || null,
      checkout_time:       form.checkout_time || null,
      // panorama_image: keep as File or null — roomService handles multipart
    };
    // Remove null panorama so it doesn't overwrite existing on edit
    if (payload.panorama_image === null) delete payload.panorama_image;

    const result = await onSave(payload);
    if (!result.success) setErrors(result.errors || {});
  };

  const inp  = (err) => `rfm-input${err  ? ' rfm-input--error'  : ''}`;
  const sel  = (err) => `rfm-select${err ? ' rfm-select--error' : ''}`;
  const txta = (err) => `rfm-textarea${err ? ' rfm-textarea--error' : ''}`;

  const TABS = [
    { id: 'basic',    label: 'Basic Info' },
    { id: 'pricing',  label: 'Pricing & Capacity' },
    { id: 'policies', label: 'Policies & Settings' },
  ];

  return (
    <div className="rfm-overlay">
      <div className="rfm-modal">

        {/* Header */}
        <div className="rfm-header">
          <h2 className="rfm-title">
            {isEdit ? `Edit Room ${room.room_number}` : 'Add New Room'}
          </h2>
          <button className="rfm-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="rfm-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`rfm-tab${tab === t.id ? ' rfm-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="rfm-body">

          {/* ── BASIC INFO ── */}
          {tab === 'basic' && (
            <>
              <div className="rfm-grid-2">
                <Field label="Room Number" error={errors.room_number} required>
                  <input className={inp(errors.room_number)} type="text"
                    value={form.room_number} onChange={e => set('room_number', e.target.value)}
                    placeholder="e.g., 101" />
                </Field>
                <Field label="Floor" error={errors.floor}>
                  <input className={inp(errors.floor)} type="number" min={1}
                    value={form.floor} onChange={e => set('floor', e.target.value)} />
                </Field>
              </div>

              <div className="rfm-grid-2">
                <Field label="Room Type" error={errors.room_type}>
                  <select className={sel(errors.room_type)} value={form.room_type}
                    onChange={e => set('room_type', e.target.value)}>
                    {ROOM_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
                  </select>
                </Field>
                <Field label="Bed Type" error={errors.bed_type}>
                  <select className={sel(errors.bed_type)} value={form.bed_type}
                    onChange={e => set('bed_type', e.target.value)}>
                    {BED_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
                  </select>
                </Field>
              </div>

              <div className="rfm-grid-2">
                <Field label="View Type" error={errors.view_type}>
                  <select className={sel(errors.view_type)} value={form.view_type}
                    onChange={e => set('view_type', e.target.value)}>
                    {VIEW_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
                  </select>
                </Field>
                <Field label="Room Size (m²)" error={errors.size_sqm}>
                  <input className={inp(errors.size_sqm)} type="number" min={0} step="0.1"
                    placeholder="e.g., 32.5" value={form.size_sqm}
                    onChange={e => set('size_sqm', e.target.value)} />
                </Field>
              </div>

              <Field label="Status" error={errors.status}>
                <select className={sel(errors.status)} value={form.status}
                  onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{cap(s)}</option>)}
                </select>
              </Field>

              <Field label="Description" error={errors.description}>
                <textarea className={txta(errors.description)} rows={3}
                  value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Describe the room features and amenities..." />
              </Field>

              {/* 360° Panorama */}
              <Field label="360° Panorama Image" error={errors.panorama_image}>
                <div className="rfm-panorama-wrap">
                  {panoramaPreview ? (
                    <div className="rfm-panorama-preview">
                      <img src={panoramaPreview} alt="360° panorama preview" className="rfm-panorama-img" />
                      <div className="rfm-panorama-overlay">
                        <Camera size={14} />
                        <span>360° Preview</span>
                      </div>
                      <button
                        type="button"
                        className="rfm-panorama-remove"
                        onClick={clearPanorama}
                        title="Remove panorama"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="rfm-panorama-empty"
                      onClick={() => panoramaRef.current?.click()}
                    >
                      <Camera size={20} />
                      <span>Upload equirectangular panorama (2:1 ratio)</span>
                    </div>
                  )}
                  <input
                    ref={panoramaRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handlePanoramaFile}
                  />
                  {!panoramaPreview && (
                    <button
                      type="button"
                      className="rfm-panorama-btn"
                      onClick={() => panoramaRef.current?.click()}
                    >
                      Choose File
                    </button>
                  )}
                  {panoramaPreview && !form.panorama_image && (
                    <p className="rfm-panorama-note">
                      Current panorama — upload a new file to replace it
                    </p>
                  )}
                  {form.panorama_image && (
                    <p className="rfm-panorama-note rfm-panorama-note--new">
                      ✓ New file selected: {form.panorama_image.name}
                    </p>
                  )}
                </div>
              </Field>

              <div className="rfm-grid-2">
                <Toggle label="Active Room"
                  sub={form.is_active ? 'Visible to guests' : 'Hidden from guests'}
                  value={form.is_active} onChange={v => set('is_active', v)} />
                <Toggle label="Featured Room"
                  sub={form.is_featured ? 'Shown in homepage carousel' : 'Not featured'}
                  value={form.is_featured} onChange={v => set('is_featured', v)} />
              </div>
            </>
          )}

          {/* ── PRICING & CAPACITY ── */}
          {tab === 'pricing' && (
            <>
              <div className="rfm-grid-2">
                <Field label="Price per Night (₱)" error={errors.price_per_night} required>
                  <input className={inp(errors.price_per_night)} type="number" min={0} step="0.01"
                    placeholder="0.00" value={form.price_per_night}
                    onChange={e => set('price_per_night', e.target.value)} />
                </Field>
                <Field label="Discount (%)" error={errors.discount_percentage}>
                  <input className={inp(errors.discount_percentage)} type="number"
                    min={0} max={100} step="0.01" placeholder="0"
                    value={form.discount_percentage}
                    onChange={e => set('discount_percentage', e.target.value)} />
                </Field>
              </div>

              {Number(form.discount_percentage) > 0 && form.price_per_night && (
                <div className="rfm-discount-preview">
                  <span className="rfm-price-original">₱{Number(form.price_per_night).toFixed(2)}</span>
                  <span className="rfm-price-final">
                    ₱{(Number(form.price_per_night) * (1 - Number(form.discount_percentage) / 100)).toFixed(2)}
                  </span>
                  <span className="rfm-price-pct">(-{form.discount_percentage}%)</span>
                </div>
              )}

              <div className="rfm-grid-3">
                <Field label="Total Capacity" error={errors.capacity}>
                  <input className={inp(errors.capacity)} type="number" min={1} max={20}
                    value={form.capacity} onChange={e => set('capacity', e.target.value)} />
                </Field>
                <Field label="Max Adults" error={errors.max_adults}>
                  <input className={inp(errors.max_adults)} type="number" min={1} max={20}
                    value={form.max_adults} onChange={e => set('max_adults', e.target.value)} />
                </Field>
                <Field label="Max Children" error={errors.max_children}>
                  <input className={inp(errors.max_children)} type="number" min={0} max={10}
                    value={form.max_children} onChange={e => set('max_children', e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {/* ── POLICIES ── */}
          {tab === 'policies' && (
            <>
              <div className="rfm-grid-2">
                <Field label="Check-in Time" error={errors.checkin_time}>
                  <input className={inp(errors.checkin_time)} type="time"
                    value={form.checkin_time} onChange={e => set('checkin_time', e.target.value)} />
                </Field>
                <Field label="Check-out Time" error={errors.checkout_time}>
                  <input className={inp(errors.checkout_time)} type="time"
                    value={form.checkout_time} onChange={e => set('checkout_time', e.target.value)} />
                </Field>
              </div>
              <Field label="Cancellation Policy" error={errors.cancellation_policy}>
                <textarea className={txta(errors.cancellation_policy)} rows={4}
                  value={form.cancellation_policy}
                  onChange={e => set('cancellation_policy', e.target.value)}
                  placeholder="e.g., Free cancellation up to 48 hours before check-in..." />
              </Field>
            </>
          )}

          {errors.non_field_errors && (
            <div className="rfm-global-error">{errors.non_field_errors}</div>
          )}
        </div>

        {/* Footer */}
        <div className="rfm-footer">
          <button className="rfm-btn-cancel" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="rfm-btn-save" onClick={handleSubmit} disabled={submitting}>
            {submitting && <div className="rfm-spinner" />}
            {isEdit ? 'Save Changes' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, required, children }) {
  return (
    <div className="rfm-field">
      <label className="rfm-label">
        {label}{required && <span>*</span>}
      </label>
      {children}
      {error && <p className="rfm-error-msg">{Array.isArray(error) ? error[0] : error}</p>}
    </div>
  );
}

function Toggle({ label, sub, value, onChange }) {
  return (
    <div className="rfm-toggle-row">
      <button
        type="button"
        className={`rfm-toggle-btn${value ? ' rfm-toggle-btn--on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span className="rfm-toggle-knob" />
      </button>
      <div className="rfm-toggle-info">
        <span className="rfm-toggle-label">{label}</span>
        <span className="rfm-toggle-sub">{sub}</span>
      </div>
    </div>
  );
}