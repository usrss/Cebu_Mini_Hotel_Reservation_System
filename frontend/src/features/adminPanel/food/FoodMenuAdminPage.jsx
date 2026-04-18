/**
 * FoodMenuAdminPage.jsx — revised to match AdminDashboard light theme
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, X, CheckCircle2, Upload, Image } from 'lucide-react';
import api from '../../../services/api';

const CATEGORIES = ['food', 'drinks', 'snacks', 'desserts'];
const EMPTY_FORM = { name: '', description: '', category: 'food', price: '', is_available: true };
const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:8000';

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

/* ── shared style tokens ── */
const T = {
  bg:       '#F2F3F7',
  surface:  '#FFFFFF',
  surface2: '#F2F3F7',
  border:   '#E4E6ED',
  text:     '#01000D',
  muted:    '#52515E',
  faint:    '#7A7987',
  shadow:   '0 2px 10px rgba(1,0,13,0.07), 0 1px 3px rgba(1,0,13,0.04)',
  radius:   14,
  font:     "'DM Sans', sans-serif",
  serif:    "'DM Serif Display', serif",
};

const inputStyle = {
  width: '100%',
  background: T.surface2,
  border: `1.5px solid ${T.border}`,
  borderRadius: 8,
  color: T.text,
  padding: '9px 12px',
  fontSize: 13,
  fontFamily: T.font,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: T.muted,
  display: 'block',
  marginBottom: 6,
};

