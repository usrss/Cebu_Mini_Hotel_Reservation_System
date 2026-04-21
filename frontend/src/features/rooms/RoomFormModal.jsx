import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  X, Plus, Trash2,
  Calendar, Package, Settings, Info, Percent,
  Star, Check, ExternalLink, ShieldCheck, Image, Upload,
} from 'lucide-react';
import { adminUploadRoomImages, adminDeleteRoomImage, adminGetRoom } from '../../services/roomService';
import './RoomFormModal.css';

/* ─── Constants ─────────────────────────────────────────── */
const ROOM_TYPES   = ['standard','deluxe','suite','family'];
const BED_TYPES    = ['single','double','queen','king','twin'];
const VIEW_TYPES   = ['none','garden','pool','city','sea','mountain'];

const PRIORITY_LABELS = { 1:'Low', 2:'Normal', 3:'High', 4:'Peak' };
const PRIORITY_COLORS = { 1:'#6b7280', 2:'#3b82f6', 3:'#f59e0b', 4:'#ef4444' };

const TABS = [
  { key:'basic',     label:'Basic Info',      icon:<Info size={14}/> },
  { key:'pricing',   label:'Pricing',         icon:<span style={{ fontSize: 13, fontWeight: 700 }}>₱</span> },
  { key:'seasonal',  label:'Seasonal Prices', icon:<Calendar size={14}/> },
  { key:'amenities', label:'Amenities',       icon:<Star size={14}/> },
  { key:'inclusions',label:'Inclusions',      icon:<Package size={14}/> },
  { key:'images',    label:'Images',          icon:<Image size={14}/> },
  { key:'policy',    label:'Policy',          icon:<Settings size={14}/> },
];

/* ─── Helpers ────────────────────────────────────────────── */
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const emptyRoom = () => ({
  room_number: '', room_type: 'standard', floor: 1,
  bed_type: 'double', view_type: 'none',
  capacity: 2, max_adults: 2, max_children: 0,
  price_per_night: '', discount_percentage: 0,
  size_sqm: '', description: '',
  cancellation_policy: '',
  is_featured: false, is_active: true,
});

const emptySeasonalRow = () => ({
  _id: Date.now() + Math.random(),
  name: '', start_date: '', end_date: '',
  price_per_night: '', priority: 2,
  is_weekend_only: false, is_active: true,
});

/* ─── Fetch hotel settings cancellation tiers ────────────── */
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

async function fetchCancellationTiers() {
  try {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/rooms/hotel/settings/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.cancellation_tiers) && data.cancellation_tiers.length > 0
      ? data.cancellation_tiers
      : null;
  } catch {
    return null;
  }
}

/* ─── Sub-components ─────────────────────────────────────── */
function TabBtn({ tab, active, onClick }) {
  return (
    <button
      className={`rfm-tab${active ? ' rfm-tab--active' : ''}`}
      onClick={() => onClick(tab.key)}
      type="button"
    >
      {tab.icon}
      <span>{tab.label}</span>
    </button>
  );
}

