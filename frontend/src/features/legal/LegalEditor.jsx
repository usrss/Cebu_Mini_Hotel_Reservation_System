// src/features/legal/LegalEditor.jsx
import { useState, useEffect } from 'react';
import {
  createLegalDocument,
  updateLegalDocument,
  activateDocument,
} from '../../services/legalApi';
import './LegalEditor.css';

/**
 * LegalEditor
 * Admin form for creating or editing a legal document.
 *
 * Props:
 *   document   - existing document object (null = create mode)
 *   onSuccess  - () => void — called after successful save/activate
 *   onCancel   - () => void
 */
export default function LegalEditor({ document: doc = null, onSuccess, onCancel }) {
  const isEditMode = !!doc;

  const [form, setForm] = useState({
    type:      doc?.type      || 'terms',
    title:     doc?.title     || '',
    content:   doc?.content   || '',
    version:   doc?.version   || '',
    is_active: doc?.is_active || false,
  });

  const [errors,     setErrors]     = useState({});
  const [loading,    setLoading]    = useState(false);
  const [activating, setActivating] = useState(false);
  const [feedback,   setFeedback]   = useState(null);

  useEffect(() => {
    if (doc) {
      setForm({
        type:      doc.type,
        title:     doc.title,
        content:   doc.content,
        version:   doc.version,
        is_active: doc.is_active,
      });
    }
  }, [doc]);

  const validate = () => {
    const e = {};
    if (!form.type)          e.type    = 'Document type is required.';
    if (!form.title.trim())  e.title   = 'Title is required.';
    if (!form.version.trim()) e.version = 'Version is required.';
    if (!form.content.trim()) e.content = 'Content cannot be empty.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setFeedback(null);
    try {
      if (isEditMode) {
        await updateLegalDocument(doc.id, form);
      } else {
        await createLegalDocument(form);
      }
      setFeedback({ type: 'success', message: `Document ${isEditMode ? 'updated' : 'created'} successfully.` });
      setTimeout(() => onSuccess?.(), 1200);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const serverErrors = {};
        Object.entries(data).forEach(([key, val]) => {
          serverErrors[key] = Array.isArray(val) ? val.join(' ') : String(val);
        });
        setErrors(serverErrors);
      } else {
        setFeedback({ type: 'error', message: 'An error occurred. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!doc?.id) return;
    setActivating(true);
    setFeedback(null);
    try {
      await activateDocument(doc.id);
      setFeedback({ type: 'success', message: 'Document activated successfully.' });
      setTimeout(() => onSuccess?.(), 1200);
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to activate document.' });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="le-wrapper">
      <div className="le-header">
        <h2 className="le-title">{isEditMode ? 'Edit Document' : 'New Legal Document'}</h2>
        {isEditMode && (
          <span className={`le-status-badge ${doc.is_active ? 'le-active' : 'le-inactive'}`}>
            {doc.is_active ? '● Active' : '○ Inactive'}
          </span>
        )}
      </div>

      {feedback && (
        <div className={`le-feedback le-feedback-${feedback.type}`} role="alert">
          {feedback.type === 'success' ? '✓' : '✕'} {feedback.message}
        </div>
      )}

      <form className="le-form" onSubmit={handleSubmit} noValidate>

        {/* Document Type */}
        <div className="le-field">
          <label className="le-label">Document Type</label>
          <div className="le-radio-group">
            {[
              { value: 'terms',   label: 'Terms & Conditions' },
              { value: 'privacy', label: 'Privacy Policy' },
            ].map(opt => (
              <label
                key={opt.value}
                className={`le-radio ${form.type === opt.value ? 'le-radio-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="type"
                  value={opt.value}
                  checked={form.type === opt.value}
                  onChange={() => handleChange('type', opt.value)}
                  disabled={isEditMode}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {errors.type && <span className="le-error">{errors.type}</span>}
        </div>

        {/* Title */}
        <div className="le-field">
          <label className="le-label" htmlFor="le-title">
            Title <span className="le-required">*</span>
          </label>
          <input
            id="le-title"
            type="text"
            className={`le-input ${errors.title ? 'le-input-error' : ''}`}
            value={form.title}
            onChange={e => handleChange('title', e.target.value)}
            placeholder="e.g. Terms and Conditions – Cebu Mini Hotel"
            maxLength={255}
          />
          {errors.title && <span className="le-error">{errors.title}</span>}
        </div>

        {/* Version */}
        <div className="le-field">
          <label className="le-label" htmlFor="le-version">
            Version <span className="le-required">*</span>
          </label>
          <input
            id="le-version"
            type="text"
            className={`le-input le-input-sm ${errors.version ? 'le-input-error' : ''}`}
            value={form.version}
            onChange={e => handleChange('version', e.target.value)}
            placeholder="e.g. 1.0 or 2025-v1"
            maxLength={50}
          />
          {errors.version && <span className="le-error">{errors.version}</span>}
        </div>

        {/* Content */}
        <div className="le-field">
          <label className="le-label" htmlFor="le-content">
            Content <span className="le-required">*</span>
            <span className="le-hint"> (plain text or HTML)</span>
          </label>
          <textarea
            id="le-content"
            className={`le-textarea ${errors.content ? 'le-input-error' : ''}`}
            value={form.content}
            onChange={e => handleChange('content', e.target.value)}
            placeholder="Enter the full document content here…"
            rows={14}
          />
          <div className="le-char-count">{form.content.length} characters</div>
          {errors.content && <span className="le-error">{errors.content}</span>}
        </div>

        {/* Set Active on Create */}
        {!isEditMode && (
          <div className="le-field le-field-inline">
            <label className="le-checkbox-label">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => handleChange('is_active', e.target.checked)}
              />
              <span>Set as active document immediately</span>
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="le-actions">
          <button type="button" className="le-btn le-btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          {isEditMode && !doc.is_active && (
            <button
              type="button"
              className="le-btn le-btn-activate"
              onClick={handleActivate}
              disabled={activating}
            >
              {activating ? 'Activating…' : 'Set as Active'}
            </button>
          )}
          <button type="submit" className="le-btn le-btn-primary" disabled={loading || activating}>
            {loading ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create Document'}
          </button>
        </div>

      </form>
    </div>
  );
}