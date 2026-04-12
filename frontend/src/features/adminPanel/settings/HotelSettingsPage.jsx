/**
 * HotelSettingsPage.jsx
 *
 * Global hotel settings — admin/manager only.
 * Manages:
 *   • Check-in / Check-out times
 *   • Hotel Information (address, phone, email, description)
 *   • Cancellation Tiers — structured tier editor (replaces free-text textarea)
 *   • Legal Links (Terms & Conditions, Privacy Policy URLs)
 *
 * API contract:
 *   GET   /api/rooms/hotel/settings/  → full settings object
 *   PATCH /api/rooms/hotel/settings/  → partial update, returns updated object
 *
 * cancellation_tiers format sent to backend:
 *   [{ hours_before: 48, refund_pct: 90, label: "48+ hours before check-in" }, ...]
 *   Sorted descending by hours_before before saving.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Save, RotateCcw, CheckCircle2, AlertCircle,
  Info, MapPin, Phone, Mail, FileText, Link as LinkIcon,
  Building2, ShieldCheck, Plus, Trash2, GripVertical,
} from 'lucide-react';
import { clearHotelSettingsCache } from '../../hooks/useHotelSettings';
import { DEFAULT_CANCELLATION_TIERS } from '../../hooks/useHotelSettings';
import './HotelSettingsPage.css';

/* ── API helpers ────────────────────────────────────────────────────────────── */
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

async function fetchSettings() {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_BASE}/rooms/hotel/settings/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

async function patchSettings(payload) {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_BASE}/rooms/hotel/settings/`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

/* ── Time helpers ───────────────────────────────────────────────────────────── */
function buildTimeOptions() {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh   = String(h).padStart(2, '0');
      const mm   = String(m).padStart(2, '0');
      const val  = `${hh}:${mm}`;
      const ampm = h < 12
        ? `${h === 0 ? 12 : h}:${mm} AM`
        : `${h === 12 ? 12 : h - 12}:${mm} PM`;
      opts.push({ value: val, label: ampm });
    }
  }
  return opts;
}
const TIME_OPTIONS = buildTimeOptions();

function to12h(val) {
  if (!val) return '—';
  const [hStr, mStr] = val.split(':');
  const h    = parseInt(hStr, 10);
  const m    = mStr || '00';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${ampm}`;
}

/* ── Default form values ────────────────────────────────────────────────────── */
const DEFAULTS = {
  checkin_time:       '14:00',
  checkout_time:      '12:00',
  hotel_name:         'Cebu Mini Hotel',
  hotel_address:      '123 Colon St., Cebu City, 6000',
  hotel_phone:        '+63 32 123 4567',
  hotel_email:        'info@cebuminihotel.com',
  hotel_description:  '',
  cancellation_tiers: DEFAULT_CANCELLATION_TIERS,
  terms_url:          '/terms-and-conditions',
  privacy_url:        '/privacy-policy',
};

/* ── Tier helpers ───────────────────────────────────────────────────────────── */
function newTier() {
  return { _id: Date.now() + Math.random(), hours_before: 24, refund_pct: 50, label: '' };
}

function tiersEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Validate tier list — returns array of error strings (empty = valid)
function validateTiers(tiers) {
  const errors = [];
  if (!tiers.length) {
    errors.push('At least one cancellation tier is required.');
    return errors;
  }
  tiers.forEach((t, i) => {
    if (t.hours_before < 0) errors.push(`Tier ${i + 1}: hours must be ≥ 0.`);
    if (t.refund_pct < 0 || t.refund_pct > 100) errors.push(`Tier ${i + 1}: refund % must be 0–100.`);
  });
  // Ensure there is exactly one catch-all (hours_before = 0)
  const catchAlls = tiers.filter(t => Number(t.hours_before) === 0);
  if (catchAlls.length === 0) errors.push('Add a catch-all tier with 0 hours (no-refund fallback).');
  if (catchAlls.length > 1)  errors.push('Only one tier can have 0 hours (the catch-all).');
  return errors;
}