/* ── Image Upload Field ── */
function ImageUploadField({ value, onChange, existingUrl }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(existingUrl ? resolveImageUrl(existingUrl) : null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    onChange(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    onChange(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <label style={labelStyle}>Photo</label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${T.border}`,
          borderRadius: 10,
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative',
          background: T.surface2,
          minHeight: 130,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 170ms',
        }}
      >
        {preview ? (
          <>
            <img src={preview} alt="Preview" style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(1,0,13,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 170ms',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}
            >
              <span style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 700 }}>Change Photo</span>
            </div>
            <button
              onClick={handleClear}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(1,0,13,0.6)', border: 'none',
                borderRadius: '50%', width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FFFFFF',
              }}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 24, color: T.faint }}>
            <Upload size={22} style={{ color: T.muted, marginBottom: 8 }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>Click or drag to upload</div>
            <div style={{ fontSize: 10, color: T.faint }}>JPG, PNG, WEBP · max 5MB</div>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

/* ── Modal ── */
function FoodItemModal({ item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState(isEdit ? {
    name: item.name, description: item.description,
    category: item.category, price: item.price, is_available: item.is_available,
  } : { ...EMPTY_FORM });
  const [imageFile, setImageFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.price) { setError('Price is required.'); return; }
    if (isNaN(form.price) || Number(form.price) <= 0) { setError('Price must be a positive number.'); return; }
    setSubmitting(true); setError('');
    try {
      if (imageFile) {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        fd.append('image', imageFile);
        if (isEdit) await api.patch(`/food/menu/${item.id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        else await api.post('/food/menu/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        if (isEdit) await api.patch(`/food/menu/${item.id}/`, form);
        else await api.post('/food/menu/', form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save item.');
    } finally {
      setSubmitting(false);
    }
  };

  const btnBase = {
    padding: '9px 18px', borderRadius: 8, fontFamily: T.font,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 170ms',
    border: `1.5px solid ${T.border}`,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(1,0,13,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: T.surface, borderRadius: T.radius + 4, width: '100%', maxWidth: 520,
        boxShadow: '0 8px 32px rgba(1,0,13,0.12)', fontFamily: T.font,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <h2 style={{ fontFamily: T.serif, fontSize: 18, color: T.text, margin: 0, fontWeight: 400 }}>
            {isEdit ? 'Edit Food Item' : 'Add Food Item'}
          </h2>
          <button onClick={onClose} style={{ background: T.surface2, border: 'none', borderRadius: 6, color: T.muted, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          {error && (
            <div style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#DC2626', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}

          <ImageUploadField value={imageFile} onChange={setImageFile} existingUrl={isEdit ? (item.image_url || item.image) : null} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Chicken Adobo" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Short description…" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={labelStyle}>Category *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={labelStyle}>Price (₱) *</label>
              <input type="number" min="0" step="0.01" style={inputStyle} value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: T.muted }}>
            <input type="checkbox" checked={form.is_available} onChange={e => set('is_available', e.target.checked)} style={{ accentColor: T.text }} />
            Available for ordering
          </label>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ ...btnBase, background: T.surface, color: T.muted }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ ...btnBase, background: T.text, border: `1.5px solid ${T.text}`, color: '#FFFFFF', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function FoodMenuAdminPage() {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [category, setCategory] = useState('all');
  const [modal,    setModal]    = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/food/menu/all/');
      setItems(res.data.results ?? res.data);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setDeleting(item.id);
    try {
      await api.delete(`/food/menu/${item.id}/`);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch { alert('Failed to delete item.'); }
    finally { setDeleting(null); }
  };

  const handleToggleAvailable = async (item) => {
    try {
      await api.patch(`/food/menu/${item.id}/`, { is_available: !item.is_available });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i));
    } catch { alert('Failed to update availability.'); }
  };

  const filtered = category === 'all' ? items : items.filter(i => i.category === category);
  const counts   = { all: items.length };
  CATEGORIES.forEach(c => { counts[c] = items.filter(i => i.category === c).length; });

  const pillBase = (active) => ({
    padding: '7px 16px',
    background: active ? T.text : T.surface,
    border: `1.5px solid ${active ? T.text : T.border}`,
    color: active ? '#FFFFFF' : T.muted,
    fontFamily: T.font, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', borderRadius: 20,
    transition: 'all 170ms',
    boxShadow: '0 1px 3px rgba(1,0,13,0.05)',
  });

  return (
    <div style={{ padding: '40px 40px 80px', maxWidth: 1100, margin: '0 auto', fontFamily: T.font, color: T.text, background: T.bg, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.text, display: 'block', marginBottom: 8 }}>Admin Panel</span>
          <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(24px,3vw,34px)', color: T.text, margin: '0 0 6px', fontWeight: 400, letterSpacing: '-0.01em' }}>Food Menu</h1>
          <p style={{ fontSize: 13, color: T.muted, margin: '0 0 18px' }}>{items.length} items in catalog</p>
          <div style={{ width: 28, height: 2, background: T.text, borderRadius: 2 }} />
        </div>
        <button
          onClick={() => setModal('create')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', background: T.text, border: `1.5px solid ${T.text}`,
            borderRadius: 10, color: '#FFFFFF', fontFamily: T.font,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 170ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.text; e.currentTarget.style.color = '#FFFFFF'; }}
        >
          <Plus size={15} /> Add Item
        </button>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {['all', ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setCategory(cat)} style={pillBase(category === cat)}>
            {cat.charAt(0).toUpperCase() + cat.slice(1)} ({counts[cat] ?? 0})
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: T.faint, fontSize: 13 }}>Loading menu…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: T.faint, fontSize: 13 }}>No items found.</div>
      ) : (
        <div style={{ background: T.surface, borderRadius: T.radius, boxShadow: T.shadow, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
                {['Photo', 'Name', 'Category', 'Price', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: T.muted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const imgSrc = item.image_url ? resolveImageUrl(item.image_url) : (item.image ? resolveImageUrl(item.image) : null);
                return (
                  <tr key={item.id} style={{ borderBottom: `1px solid ${T.surface2}`, transition: 'background 170ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 16px', width: 60 }}>
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.name} style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}` }} />
                      ) : (
                        <div style={{ width: 46, height: 46, border: `1px solid ${T.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.surface2 }}>
                          <Image size={18} style={{ color: T.faint }} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{item.name}</div>
                      {item.description && (
                        <div style={{ fontSize: 11, color: T.faint, marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 8px' }}>
                        {item.category}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: T.serif, fontSize: 15, color: T.text, fontWeight: 400 }}>
                      ₱{parseFloat(item.price).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <button
                        onClick={() => handleToggleAvailable(item)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                          background: item.is_available ? 'rgba(13,148,136,0.08)' : 'rgba(220,38,38,0.07)',
                          border: `1px solid ${item.is_available ? 'rgba(13,148,136,0.25)' : 'rgba(220,38,38,0.2)'}`,
                          color: item.is_available ? '#0D9488' : '#DC2626',
                          cursor: 'pointer', fontFamily: T.font, borderRadius: 6,
                        }}
                      >
                        {item.is_available ? <><CheckCircle2 size={11} /> Available</> : 'Unavailable'}
                      </button>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setModal(item)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: T.surface2, border: `1.5px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 170ms' }}
                          onMouseEnter={e => { e.currentTarget.style.background = T.text; e.currentTarget.style.color = '#FFFFFF'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.color = T.text; }}
                        >
                          <Edit2 size={11} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={deleting === item.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: T.surface2, border: `1.5px solid ${T.border}`, borderRadius: 8, color: T.muted, fontFamily: T.font, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: deleting === item.id ? 0.5 : 1, transition: 'all 170ms' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.07)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.3)'; e.currentTarget.style.color = '#DC2626'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <FoodItemModal
          item={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}