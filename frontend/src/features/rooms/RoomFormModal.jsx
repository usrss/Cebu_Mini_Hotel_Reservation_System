import { useState, useEffect, useRef } from 'react';
import {
  X, Plus, Trash2, Edit2, ChevronDown, ChevronUp,
  Calendar, Tag, Package, Settings, Info, Percent,
  DollarSign, Star, Check,
} from 'lucide-react';
import './RoomFormModal.css';

/* ─── Constants ─────────────────────────────────────────── */
const ROOM_TYPES   = ['standard','deluxe','suite','family'];
const BED_TYPES    = ['single','double','queen','king','twin'];
const VIEW_TYPES   = ['none','garden','pool','city','sea','mountain'];
const CANCEL_POLICIES = [
  'Free cancellation 48+ hours before check-in (90% refund). 50% refund for cancellations within 48 hours of check-in. No refund for same-day cancellations or no-shows.',
  'Non-refundable. No cancellations allowed.',
  'Partial refund (50%) if cancelled 24 hours before check-in.',
];
const PRIORITY_LABELS = { 1:'Low', 2:'Normal', 3:'High', 4:'Peak' };
const PRIORITY_COLORS = { 1:'#6b7280', 2:'#3b82f6', 3:'#f59e0b', 4:'#ef4444' };

const TABS = [
  { key:'basic',    label:'Basic Info',     icon:<Info size={14}/> },
  { key:'pricing',  label:'Pricing',        icon:<DollarSign size={14}/> },
  { key:'seasonal', label:'Seasonal Prices',icon:<Calendar size={14}/> },
  { key:'amenities',label:'Amenities',      icon:<Star size={14}/> },
  { key:'inclusions',label:'Inclusions',    icon:<Package size={14}/> },
  { key:'policy',   label:'Policy',         icon:<Settings size={14}/> },
];

/* ─── Helpers ────────────────────────────────────────────── */
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const emptyRoom = () => ({
  room_number: '', room_type: 'standard', floor: 1,
  bed_type: 'double', view_type: 'none',
  capacity: 2, max_adults: 2, max_children: 0,
  price_per_night: '', discount_percentage: 0,
  size_sqm: '', description: '',
  cancellation_policy: CANCEL_POLICIES[0],
  is_featured: false, is_active: true,
});
const emptySeasonalRow = () => ({
  _id: Date.now() + Math.random(),
  name: '', start_date: '', end_date: '',
  price_per_night: '', priority: 2,
  is_weekend_only: false, is_active: true,
});

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
  // selected = [{ inclusion_id, notes }]
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

/* ═══════════════════════════════════════════════════════════
   MAIN MODAL
   ═══════════════════════════════════════════════════════════ */
