/**
 * HotelSettingsPage.jsx
 *
 * Global hotel settings — admin/manager only.
 * Manages:
 *   • Check-in / Check-out times
 *   • Hotel Information (address, phone, email, description, cancellation policy)
 *   • Legal Links (Terms & Conditions, Privacy Policy URLs)
 *
 * API contract:
 *   GET   /api/rooms/hotel/settings/  → full settings object
 *   PATCH /api/rooms/hotel/settings/  → partial update, returns updated object
 *
 * Expected response shape:
 *   {
 *     checkin_time, checkout_time,
 *     hotel_name, hotel_address, hotel_phone, hotel_email, hotel_description,
 *     cancellation_policy,
 *     terms_url, privacy_url,
 *   }
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Save, RotateCcw, CheckCircle2, AlertCircle,
  Info, MapPin, Phone, Mail, FileText, Link as LinkIcon,
  Building2, ShieldCheck,
} from 'lucide-react';
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
      const hh  = String(h).padStart(2, '0');
      const mm  = String(m).padStart(2, '0');
      const val = `${hh}:${mm}`;
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
  const h   = parseInt(hStr, 10);
  const m   = mStr || '00';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${ampm}`;
}

/* ── Default form values ────────────────────────────────────────────────────── */
const DEFAULTS = {
  // Times
  checkin_time:  '14:00',
  checkout_time: '12:00',
  // Hotel info
  hotel_name:          'Cebu Mini Hotel',
  hotel_address:       '123 Colon St., Cebu City, 6000',
  hotel_phone:         '+63 32 123 4567',
  hotel_email:         'info@cebuminihotel.com',
  hotel_description:   '',
  cancellation_policy: 'Free cancellation up to 48 hours before check-in. Cancellations within 48 hours are subject to a one-night charge.',
  // Legal
  terms_url:   '/terms-and-conditions',
  privacy_url: '/privacy-policy',
};

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

/* ── Main page ──────────────────────────────────────────────────────────────── */
export default function HotelSettingsPage() {
  const [saved,   setSaved]   = useState({ ...DEFAULTS });
  const [form,    setForm]    = useState({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved);

  /* ── Load ─────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSettings();
      const clean = {
        checkin_time:        data.checkin_time        || DEFAULTS.checkin_time,
        checkout_time:       data.checkout_time       || DEFAULTS.checkout_time,
        hotel_name:          data.hotel_name          || DEFAULTS.hotel_name,
        hotel_address:       data.hotel_address       || DEFAULTS.hotel_address,
        hotel_phone:         data.hotel_phone         || DEFAULTS.hotel_phone,
        hotel_email:         data.hotel_email         || DEFAULTS.hotel_email,
        hotel_description:   data.hotel_description   || DEFAULTS.hotel_description,
        cancellation_policy: data.cancellation_policy || DEFAULTS.cancellation_policy,
        terms_url:           data.terms_url           || DEFAULTS.terms_url,
        privacy_url:         data.privacy_url         || DEFAULTS.privacy_url,
      };
      setSaved(clean);
      setForm(clean);
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

  const handleReset = () => setForm({ ...saved });

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await patchSettings(form);
      const clean = {
        checkin_time:        updated.checkin_time        || form.checkin_time,
        checkout_time:       updated.checkout_time       || form.checkout_time,
        hotel_name:          updated.hotel_name          || form.hotel_name,
        hotel_address:       updated.hotel_address       || form.hotel_address,
        hotel_phone:         updated.hotel_phone         || form.hotel_phone,
        hotel_email:         updated.hotel_email         || form.hotel_email,
        hotel_description:   updated.hotel_description   ?? form.hotel_description,
        cancellation_policy: updated.cancellation_policy || form.cancellation_policy,
        terms_url:           updated.terms_url           || form.terms_url,
        privacy_url:         updated.privacy_url         || form.privacy_url,
      };
      setSaved(clean);
      setForm(clean);
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

            {/* Preview card */}
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

          <SettingGroup
            icon={<FileText size={18} />}
            title="Cancellation Policy"
            description="Shown to guests on the dashboard info card and during booking checkout."
          >
            <TextAreaField
              label="Cancellation Policy Text"
              hint="Plain text — keep it concise"
              value={form.cancellation_policy}
              onChange={(v) => set('cancellation_policy', v)}
              disabled={saving}
              placeholder="Free cancellation up to 48 hours before check-in…"
              rows={3}
            />

            {/* Live preview */}
            <div className="hsp-policy-preview">
              <p className="hsp-preview-label">Guest-facing preview</p>
              <p className="hsp-policy-preview-text">
                {form.cancellation_policy || <span className="hsp-muted">No policy text entered.</span>}
              </p>
            </div>
          </SettingGroup>

          {/* ─── Section 3: Legal Links ───────────────────────── */}
          <SectionLabel>Legal</SectionLabel>

          <SettingGroup
            icon={<ShieldCheck size={18} />}
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

            {/* Live preview of footer links */}
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
                These links appear in the guest dashboard footer below the Hotel Information card.
                They are also shown in the booking checkout agreement checkbox.
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