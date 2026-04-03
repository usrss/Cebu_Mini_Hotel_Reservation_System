/**
 * src/features/adminPanel/reports/ScheduleModal.jsx
 *
 * Modal to create a recurring schedule for a saved template.
 * Pops up when the user clicks "Schedule" in TemplatesTab.
 */

import { useState } from 'react';
import { X, Clock } from 'lucide-react';
import { reportScheduleApi } from '../../../services/reportsApi';

const FREQUENCIES = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const FORMATS = [
  { value: 'json',  label: 'In-App (JSON)' },
  { value: 'csv',   label: 'CSV / Excel' },
  { value: 'pdf',   label: 'PDF' },
];

export default function ScheduleModal({ template, onClose, onSaved }) {
  const [frequency, setFrequency] = useState('monthly');
  const [format,    setFormat]    = useState('json');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await reportScheduleApi.create({
        template:      template.id,
        frequency,
        export_format: format,
        is_active:     true,
      });
      onSaved();
    } catch (err) {
      const d = err.response?.data;
      setError(
        typeof d === 'string' ? d :
        d?.detail || d?.template?.[0] || 'Failed to create schedule.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crp-modal-overlay" onClick={onClose}>
      <div className="crp-modal" onClick={e => e.stopPropagation()}>

        <div className="crp-modal-header">
          <h3 className="crp-modal-title">Schedule Report</h3>
          <button className="crp-icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="crp-modal-body">
          <div className="crp-modal-summary" style={{ marginBottom: 16 }}>
            <span>Template: <b>{template.name}</b></span>
            <span>Type: <b>{template.report_type_display || template.report_type}</b></span>
          </div>

          <div className="sf-form-group">
            <label className="sf-label">Frequency</label>
            <div className="crp-period-row" style={{ marginTop: 6 }}>
              {FREQUENCIES.map(f => (
                <button
                  key={f.value}
                  className={`crp-period-btn${frequency === f.value ? ' crp-period-btn--active' : ''}`}
                  onClick={() => setFrequency(f.value)}
                  type="button"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sf-form-group" style={{ marginTop: 14 }}>
            <label className="sf-label">Export Format</label>
            <div className="crp-period-row" style={{ marginTop: 6 }}>
              {FORMATS.map(f => (
                <button
                  key={f.value}
                  className={`crp-period-btn${format === f.value ? ' crp-period-btn--active' : ''}`}
                  onClick={() => setFormat(f.value)}
                  type="button"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'rgba(248,246,240,0.4)', marginTop: 14 }}>
            The report will run automatically based on the selected frequency.
            Execution results are stored in History.
          </p>

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
            {saving ? 'Saving…' : <><Clock size={12} /> Create Schedule</>}
          </button>
        </div>
      </div>
    </div>
  );
}