// Strip _id before saving — backend doesn't need it
function cleanTiers(tiers) {
  return [...tiers]
    .sort((a, b) => Number(b.hours_before) - Number(a.hours_before))
    .map(({ _id, ...rest }) => ({
      hours_before: Number(rest.hours_before),
      refund_pct:   Number(rest.refund_pct),
      label:        rest.label || '',
    }));
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`hsp-toast hsp-toast--${toast.type}`}>
      {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
      {toast.msg}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="hsp-section-label">{children}</div>;
}

function SettingGroup({ icon, title, description, children }) {
  return (
    <div className="hsp-group">
      <div className="hsp-group-header">
        <span className="hsp-group-icon">{icon}</span>
        <div>
          <h3 className="hsp-group-title">{title}</h3>
          {description && <p className="hsp-group-desc">{description}</p>}
        </div>
      </div>
      <div className="hsp-group-body">{children}</div>
    </div>
  );
}

function TimeSelect({ label, hint, value, onChange, disabled }) {
  return (
    <div className="hsp-field">
      <label className="hsp-label">
        {label}
        {hint && <span className="hsp-hint">{hint}</span>}
      </label>
      <div className="hsp-time-row">
        <div className="hsp-select-wrap">
          <Clock size={14} className="hsp-select-icon" />
          <select
            className="hsp-select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            {TIME_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <span className="hsp-time-preview">{to12h(value)}</span>
      </div>
    </div>
  );
}