export default function RoomFormModal({
  room,
  onSave,
  onClose,
  submitting,
  availableAmenities = [],   // [{ id, name, icon, category }]
  availableInclusions = [],  // [{ id, name, icon, category }]
}) {
  const isEdit = Boolean(room);
  const [tab, setTab]   = useState('basic');
  const [form, setForm] = useState(emptyRoom);
  const [errors, setErrors] = useState({});

  // Seasonal
  const [seasonal, setSeasonal] = useState([]);
  // Amenities: array of IDs
  const [amenityIds, setAmenityIds] = useState([]);
  // Inclusions: [{ inclusion_id, notes }]
  const [inclusions, setInclusions] = useState([]);

  const [editingPolicy, setEditingPolicy] = useState(false);

  /* seed form from room prop */
  useEffect(() => {
    if (room) {
      setForm({
        room_number: room.room_number || '',
        room_type: room.room_type || 'standard',
        floor: room.floor || 1,
        bed_type: room.bed_type || 'double',
        view_type: room.view_type || 'none',
        capacity: room.capacity || 2,
        max_adults: room.max_adults || 2,
        max_children: room.max_children || 0,
        price_per_night: room.price_per_night || '',
        discount_percentage: room.discount_percentage || 0,
        size_sqm: room.size_sqm || '',
        description: room.description || '',
        cancellation_policy: room.cancellation_policy || CANCEL_POLICIES[0],
        is_featured: room.is_featured ?? false,
        is_active: room.is_active ?? true,
      });
      setSeasonal((room.seasonal_prices || []).map(s => ({
        ...s, _id: s.id || (Date.now() + Math.random()),
      })));
      setAmenityIds((room.amenities || []).map(a => a.id ?? a));
      setInclusions((room.inclusions || []).map(i => ({
        inclusion_id: i.inclusion?.id ?? i.inclusion_id ?? i,
        notes: i.notes || '',
      })));
    }
  }, [room]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const discountedPrice = form.price_per_night && form.discount_percentage > 0
    ? (Number(form.price_per_night) * (1 - form.discount_percentage / 100)).toFixed(2)
    : null;

  /* validation */
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
    await onSave(payload);
  };

  return (
    <div className="rfm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rfm-modal">

        {/* ── Header ──────────────────────────── */}
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

        {/* ── Tabs ────────────────────────────── */}
        <div className="rfm-tabs">
          {TABS.map(t => (
            <TabBtn key={t.key} tab={t} active={tab === t.key} onClick={setTab} />
          ))}
        </div>

        {/* ── Content ─────────────────────────── */}
        <form className="rfm-body" onSubmit={handleSubmit}>

          {/* ── BASIC ─────────────────────────── */}
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
                  <Input
                    type="number" min={1}
                    value={form.floor}
                    onChange={(e) => set('floor', Number(e.target.value))}
                  />
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
                    {VIEW_TYPES.map(t => <option key={t} value={t}>{t === 'none' ? 'No View' : cap(t)}</option>)}
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
                  className="rfm-textarea"
                  rows={3}
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

          {/* ── PRICING ───────────────────────── */}
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

          {/* ── SEASONAL ──────────────────────── */}
          {tab === 'seasonal' && (
            <div className="rfm-section">
              <div className="rfm-section-intro">
                <p>Seasonal pricing overrides the base price for specific date ranges. Higher-priority rules take precedence.</p>
              </div>
              <div className="rfm-seasonal-list">
                {seasonal.length === 0 && (
                  <div className="rfm-seasonal-empty">
                    No seasonal pricing rules yet. Add one below.
                  </div>
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

          {/* ── AMENITIES ─────────────────────── */}
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

          {/* ── INCLUSIONS ────────────────────── */}
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

          {/* ── POLICY ────────────────────────── */}
          {tab === 'policy' && (
            <div className="rfm-section">
              <Field label="Cancellation Policy">
                <div className="rfm-policy-wrap">
                  {!editingPolicy ? (
                    <div className="rfm-policy-display">
                      <p className="rfm-policy-text">{form.cancellation_policy}</p>
                      <button
                        type="button"
                        className="rfm-policy-edit-btn"
                        onClick={() => setEditingPolicy(true)}
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                    </div>
                  ) : (
                    <div className="rfm-policy-editor">
                      <div className="rfm-policy-presets">
                        <p className="rfm-policy-presets-label">Quick presets:</p>
                        {CANCEL_POLICIES.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`rfm-policy-preset${form.cancellation_policy === p ? ' rfm-policy-preset--active' : ''}`}
                            onClick={() => set('cancellation_policy', p)}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="rfm-textarea rfm-textarea--tall"
                        rows={4}
                        placeholder="Custom cancellation policy…"
                        value={form.cancellation_policy}
                        onChange={(e) => set('cancellation_policy', e.target.value)}
                      />
                      <button
                        type="button"
                        className="rfm-policy-done-btn"
                        onClick={() => setEditingPolicy(false)}
                      >
                        <Check size={13} /> Done
                      </button>
                    </div>
                  )}
                </div>
              </Field>
            </div>
          )}

          {/* ── Footer ────────────────────────── */}
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