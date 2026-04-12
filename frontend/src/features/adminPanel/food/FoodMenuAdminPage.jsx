/**
 * FoodMenuAdminPage.jsx
 * Admin manages food catalog — add, edit, delete items, set price, category, and photo.
 * Route: /admin/food-menu (Admin only)
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

function ImageUploadField({ value, onChange, existingUrl }) {
  const inputRef  = useRef(null);
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
      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)', display: 'block', marginBottom: 8 }}>
        Photo
      </label>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${preview ? 'var(--gold)' : 'var(--gold-border)'}`,
          borderRadius: 4,
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--navy-mid)',
          transition: 'border-color 0.2s',
          minHeight: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Preview"
              style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}
            >
              <span style={{ color: 'var(--white)', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>Change Photo</span>
            </div>
            <button
              onClick={handleClear}
              style={{
                position: 'absolute', top: 6, right: 6,
                background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50%', width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--white)',
              }}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--white-dim)' }}>
            <Upload size={24} style={{ color: 'var(--gold)', marginBottom: 8 }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white-dim)', marginBottom: 4 }}>
              Click or drag to upload
            </div>
            <div style={{ fontSize: 10, color: 'rgba(248,246,240,0.3)' }}>JPG, PNG, WEBP · max 5MB</div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}

function FoodItemModal({ item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form,       setForm]       = useState(isEdit ? {
    name:         item.name,
    description:  item.description,
    category:     item.category,
    price:        item.price,
    is_available: item.is_available,
  } : { ...EMPTY_FORM });
  const [imageFile,  setImageFile]  = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim())  { setError('Name is required.'); return; }
    if (!form.price)        { setError('Price is required.'); return; }
    if (isNaN(form.price) || Number(form.price) <= 0) { setError('Price must be a positive number.'); return; }

    setSubmitting(true); setError('');
    try {
      const hasImage = imageFile !== null || (isEdit && item.image && imageFile !== null);

      if (imageFile || (isEdit && !imageFile)) {
        // Use FormData when there's a file to upload
        if (imageFile) {
          const fd = new FormData();
          Object.entries(form).forEach(([k, v]) => fd.append(k, v));
          fd.append('image', imageFile);
          if (isEdit) {
            await api.patch(`/food/menu/${item.id}/`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          } else {
            await api.post('/food/menu/', fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          }
        } else {
          // No new image — send JSON normally
          if (isEdit) {
            await api.patch(`/food/menu/${item.id}/`, form);
          } else {
            await api.post('/food/menu/', form);
          }
        }
      } else {
        if (isEdit) {
          await api.patch(`/food/menu/${item.id}/`, form);
        } else {
          await api.post('/food/menu/', form);
        }
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save item.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: 'var(--navy-card)', border: '1px solid var(--gold-border)',
        width: '100%', maxWidth: 520, borderRadius: 4,
        fontFamily: "'Raleway', sans-serif", position: 'relative', overflow: 'hidden',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, var(--gold), transparent)' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid var(--gold-border)', flexShrink: 0 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: 'var(--white)', margin: 0 }}>
            {isEdit ? 'Edit Food Item' : 'Add Food Item'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--white-dim)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          {error && (
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', padding: '8px 12px', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Image upload */}
          <ImageUploadField
            value={imageFile}
            onChange={setImageFile}
            existingUrl={isEdit ? (item.image_url || item.image) : null}
          />

          {/* Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>Name *</label>
            <input
              style={{ background: 'var(--navy-mid)', border: '1px solid var(--gold-border)', color: 'var(--white)', padding: '8px 12px', fontSize: 13, fontFamily: "'Raleway', sans-serif", borderRadius: 2 }}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Chicken Adobo"
            />
          </div>

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>Description</label>
            <textarea
              style={{ background: 'var(--navy-mid)', border: '1px solid var(--gold-border)', color: 'var(--white)', padding: '8px 12px', fontSize: 13, fontFamily: "'Raleway', sans-serif", borderRadius: 2, resize: 'vertical' }}
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Short description…"
            />
          </div>

          {/* Category + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>Category *</label>
              <select
                style={{ background: 'var(--navy-mid)', border: '1px solid var(--gold-border)', color: 'var(--white)', padding: '8px 12px', fontSize: 13, fontFamily: "'Raleway', sans-serif", borderRadius: 2 }}
                value={form.category}
                onChange={e => set('category', e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>Price (₱) *</label>
              <input
                type="number" min="0" step="0.01"
                style={{ background: 'var(--navy-mid)', border: '1px solid var(--gold-border)', color: 'var(--white)', padding: '8px 12px', fontSize: 13, fontFamily: "'Raleway', sans-serif", borderRadius: 2 }}
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Availability */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--white-dim)' }}>
            <input
              type="checkbox"
              checked={form.is_available}
              onChange={e => set('is_available', e.target.checked)}
              style={{ accentColor: 'var(--gold)' }}
            />
            Available for ordering
          </label>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid var(--gold-border)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 18px', background: 'none', border: '1px solid var(--gold-border)', color: 'var(--white-dim)', fontFamily: "'Raleway', sans-serif", fontSize: 12, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: '8px 20px', background: 'var(--gold-dim)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: "'Raleway', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setDeleting(item.id);
    try {
      await api.delete(`/food/menu/${item.id}/`);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch {
      alert('Failed to delete item.');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleAvailable = async (item) => {
    try {
      await api.patch(`/food/menu/${item.id}/`, { is_available: !item.is_available });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i));
    } catch {
      alert('Failed to update availability.');
    }
  };

  const filtered = category === 'all' ? items : items.filter(i => i.category === category);
  const counts   = { all: items.length };
  CATEGORIES.forEach(c => { counts[c] = items.filter(i => i.category === c).length; });

  return (
    <div style={{ padding: '44px 48px 80px', maxWidth: 1100, margin: '0 auto', fontFamily: "'Raleway', sans-serif", color: 'var(--white)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 8px' }}>Admin Panel</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: 'var(--white)', margin: '0 0 4px' }}>Food Menu</h1>
          <p style={{ fontSize: 13, color: 'var(--white-dim)', margin: 0 }}>{items.length} items in catalog</p>
          <div style={{ width: 44, height: 1, background: 'linear-gradient(90deg, var(--gold), transparent)', marginTop: 16 }} />
        </div>
        <button
          onClick={() => setModal('create')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--gold-dim)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: "'Raleway', sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}
        >
          <Plus size={15} /> Add Item
        </button>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {['all', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: '6px 16px',
              background: category === cat ? 'var(--gold-dim)' : 'transparent',
              border: `1px solid ${category === cat ? 'var(--gold)' : 'var(--gold-border)'}`,
              color: category === cat ? 'var(--gold)' : 'var(--white-dim)',
              fontFamily: "'Raleway', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer', borderRadius: 999,
            }}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)} ({counts[cat] ?? 0})
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--white-dim)', fontSize: 13 }}>Loading menu…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--white-dim)', fontSize: 13 }}>No items found.</div>
      ) : (
        <div style={{ border: '1px solid var(--gold-border)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--gold-border)', background: 'rgba(201,168,76,0.05)' }}>
                {['Photo', 'Name', 'Category', 'Price', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const imgSrc = item.image_url ? resolveImageUrl(item.image_url) : (item.image ? resolveImageUrl(item.image) : null);
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(201,168,76,0.07)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    {/* Photo */}
                    <td style={{ padding: '10px 16px', width: 60 }}>
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={item.name}
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 2, border: '1px solid var(--gold-border)' }}
                        />
                      ) : (
                        <div style={{
                          width: 48, height: 48, border: '1px solid var(--gold-border)',
                          borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--navy-mid)',
                        }}>
                          <Image size={18} style={{ color: 'var(--gold-border)' }} />
                        </div>
                      )}
                    </td>
                    {/* Name */}
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>{item.name}</div>
                      {item.description && (
                        <div style={{ fontSize: 11, color: 'var(--white-dim)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                      )}
                    </td>
                    {/* Category */}
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)', background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', padding: '3px 8px' }}>
                        {item.category}
                      </span>
                    </td>
                    {/* Price */}
                    <td style={{ padding: '10px 16px', fontFamily: "'Playfair Display', serif", fontSize: 15, color: 'var(--white)' }}>
                      ₱{parseFloat(item.price).toFixed(2)}
                    </td>
                    {/* Status toggle */}
                    <td style={{ padding: '10px 16px' }}>
                      <button
                        onClick={() => handleToggleAvailable(item)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                          background: item.is_available ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.08)',
                          border: `1px solid ${item.is_available ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                          color: item.is_available ? '#4ade80' : '#f87171',
                          cursor: 'pointer', fontFamily: "'Raleway', sans-serif",
                        }}
                      >
                        {item.is_available ? <><CheckCircle2 size={11} /> Available</> : 'Unavailable'}
                      </button>
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setModal(item)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', color: 'var(--gold)', fontFamily: "'Raleway', sans-serif", fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >
                          <Edit2 size={11} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={deleting === item.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontFamily: "'Raleway', sans-serif", fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: deleting === item.id ? 0.5 : 1 }}
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