function Field({ label, children, required, hint }) {
  return (
    <div className="rfm-field">
      <label className="rfm-label">
        {label}{required && <span className="rfm-required">*</span>}
        {hint && <span className="rfm-hint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ className = '', ...props }) {
  return <input className={`rfm-input ${className}`} {...props} />;
}

function Select({ className = '', children, ...props }) {
  return (
    <select className={`rfm-select ${className}`} {...props}>
      {children}
    </select>
  );
}

/* ─── SeasonalRow ────────────────────────────────────────── */
function SeasonalRow({ row, onChange, onRemove }) {
  return (
    <div className="rfm-seasonal-row">
      <div className="rfm-seasonal-main">
        <Input
          placeholder="Season name (e.g. Christmas Peak)"
          value={row.name}
          onChange={(e) => onChange({ ...row, name: e.target.value })}
          style={{ flex: 2 }}
        />
        <Input
          type="date"
          value={row.start_date}
          onChange={(e) => onChange({ ...row, start_date: e.target.value })}
          style={{ flex: 1 }}
        />
        <span className="rfm-to">to</span>
        <Input
          type="date"
          value={row.end_date}
          onChange={(e) => onChange({ ...row, end_date: e.target.value })}
          style={{ flex: 1 }}
        />
      </div>
      <div className="rfm-seasonal-sub">
        <div className="rfm-input-prefix-wrap" style={{ flex: 1 }}>
          <span className="rfm-input-prefix">₱</span>
          <Input
            type="number"
            placeholder="Price/night"
            value={row.price_per_night}
            onChange={(e) => onChange({ ...row, price_per_night: e.target.value })}
            style={{ paddingLeft: 28 }}
          />
        </div>
        <Select
          value={row.priority}
          onChange={(e) => onChange({ ...row, priority: Number(e.target.value) })}
          style={{ flex: 1 }}
        >
          {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l} Priority</option>
          ))}
        </Select>
        <label className="rfm-check-label">
          <input type="checkbox" checked={row.is_weekend_only}
            onChange={(e) => onChange({ ...row, is_weekend_only: e.target.checked })} />
          <span>Weekend only</span>
        </label>
        <label className="rfm-check-label">
          <input type="checkbox" checked={row.is_active}
            onChange={(e) => onChange({ ...row, is_active: e.target.checked })} />
          <span>Active</span>
        </label>
        <button type="button" className="rfm-icon-btn rfm-icon-btn--danger" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="rfm-seasonal-priority-bar"
        style={{ background: PRIORITY_COLORS[row.priority] }} />
    </div>
  );
}

