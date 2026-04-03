/**
 * src/features/adminPanel/reports/SaveTemplateModal.jsx
 *
 * Modal to save a report config as a named template.
 * Pops up when the user clicks "Save as Template" in BuildTab.
 */

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { reportTemplateApi } from '../../../services/reportsApi';
import { getStoredUser } from '../../../services/api';

export default function SaveTemplateModal({ reportType, config, onClose, onSaved }) {
  const user    = getStoredUser();
  const isAdmin = user?.staff_profile?.effective_role === 'admin';

  const [name,        setName]       = useState('');
  const [description, setDesc]       = useState('');
  const [isShared,    setIsShared]   = useState(false);
  const [saving,      setSaving]     = useState(false);
  const [error,       setError]      = useState(null);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError(null);
    try {
      await reportTemplateApi.create({
        name:        name.trim(),
        description: description.trim(),
        report_type: reportType,
        config,
        is_shared:   isShared,
      });
      onSaved();
    } catch (err) {
      const d = err.response?.data;
      setError(
        typeof d === 'string' ? d :
        d?.name?.[0] || d?.detail || 'Failed to save template.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crp-modal-overlay" onClick={onClose}>
      <div className="crp-modal" onClick={e => e.stopPropagation()}>

        <div className="crp-modal-header">
          <h3 className="crp-modal-title">Save as Template</h3>
          <button className="crp-icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="crp-modal-body">
          <div className="sf-form-group">
            <label className="sf-label">Template Name *</label>
            <input
              className="sf-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Monthly Revenue by Room Type"
              autoFocus
            />
          </div>

          <div className="sf-form-group" style={{ marginTop: 12 }}>
            <label className="sf-label">Description (optional)</label>
            <textarea
              className="sf-input"
              rows={2}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="What does this report show?"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="crp-modal-summary">
            <span>Type: <b>{reportType}</b></span>
            <span>Period: <b>{config.period}</b></span>
            {config.group_by && <span>Group by: <b>{config.group_by}</b></span>}
            {config.metrics?.length > 0 && (
              <span>{config.metrics.length} metric{config.metrics.length !== 1 ? 's' : ''} selected</span>
            )}
          </div>

          {isAdmin && (
            <label className="crp-checkbox-row">
              <input
                type="checkbox"
                checked={isShared}
                onChange={e => setIsShared(e.target.checked)}
              />
              <span>Share with all Admins and Managers</span>
            </label>
          )}

          {error && <p className="crp-error" style={{ marginTop: 10 }}>{error}</p>}
        </div>

        <div className="crp-modal-footer">
          <button className="sf-btn" onClick={onClose} type="button">Cancel</button>
          <button
            className="sf-btn sf-btn-primary"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving…' : <><Save size={12} /> Save Template</>}
          </button>
        </div>
      </div>
    </div>
  );
}