function TextField({ label, hint, value, onChange, disabled, placeholder, icon: Icon, type = 'text' }) {
  return (
    <div className="hsp-field">
      <label className="hsp-label">
        {label}
        {hint && <span className="hsp-hint">{hint}</span>}
      </label>
      <div className="hsp-input-wrap">
        {Icon && <Icon size={14} className="hsp-input-icon" />}
        <input
          type={type}
          className={`hsp-input${Icon ? ' hsp-input--icon' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

function TextAreaField({ label, hint, value, onChange, disabled, placeholder, rows = 4 }) {
  return (
    <div className="hsp-field">
      <label className="hsp-label">
        {label}
        {hint && <span className="hsp-hint">{hint}</span>}
      </label>
      <textarea
        className="hsp-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}

/* ── CancellationTierEditor ─────────────────────────────────────────────────── */
function CancellationTierEditor({ tiers, onChange, disabled }) {
  const errors = validateTiers(tiers);

  const updateTier = (idx, field, val) => {
    const next = tiers.map((t, i) => i === idx ? { ...t, [field]: val } : t);
    onChange(next);
  };

  const addTier = () => {
    onChange([...tiers, newTier()]);
  };

  const removeTier = (idx) => {
    onChange(tiers.filter((_, i) => i !== idx));
  };

  // Sort descending for display (most generous first)
  const sorted = [...tiers].sort((a, b) => Number(b.hours_before) - Number(a.hours_before));
  // Map display-index back to actual index in `tiers`
  const sortedWithIdx = sorted.map(t => ({ ...t, _origIdx: tiers.indexOf(t) }));

  return (
    <div className="hsp-tier-editor">
      {/* Column headers */}
      <div className="hsp-tier-header-row">
        <span className="hsp-tier-col-label" style={{ flex: '0 0 120px' }}>Hours before</span>
        <span className="hsp-tier-col-label" style={{ flex: '0 0 100px' }}>Refund %</span>
        <span className="hsp-tier-col-label" style={{ flex: 1 }}>Label (shown to guests)</span>
        <span style={{ width: 32 }} />
      </div>

      {sortedWithIdx.map(({ _origIdx, ...tier }) => {
        const isCatchAll = Number(tier.hours_before) === 0;
        return (
          <div
            key={tier._id ?? _origIdx}
            className={`hsp-tier-row${isCatchAll ? ' hsp-tier-row--catchall' : ''}`}
          >
            {/* Hours before */}
            <div className="hsp-tier-input-wrap" style={{ flex: '0 0 120px' }}>
              <input
                type="number"
                min="0"
                className="hsp-tier-input"
                value={tier.hours_before}
                onChange={e => updateTier(_origIdx, 'hours_before', e.target.value)}
                disabled={disabled || isCatchAll}
                placeholder="48"
              />
              <span className="hsp-tier-unit">h</span>
            </div>

            {/* Refund % */}
            <div className="hsp-tier-input-wrap" style={{ flex: '0 0 100px' }}>
              <input
                type="number"
                min="0"
                max="100"
                className="hsp-tier-input"
                value={tier.refund_pct}
                onChange={e => updateTier(_origIdx, 'refund_pct', e.target.value)}
                disabled={disabled}
                placeholder="90"
              />
              <span className="hsp-tier-unit">%</span>
            </div>

            {/* Label */}
            <input
              type="text"
              className="hsp-tier-label-input"
              style={{ flex: 1 }}
              value={tier.label}
              onChange={e => updateTier(_origIdx, 'label', e.target.value)}
              disabled={disabled}
              placeholder={isCatchAll ? 'Same-day / no refund' : '48+ hours before check-in'}
            />

            {/* Remove — catch-all is protected */}
            <button
              type="button"
              className="hsp-tier-remove"
              onClick={() => removeTier(_origIdx)}
              disabled={disabled || isCatchAll}
              title={isCatchAll ? 'Catch-all tier cannot be removed' : 'Remove tier'}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        className="hsp-tier-add-btn"
        onClick={addTier}
        disabled={disabled}
      >
        <Plus size={13} /> Add tier
      </button>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="hsp-tier-errors">
          {errors.map((e, i) => (
            <div key={i} className="hsp-tier-error">
              <AlertCircle size={12} /> {e}
            </div>
          ))}
        </div>
      )}

      {/* Live preview — mirrors BookingForm CancellationPolicyBlock */}
      <div className="hsp-policy-preview" style={{ marginTop: 16 }}>
        <p className="hsp-preview-label">Guest-facing preview (BookingForm)</p>
        {sortedWithIdx.map(({ _origIdx, ...tier }) => {
          const isCatchAll = Number(tier.hours_before) === 0;
          const refundPct  = Number(tier.refund_pct);
          return (
            <div key={tier._id ?? _origIdx} className="hsp-tier-preview-row">
              <div
                className="hsp-tier-preview-badge"
                style={{
                  background: refundPct >= 80 ? 'rgba(5,150,105,0.10)' :
                               refundPct >= 40 ? 'rgba(217,119,6,0.10)' :
                               'rgba(1,0,13,0.05)',
                  color: refundPct >= 80 ? '#059669' :
                         refundPct >= 40 ? '#d97706' :
                         '#909090',
                  borderColor: refundPct >= 80 ? 'rgba(5,150,105,0.25)' :
                               refundPct >= 40 ? 'rgba(217,119,6,0.25)' :
                               'rgba(1,0,13,0.12)',
                }}
              >
                {refundPct}%
              </div>
              <div className="hsp-tier-preview-text">
                <span className="hsp-tier-preview-condition">
                  {isCatchAll
                    ? 'Same day / after check-in'
                    : `≥ ${tier.hours_before}h before check-in`}
                </span>
                <span className="hsp-tier-preview-label">
                  {tier.label || (refundPct === 0 ? 'No refund' : `${refundPct}% refund`)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */
export default function HotelSettingsPage() {
  const [saved,   setSaved]   = useState({ ...DEFAULTS });
  const [form,    setForm]    = useState({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);

  // Tiers need their own _id for stable React keys
  const [tiers, setTiers] = useState(
    DEFAULT_CANCELLATION_TIERS.map((t, i) => ({ ...t, _id: i }))
  );
  const [savedTiers, setSavedTiers] = useState(tiers);

  const formWithTiers  = { ...form, cancellation_tiers: tiers };
  const savedWithTiers = { ...saved, cancellation_tiers: savedTiers };
  const isDirty = JSON.stringify(formWithTiers) !== JSON.stringify(savedWithTiers);

  /* ── Load ─────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data  = await fetchSettings();
      const clean = {
        checkin_time:       data.checkin_time       || DEFAULTS.checkin_time,
        checkout_time:      data.checkout_time      || DEFAULTS.checkout_time,
        hotel_name:         data.hotel_name         || DEFAULTS.hotel_name,
        hotel_address:      data.hotel_address      || DEFAULTS.hotel_address,
        hotel_phone:        data.hotel_phone        || DEFAULTS.hotel_phone,
        hotel_email:        data.hotel_email        || DEFAULTS.hotel_email,
        hotel_description:  data.hotel_description  || DEFAULTS.hotel_description,
        terms_url:          data.terms_url          || DEFAULTS.terms_url,
        privacy_url:        data.privacy_url        || DEFAULTS.privacy_url,
      };

      const rawTiers = Array.isArray(data.cancellation_tiers) && data.cancellation_tiers.length > 0
        ? data.cancellation_tiers
        : DEFAULT_CANCELLATION_TIERS;

      const loadedTiers = rawTiers.map((t, i) => ({ ...t, _id: i }));

      setSaved(clean);
      setForm(clean);
      setSavedTiers(loadedTiers);
      setTiers(loadedTiers);
    } catch {
      showToast('Could not load settings — showing defaults.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Helpers ──────────────────────────────────────────────── */
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleReset = () => {
    setForm({ ...saved });
    setTiers(savedTiers);
  };

  const handleSave = async () => {
    const tierErrors = validateTiers(tiers);
    if (tierErrors.length > 0) {
      showToast('Fix cancellation tier errors before saving.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        cancellation_tiers: cleanTiers(tiers),
      };
      const updated = await patchSettings(payload);

      const clean = {
        checkin_time:       updated.checkin_time       || form.checkin_time,
        checkout_time:      updated.checkout_time      || form.checkout_time,
        hotel_name:         updated.hotel_name         || form.hotel_name,
        hotel_address:      updated.hotel_address      || form.hotel_address,
        hotel_phone:        updated.hotel_phone        || form.hotel_phone,
        hotel_email:        updated.hotel_email        || form.hotel_email,
        hotel_description:  updated.hotel_description  ?? form.hotel_description,
        terms_url:          updated.terms_url          || form.terms_url,
        privacy_url:        updated.privacy_url        || form.privacy_url,
      };

      const rawUpdatedTiers = Array.isArray(updated.cancellation_tiers) && updated.cancellation_tiers.length > 0
        ? updated.cancellation_tiers
        : cleanTiers(tiers);

      const updatedTiers = rawUpdatedTiers.map((t, i) => ({ ...t, _id: i }));

      setSaved(clean);
      setForm(clean);
      setSavedTiers(updatedTiers);
      setTiers(updatedTiers);

      clearHotelSettingsCache();
      showToast('Settings saved successfully.');
    } catch {
      showToast('Failed to save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <div className="hsp-page">

      <Toast toast={toast} />

      {/* ── Page header ──────────────────────────────────────── */}
      <div className="hsp-header">
        <div className="hsp-header-left">
          <p className="hsp-eyebrow">Admin · Global Configuration</p>
          <h1 className="hsp-title">Hotel Settings</h1>
          <p className="hsp-subtitle">
            Changes here apply across all rooms and guest-facing experiences.
          </p>
          <div className="hsp-divider" />
        </div>
        <div className="hsp-header-actions">
          {isDirty && (
            <button className="hsp-btn hsp-btn--ghost" onClick={handleReset} disabled={saving}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
          <button
            className={`hsp-btn hsp-btn--gold${isDirty ? ' hsp-btn--pulse' : ''}`}
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving
              ? <><span className="hsp-spinner" /> Saving…</>
              : <><Save size={14} /> Save Changes</>
            }
          </button>
        </div>
      </div>

      {/* ── Unsaved banner ───────────────────────────────────── */}
      {isDirty && (
        <div className="hsp-dirty-banner">
          <Info size={14} />
          You have unsaved changes — click <strong>Save Changes</strong> to apply.
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────── */}
      {loading ? (
        <div className="hsp-loading">
          <div className="hsp-spinner" />
          <span>Loading settings…</span>
        </div>
      ) : (
        <div className="hsp-content">

          {/* ─── Section 1: Check-In / Check-Out ─────────────── */}
          <SectionLabel>Check-In &amp; Check-Out</SectionLabel>

          <SettingGroup
            icon={<Clock size={18} />}
            title="Global Check-In / Check-Out Times"
            description="These times are displayed on all room listings, booking confirmations, and guest communications."
          >
            <div className="hsp-time-grid">
              <TimeSelect
                label="Check-In Time"
                hint="Earliest guests may access their room"
                value={form.checkin_time}
                onChange={(v) => set('checkin_time', v)}
                disabled={saving}
              />
              <div className="hsp-time-divider">
                <span className="hsp-time-divider-line" />
                <span className="hsp-time-divider-label">to</span>
                <span className="hsp-time-divider-line" />
              </div>
              <TimeSelect
                label="Check-Out Time"
                hint="Latest guests must vacate their room"
                value={form.checkout_time}
                onChange={(v) => set('checkout_time', v)}
                disabled={saving}
              />
            </div>

            <div className="hsp-preview-card">
              <p className="hsp-preview-label">Guest-facing preview</p>
              <div className="hsp-preview-row">
                <div className="hsp-preview-item">
                  <span className="hsp-preview-icon">🔑</span>
                  <div>
                    <span className="hsp-preview-key">Check-In</span>
                    <span className="hsp-preview-val">{to12h(form.checkin_time)}</span>
                  </div>
                </div>
                <div className="hsp-preview-sep" />
                <div className="hsp-preview-item">
                  <span className="hsp-preview-icon">🧳</span>
                  <div>
                    <span className="hsp-preview-key">Check-Out</span>
                    <span className="hsp-preview-val">{to12h(form.checkout_time)}</span>
                  </div>
                </div>
              </div>
              {(saved.checkin_time !== form.checkin_time || saved.checkout_time !== form.checkout_time) ? (
                <p className="hsp-preview-unsaved">⚠ Unsaved — guests still see the previous times until you save.</p>
              ) : (
                <p className="hsp-preview-saved">✓ Currently live for all guests.</p>
              )}
            </div>

            <div className="hsp-info-note">
              <Info size={13} />
              <span>These are global defaults. Per-room overrides can be added in Room settings and will take precedence.</span>
            </div>
          </SettingGroup>

          {/* ─── Section 2: Hotel Information ────────────────── */}
          <SectionLabel>Hotel Information</SectionLabel>

          <SettingGroup
            icon={<Building2 size={18} />}
            title="Contact &amp; Location"
            description="Displayed on the guest dashboard, booking confirmations, and the hotel info card."
          >
            <div className="hsp-two-col">
              <TextField
                label="Hotel Name"
                value={form.hotel_name}
                onChange={(v) => set('hotel_name', v)}
                disabled={saving}
                placeholder="Cebu Mini Hotel"
                icon={Building2}
              />
              <TextField
                label="Phone Number"
                value={form.hotel_phone}
                onChange={(v) => set('hotel_phone', v)}
                disabled={saving}
                placeholder="+63 32 123 4567"
                icon={Phone}
                type="tel"
              />
            </div>

            <TextField
              label="Address"
              value={form.hotel_address}
              onChange={(v) => set('hotel_address', v)}
              disabled={saving}
              placeholder="123 Colon St., Cebu City, 6000"
              icon={MapPin}
            />

            <TextField
              label="Email Address"
              value={form.hotel_email}
              onChange={(v) => set('hotel_email', v)}
              disabled={saving}
              placeholder="info@cebuminihotel.com"
              icon={Mail}
              type="email"
            />

            <TextAreaField
              label="Hotel Description"
              hint="Short blurb shown in guest dashboard footer"
              value={form.hotel_description}
              onChange={(v) => set('hotel_description', v)}
              disabled={saving}
              placeholder="A boutique stay in the heart of Cebu City…"
              rows={3}
            />
          </SettingGroup>

          {/* ─── Section 3: Cancellation Policy ─────────────── */}
          <SectionLabel>Cancellation Policy</SectionLabel>

          <SettingGroup
            icon={<ShieldCheck size={18} />}
            title="Cancellation &amp; Refund Tiers"
            description="Define refund eligibility windows. Each tier sets how far in advance a guest must cancel to receive a partial or full refund. The backend uses these exact tiers to calculate refund amounts — no more hardcoded values."
          >
            <div className="hsp-info-note" style={{ marginBottom: 4 }}>
              <Info size={13} />
              <span>
                Tiers are evaluated top-to-bottom (most generous first). The tier with
                <strong style={{ color: 'rgba(248,246,240,0.7)' }}> 0 hours</strong> is
                the catch-all — it should always have 0% refund. The catch-all cannot be removed.
              </span>
            </div>

            <CancellationTierEditor
              tiers={tiers}
              onChange={setTiers}
              disabled={saving}
            />

            {!tiersEqual(cleanTiers(tiers), cleanTiers(savedTiers)) && (
              <p className="hsp-preview-unsaved" style={{ marginTop: 8 }}>
                ⚠ Unsaved — guests and the refund engine still use the previous tiers until you save.
              </p>
            )}
            {tiersEqual(cleanTiers(tiers), cleanTiers(savedTiers)) && (
              <p className="hsp-preview-saved" style={{ marginTop: 8 }}>
                ✓ Currently live — backend refund calculations use these tiers.
              </p>
            )}
          </SettingGroup>

          {/* ─── Section 4: Legal Links ───────────────────────── */}
          <SectionLabel>Legal</SectionLabel>

          <SettingGroup
            icon={<FileText size={18} />}
            title="Legal Document Links"
            description="Links displayed in the guest dashboard footer and during booking checkout. Use relative paths (e.g. /terms-and-conditions) or full URLs."
          >
            <div className="hsp-two-col">
              <TextField
                label="Terms &amp; Conditions URL"
                value={form.terms_url}
                onChange={(v) => set('terms_url', v)}
                disabled={saving}
                placeholder="/terms-and-conditions"
                icon={LinkIcon}
              />
              <TextField
                label="Privacy Policy URL"
                value={form.privacy_url}
                onChange={(v) => set('privacy_url', v)}
                disabled={saving}
                placeholder="/privacy-policy"
                icon={LinkIcon}
              />
            </div>

            <div className="hsp-legal-preview">
              <p className="hsp-preview-label">Footer link preview</p>
              <div className="hsp-legal-preview-links">
                <a
                  href={form.terms_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hsp-legal-preview-link"
                >
                  Terms &amp; Conditions ↗
                </a>
                <span className="hsp-legal-preview-sep">·</span>
                <a
                  href={form.privacy_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hsp-legal-preview-link"
                >
                  Privacy Policy ↗
                </a>
              </div>
              {(saved.terms_url !== form.terms_url || saved.privacy_url !== form.privacy_url) ? (
                <p className="hsp-preview-unsaved">⚠ Unsaved — guests still see previous links.</p>
              ) : (
                <p className="hsp-preview-saved">✓ Currently live for all guests.</p>
              )}
            </div>

            <div className="hsp-info-note">
              <Info size={13} />
              <span>
                These links appear in the guest dashboard footer and in the booking checkout agreement checkbox.
              </span>
            </div>
          </SettingGroup>

        </div>
      )}

      {/* ── Sticky footer save bar (mobile) ──────────────────── */}
      {isDirty && (
        <div className="hsp-sticky-footer">
          <span className="hsp-sticky-msg">Unsaved changes</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="hsp-btn hsp-btn--ghost hsp-btn--sm" onClick={handleReset}>Reset</button>
            <button className="hsp-btn hsp-btn--gold hsp-btn--sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}