/* ─── AmenityPicker ──────────────────────────────────────── */
function AmenityPicker({ available, selected, onChange }) {
  const [search, setSearch] = useState('');
  const filtered = available.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );
  const byCategory = filtered.reduce((acc, a) => {
    const cat = a.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});
  const toggle = (id) => {
    onChange(selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id]
    );
  };
  return (
    <div className="rfm-picker">
      <input
        className="rfm-picker-search"
        placeholder="Search amenities…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="rfm-picker-body">
        {Object.keys(byCategory).length === 0
          ? <p className="rfm-picker-empty">No amenities found</p>
          : Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat} className="rfm-picker-group">
                <div className="rfm-picker-group-label">{cat}</div>
                <div className="rfm-picker-chips">
                  {items.map(a => {
                    const on = selected.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={`rfm-chip${on ? ' rfm-chip--on' : ''}`}
                        onClick={() => toggle(a.id)}
                      >
                        {a.icon && <span className="rfm-chip-icon">{a.icon}</span>}
                        <span>{a.name}</span>
                        {on && <Check size={11} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
        }
      </div>
      {selected.length > 0 && (
        <div className="rfm-picker-footer">
          {selected.length} amenit{selected.length !== 1 ? 'ies' : 'y'} selected
        </div>
      )}
    </div>
  );
}

/* ─── InclusionPicker ────────────────────────────────────── */
function InclusionPicker({ available, selected, onChange }) {
  const [search, setSearch] = useState('');
  const filtered = available.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );
  const byCategory = filtered.reduce((acc, i) => {
    const cat = i.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(i);
    return acc;
  }, {});
  const isSelected = (id) => selected.some(s => s.inclusion_id === id);
  const toggle = (id) => {
    if (isSelected(id)) {
      onChange(selected.filter(s => s.inclusion_id !== id));
    } else {
      onChange([...selected, { inclusion_id: id, notes: '' }]);
    }
  };
  const updateNotes = (id, notes) => {
    onChange(selected.map(s => s.inclusion_id === id ? { ...s, notes } : s));
  };
  return (
    <div className="rfm-picker">
      <input
        className="rfm-picker-search"
        placeholder="Search inclusions…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="rfm-picker-body">
        {Object.keys(byCategory).length === 0
          ? <p className="rfm-picker-empty">No inclusions found</p>
          : Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat} className="rfm-picker-group">
                <div className="rfm-picker-group-label">{cat}</div>
                <div className="rfm-picker-chips">
                  {items.map(i => {
                    const on = isSelected(i.id);
                    const sel = selected.find(s => s.inclusion_id === i.id);
                    return (
                      <div key={i.id} className="rfm-inclusion-item">
                        <button
                          type="button"
                          className={`rfm-chip${on ? ' rfm-chip--on' : ''}`}
                          onClick={() => toggle(i.id)}
                        >
                          {i.icon && <span className="rfm-chip-icon">{i.icon}</span>}
                          <span>{i.name}</span>
                          {on && <Check size={11} />}
                        </button>
                        {on && (
                          <input
                            className="rfm-inclusion-notes"
                            placeholder="Optional notes…"
                            value={sel?.notes || ''}
                            onChange={(e) => updateNotes(i.id, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
        }
      </div>
      {selected.length > 0 && (
        <div className="rfm-picker-footer">
          {selected.length} inclusion{selected.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}

/* ─── ImagesTab ──────────────────────────────────────────────
   For NEW rooms  → queues files locally; uploaded after room is created.
   For EDIT rooms → immediately calls the API to upload / delete.
─────────────────────────────────────────────────────────────── */
function ImagesTab({ roomId, existingImages, queuedFiles, onQueueChange, onExistingChange, onUploadComplete }) {
  const fileRef   = useRef();
  const [deletingId, setDeletingId] = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [imgError,   setImgError]   = useState(null);

  const isNew = !roomId;

  /* ── Select files ── */
  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (isNew) {
      // Queue them with local preview URLs — uploaded after room is saved
      const items = files.map(f => ({ file: f, previewUrl: URL.createObjectURL(f) }));
      onQueueChange(prev => [...prev, ...items]);
    } else {
      // Edit mode — upload immediately
      handleUploadNow(files);
    }
    // Reset input so same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── Immediate upload (edit mode) ── */
  const handleUploadNow = async (files) => {
    setUploading(true);
    setImgError(null);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('images', f));
      const res = await adminUploadRoomImages(roomId, formData);
      const uploaded = Array.isArray(res.data) ? res.data : [];
      onExistingChange(prev => [...prev, ...uploaded]);
      // Notify parent so it can re-fetch the room list and show images immediately
      onUploadComplete?.();
    } catch {
      setImgError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  /* ── Remove queued (new room) ── */
  const removeQueued = (index) => {
    onQueueChange(prev => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  /* ── Delete existing (edit room) ── */
  const handleDelete = async (imageId) => {
    if (!window.confirm('Delete this image?')) return;
    setDeletingId(imageId);
    setImgError(null);
    try {
      await adminDeleteRoomImage(roomId, imageId);
      onExistingChange(prev => prev.filter(img => img.id !== imageId));
      // Notify parent so the room list re-fetches and reflects the deletion
      onUploadComplete?.();
    } catch {
      setImgError('Failed to delete image. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rfm-section">

      {isNew && (
        <div className="rfm-section-intro">
          <p>Add photos now or skip — you can always add more after the room is created.</p>
        </div>
      )}

      {imgError && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(220,38,38,0.07)',
          border: '1.5px solid rgba(220,38,38,0.2)',
          borderRadius: 10,
          color: '#DC2626',
          fontSize: 12,
          fontWeight: 500,
        }}>
          {imgError}
        </div>
      )}

      {/* Upload zone */}
      <div
        className="rfm-img-upload-zone"
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
      >
        {uploading ? (
          <span className="rfm-spinner" style={{ width: 20, height: 20 }} />
        ) : (
          <Upload size={22} className="rfm-img-upload-icon" />
        )}
        <p className="rfm-img-upload-title">
          {uploading ? 'Uploading…' : 'Click to select images'}
        </p>
        <p className="rfm-img-upload-sub">JPG, PNG, WebP · Multiple files supported</p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
        disabled={uploading}
      />

      {/* Queued previews (new room only) */}
      {isNew && queuedFiles.length > 0 && (
        <div>
          <p className="rfm-img-section-label">
            {queuedFiles.length} file{queuedFiles.length !== 1 ? 's' : ''} ready to upload after saving
          </p>
          <div className="rfm-img-grid">
            {queuedFiles.map((item, i) => (
              <div key={i} className="rfm-img-card">
                <img src={item.previewUrl} alt={item.file.name} className="rfm-img-thumb" />
                <button
                  type="button"
                  className="rfm-img-delete-btn"
                  onClick={() => removeQueued(i)}
                  title="Remove"
                >
                  <X size={11} />
                </button>
                <div className="rfm-img-caption">{item.file.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing images (edit mode) */}
      {!isNew && (
        <div>
          <p className="rfm-img-section-label">
            {existingImages.length} photo{existingImages.length !== 1 ? 's' : ''}
          </p>
          {existingImages.length === 0 ? (
            <div className="rfm-seasonal-empty">No photos yet. Upload some above.</div>
          ) : (
            <div className="rfm-img-grid">
              {existingImages.map(img => (
                <div key={img.id} className="rfm-img-card">
                  <img
                    src={img.image_url ?? img.image}
                    alt={img.caption || 'Room photo'}
                    className="rfm-img-thumb"
                  />
                  {img.is_primary && (
                    <span className="rfm-img-primary-badge">Primary</span>
                  )}
                  <button
                    type="button"
                    className="rfm-img-delete-btn"
                    onClick={() => handleDelete(img.id)}
                    disabled={deletingId === img.id}
                    title="Delete image"
                  >
                    {deletingId === img.id
                      ? <span className="rfm-spinner" style={{ width: 10, height: 10, borderTopColor: '#DC2626' }} />
                      : <Trash2 size={11} />
                    }
                  </button>
                  {img.caption && <div className="rfm-img-caption">{img.caption}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── PolicyTab ──────────────────────────────────────────── */
function PolicyTab() {
  const [tiers,  setTiers]  = useState(null);
  const [error,  setError]  = useState(false);

  useEffect(() => {
    fetchCancellationTiers().then(t => {
      if (t) setTiers(t);
      else   setError(true);
    });
  }, []);

  const sorted = tiers
    ? [...tiers].sort((a, b) => Number(b.hours_before) - Number(a.hours_before))
    : [];

  return (
    <div className="rfm-section">
      <div className="rfm-policy-info-banner">
        <ShieldCheck size={16} className="rfm-policy-info-icon" />
        <div>
          <p className="rfm-policy-info-title">Hotel-wide Cancellation Policy</p>
          <p className="rfm-policy-info-body">
            The cancellation policy is configured globally in{' '}
            <strong>Hotel Settings → Cancellation &amp; Refund Tiers</strong>.
            All rooms follow the same policy — the refund engine reads these
            tiers automatically. To change the policy, update it in Hotel Settings.
          </p>
        </div>
      </div>

      <div className="rfm-policy-tiers-wrap">
        <div className="rfm-policy-tiers-label">
          Live policy — what guests see during booking
        </div>

        {tiers === null && !error && (
          <div className="rfm-policy-loading">
            <span className="rfm-spinner" /> Loading policy…
          </div>
        )}

        {error && (
          <div className="rfm-policy-error">
            <Info size={13} /> Could not load policy tiers. Check Hotel Settings.
          </div>
        )}

        {tiers && sorted.map((tier, i) => {
          const isCatchAll = Number(tier.hours_before) === 0;
          const pct        = Number(tier.refund_pct);
          const color      = pct >= 80 ? '#059669' : pct >= 40 ? '#d97706' : '#52515E';
          const bg         = pct >= 80 ? 'rgba(5,150,105,0.08)' : pct >= 40 ? 'rgba(217,119,6,0.08)' : 'rgba(1,0,13,0.04)';
          const border     = pct >= 80 ? 'rgba(5,150,105,0.22)' : pct >= 40 ? 'rgba(217,119,6,0.22)' : '#E4E6ED';

          return (
            <div key={i} className="rfm-policy-tier-row">
              <div className="rfm-policy-tier-badge" style={{ background: bg, color, border: `1.5px solid ${border}` }}>
                {pct}%
              </div>
              <div className="rfm-policy-tier-text">
                <span className="rfm-policy-tier-condition">
                  {isCatchAll ? 'Same day / after check-in' : `≥ ${tier.hours_before}h before check-in`}
                </span>
                {tier.label && <span className="rfm-policy-tier-label">{tier.label}</span>}
              </div>
              <div className="rfm-policy-tier-refund">
                {pct === 0 ? 'No refund' : `${pct}% refund`}
              </div>
            </div>
          );
        })}
      </div>

      <Link to="/admin/hotel-settings" className="rfm-policy-settings-link">
        <ExternalLink size={13} />
        Edit in Hotel Settings
      </Link>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN MODAL
   ═══════════════════════════════════════════════════════════ */
export default function RoomFormModal({
  room,
  onSave,
  onClose,
  onAfterSave,
  submitting,
  availableAmenities  = [],
  availableInclusions = [],
}) {
  const isEdit = Boolean(room);
  const [tab,    setTab]    = useState('basic');
  const [form,   setForm]   = useState(emptyRoom);
  const [errors, setErrors] = useState({});

  const [seasonal,       setSeasonal]       = useState([]);
  const [amenityIds,     setAmenityIds]     = useState([]);
  const [inclusions,     setInclusions]     = useState([]);

  // Images state
  // existingImages = images already on the server (edit mode)
  // queuedFiles    = files staged for upload (create mode, uploaded after save)
  const [existingImages, setExistingImages] = useState([]);
  const [queuedFiles,    setQueuedFiles]    = useState([]);

  /* seed form */
  useEffect(() => {
    if (room) {
      setForm({
        room_number:         room.room_number         || '',
        room_type:           room.room_type           || 'standard',
        floor:               room.floor               || 1,
        bed_type:            room.bed_type            || 'double',
        view_type:           room.view_type           || 'none',
        capacity:            room.capacity            || 2,
        max_adults:          room.max_adults          || 2,
        max_children:        room.max_children        || 0,
        price_per_night:     room.price_per_night     || '',
        discount_percentage: room.discount_percentage || 0,
        size_sqm:            room.size_sqm            || '',
        description:         room.description         || '',
        cancellation_policy: room.cancellation_policy || '',
        is_featured:         room.is_featured         ?? false,
        is_active:           room.is_active           ?? true,
      });
      setSeasonal((room.seasonal_prices || []).map(s => ({
        ...s, _id: s.id || (Date.now() + Math.random()),
      })));
      setAmenityIds((room.amenities || []).map(a => a.id ?? a));
      setInclusions((room.inclusions || []).map(i => ({
        inclusion_id: i.inclusion?.id ?? i.inclusion_id ?? i,
        notes: i.notes || '',
      })));
      setExistingImages(room.images || []);
    }
  }, [room]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const discountedPrice = form.price_per_night && form.discount_percentage > 0
    ? (Number(form.price_per_night) * (1 - form.discount_percentage / 100)).toFixed(2)
    : null;

  const validate = () => {
    const e = {};
    if (!form.room_number.trim()) e.room_number = 'Room number is required';
    if (!form.price_per_night)    e.price_per_night = 'Price is required';
    if (form.discount_percentage < 0 || form.discount_percentage > 100)
      e.discount_percentage = '0–100 only';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) { setTab('basic'); return; }

    const payload = {
      ...form,
      seasonal_prices: seasonal.map(({ _id, ...rest }) => rest),
      amenity_ids: amenityIds,
      inclusion_ids: inclusions.map(i => i.inclusion_id),
      inclusion_notes: inclusions.reduce((acc, i) => {
        acc[i.inclusion_id] = i.notes; return acc;
      }, {}),
    };

    const result = await onSave(payload);

    // After a successful CREATE, upload any queued images then trigger a
    // final re-fetch so the room list reflects the uploaded images immediately
    // without requiring a page reload.
    if (result?.success && !isEdit && queuedFiles.length > 0) {
      const newRoomId = result.data?.id;
      if (newRoomId) {
        const formData = new FormData();
        queuedFiles.forEach(item => formData.append('images', item.file));
        try {
          await adminUploadRoomImages(newRoomId, formData);
        } catch {
          // Images failed silently — room was still created.
          // Admin can add images via the image modal later.
        }
        // Revoke blob URLs to avoid memory leaks
        queuedFiles.forEach(item => URL.revokeObjectURL(item.previewUrl));
        // Re-fetch the room list so uploaded images appear without a page reload
        onAfterSave?.();
      }
    }
  };

  return (
    <div className="rfm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rfm-modal">

        {/* ── Header ── */}
        <div className="rfm-header">
          <div>
            <p className="rfm-eyebrow">{isEdit ? 'Edit Room' : 'New Room'}</p>
            <h2 className="rfm-title">
              {isEdit ? `Room #${room.room_number}` : 'Add a Room'}
            </h2>
          </div>
          <button className="rfm-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="rfm-tabs">
          {TABS.map(t => (
            <TabBtn key={t.key} tab={t} active={tab === t.key} onClick={setTab} />
          ))}
        </div>

        {/* ── Content ── */}
        <form className="rfm-body" onSubmit={handleSubmit}>

          {/* BASIC */}
          {tab === 'basic' && (
            <div className="rfm-section">
              <div className="rfm-grid-2">
                <Field label="Room Number" required>
                  <Input
                    placeholder="e.g. 101"
                    value={form.room_number}
                    onChange={(e) => set('room_number', e.target.value)}
                  />
                  {errors.room_number && <span className="rfm-error">{errors.room_number}</span>}
                </Field>
                <Field label="Floor">
                  <Input type="number" min={1} value={form.floor}
                    onChange={(e) => set('floor', Number(e.target.value))} />
                </Field>
              </div>
              <div className="rfm-grid-3">
                <Field label="Room Type" required>
                  <Select value={form.room_type} onChange={(e) => set('room_type', e.target.value)}>
                    {ROOM_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
                  </Select>
                </Field>
                <Field label="Bed Type">
                  <Select value={form.bed_type} onChange={(e) => set('bed_type', e.target.value)}>
                    {BED_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
                  </Select>
                </Field>
                <Field label="View Type">
                  <Select value={form.view_type} onChange={(e) => set('view_type', e.target.value)}>
                    {VIEW_TYPES.map(t => (
                      <option key={t} value={t}>{t === 'none' ? 'No View' : cap(t)}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="rfm-grid-3">
                <Field label="Total Capacity">
                  <Input type="number" min={1} value={form.capacity}
                    onChange={(e) => set('capacity', Number(e.target.value))} />
                </Field>
                <Field label="Max Adults">
                  <Input type="number" min={1} value={form.max_adults}
                    onChange={(e) => set('max_adults', Number(e.target.value))} />
                </Field>
                <Field label="Max Children">
                  <Input type="number" min={0} value={form.max_children}
                    onChange={(e) => set('max_children', Number(e.target.value))} />
                </Field>
              </div>
              <Field label="Size (sqm)" hint="optional">
                <Input type="number" min={0} placeholder="e.g. 28"
                  value={form.size_sqm}
                  onChange={(e) => set('size_sqm', e.target.value)} />
              </Field>
              <Field label="Description" hint="optional">
                <textarea
                  className="rfm-textarea" rows={3}
                  placeholder="Brief description shown to guests…"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
              <div className="rfm-toggles">
                <label className="rfm-toggle-label">
                  <input type="checkbox" checked={form.is_featured}
                    onChange={(e) => set('is_featured', e.target.checked)} />
                  <span>Featured Room</span>
                </label>
                <label className="rfm-toggle-label">
                  <input type="checkbox" checked={form.is_active}
                    onChange={(e) => set('is_active', e.target.checked)} />
                  <span>Active (visible to guests)</span>
                </label>
              </div>
            </div>
          )}

          {/* PRICING */}
          {tab === 'pricing' && (
            <div className="rfm-section">
              <Field label="Base Price per Night" required>
                <div className="rfm-input-prefix-wrap">
                  <span className="rfm-input-prefix">₱</span>
                  <Input
                    type="number" min={0} placeholder="0.00"
                    value={form.price_per_night}
                    onChange={(e) => set('price_per_night', e.target.value)}
                    style={{ paddingLeft: 28 }}
                  />
                </div>
                {errors.price_per_night && <span className="rfm-error">{errors.price_per_night}</span>}
              </Field>
              <Field label="Discount Percentage" hint="0 = no discount">
                <div className="rfm-input-suffix-wrap">
                  <Input
                    type="number" min={0} max={100} placeholder="0"
                    value={form.discount_percentage}
                    onChange={(e) => set('discount_percentage', Number(e.target.value))}
                    style={{ paddingRight: 36 }}
                  />
                  <span className="rfm-input-suffix"><Percent size={13} /></span>
                </div>
                {errors.discount_percentage && <span className="rfm-error">{errors.discount_percentage}</span>}
              </Field>
              {discountedPrice && (
                <div className="rfm-price-preview">
                  <div className="rfm-price-preview-label">Effective Discounted Price</div>
                  <div className="rfm-price-preview-row">
                    <span className="rfm-price-original">₱{Number(form.price_per_night).toLocaleString()}</span>
                    <span className="rfm-price-arrow">→</span>
                    <span className="rfm-price-discounted">₱{Number(discountedPrice).toLocaleString()}</span>
                    <span className="rfm-price-badge">-{form.discount_percentage}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SEASONAL */}
          {tab === 'seasonal' && (
            <div className="rfm-section">
              <div className="rfm-section-intro">
                <p>Seasonal pricing overrides the base price for specific date ranges. Higher-priority rules take precedence.</p>
              </div>
              <div className="rfm-seasonal-list">
                {seasonal.length === 0 && (
                  <div className="rfm-seasonal-empty">No seasonal pricing rules yet. Add one below.</div>
                )}
                {seasonal.map((row) => (
                  <SeasonalRow
                    key={row._id}
                    row={row}
                    onChange={(updated) =>
                      setSeasonal(s => s.map(r => r._id === row._id ? updated : r))
                    }
                    onRemove={() =>
                      setSeasonal(s => s.filter(r => r._id !== row._id))
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                className="rfm-add-row-btn"
                onClick={() => setSeasonal(s => [...s, emptySeasonalRow()])}
              >
                <Plus size={14} /> Add Seasonal Rule
              </button>
            </div>
          )}

          {/* AMENITIES */}
          {tab === 'amenities' && (
            <div className="rfm-section">
              <div className="rfm-section-intro">
                <p>Select amenities included in this room. These appear on the room listing.</p>
              </div>
              {availableAmenities.length === 0 ? (
                <div className="rfm-picker-empty-state">
                  No amenities configured. Add them under
                  <strong> Rooms → Amenities Manager</strong>.
                </div>
              ) : (
                <AmenityPicker
                  available={availableAmenities}
                  selected={amenityIds}
                  onChange={setAmenityIds}
                />
              )}
            </div>
          )}

          {/* INCLUSIONS */}
          {tab === 'inclusions' && (
            <div className="rfm-section">
              <div className="rfm-section-intro">
                <p>Inclusions are items/services bundled with the room stay (e.g. breakfast, airport transfer).</p>
              </div>
              {availableInclusions.length === 0 ? (
                <div className="rfm-picker-empty-state">
                  No inclusions configured. Add them under
                  <strong> Rooms → Inclusions Manager</strong>.
                </div>
              ) : (
                <InclusionPicker
                  available={availableInclusions}
                  selected={inclusions}
                  onChange={setInclusions}
                />
              )}
            </div>
          )}

          {/* IMAGES */}
          {tab === 'images' && (
            <ImagesTab
              roomId={isEdit ? room.id : null}
              existingImages={existingImages}
              queuedFiles={queuedFiles}
              onQueueChange={setQueuedFiles}
              onExistingChange={setExistingImages}
              onUploadComplete={onAfterSave}
            />
          )}

          {/* POLICY */}
          {tab === 'policy' && <PolicyTab />}

          {/* Footer */}
          <div className="rfm-footer">
            <button type="button" className="rfm-btn rfm-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="rfm-btn rfm-btn--gold" disabled={submitting}>
              {submitting
                ? <><span className="rfm-spinner" /> Saving…</>
                : <>{isEdit ? 'Update Room' : 'Create Room'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}