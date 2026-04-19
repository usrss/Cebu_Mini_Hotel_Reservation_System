// src/features/adminPanel/legal/AdminLegal.jsx
import { useEffect, useState, useCallback } from 'react';
import { Scale, ShieldCheck, ExternalLink, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { listLegalDocuments, activateDocument } from '../../../services/legalApi';
import LegalEditor from '../../legal/LegalEditor';
import VersionList from '../../legal/VersionList';
import './AdminLegal.css';

/**
 * Admin page — /admin/legal
 * Manage all legal documents: create, edit, activate, view history.
 */
export default function AdminLegal() {
  const [documents,   setDocuments]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filterType,  setFilterType]  = useState('');
  const [editorState, setEditorState] = useState(null);
  const [toast,       setToast]       = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLegalDocuments();
      setDocuments(res.data);
    } catch {
      showToast('error', 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleActivate = async (doc) => {
    try {
      await activateDocument(doc.id);
      showToast('success', `"${doc.title}" set as active.`);
      fetchDocuments();
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Failed to activate document.');
    }
  };

  const handleEditorSuccess = () => {
    setEditorState(null);
    fetchDocuments();
    showToast('success', 'Document saved successfully.');
  };

  const activeTerms   = documents.find(d => d.type === 'terms'   && d.is_active);
  const activePrivacy = documents.find(d => d.type === 'privacy' && d.is_active);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="al-page">

      {/* Toast */}
      {toast && (
        <div className={`al-toast al-toast-${toast.type}`} role="alert">
          {toast.type === 'success'
            ? <CheckCircle2 size={14} />
            : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="al-header">
        <div>
          <p className="al-eyebrow">Admin Panel</p>
          <h1 className="al-title">Legal Content</h1>
          <p className="al-subtitle">
            Terms &amp; Privacy Administration · Cebu Mini Hotel
          </p>
        </div>
        <div className="al-header-actions">
          <a href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="al-preview-link">
            <Scale size={12} />
            Terms
            <ExternalLink size={11} />
          </a>
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="al-preview-link">
            <ShieldCheck size={12} />
            Privacy
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* Status KPI cards */}
      <p className="al-section-label">Active Documents</p>
      <div className="al-kpis">
        <div className={`al-stat-card ${!activeTerms ? 'al-stat-card--warn' : ''}`}>
          <div className={`al-stat-icon ${activeTerms ? 'al-stat-icon--ok' : 'al-stat-icon--warn'}`}>
            {activeTerms ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          </div>
          <div className="al-stat-body">
            <div className="al-stat-label">Terms &amp; Conditions</div>
            <div className="al-stat-value">
              {activeTerms ? `v${activeTerms.version}` : 'Not published'}
            </div>
            {activeTerms && (
              <div className="al-stat-sub">{activeTerms.title}</div>
            )}
          </div>
        </div>

        <div className={`al-stat-card ${!activePrivacy ? 'al-stat-card--warn' : ''}`}>
          <div className={`al-stat-icon ${activePrivacy ? 'al-stat-icon--ok' : 'al-stat-icon--warn'}`}>
            {activePrivacy ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          </div>
          <div className="al-stat-body">
            <div className="al-stat-label">Privacy Policy</div>
            <div className="al-stat-value">
              {activePrivacy ? `v${activePrivacy.version}` : 'Not published'}
            </div>
            {activePrivacy && (
              <div className="al-stat-sub">{activePrivacy.title}</div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="al-content">
        {editorState === null ? (
          <VersionList
            documents={documents}
            loading={loading}
            filterType={filterType}
            onFilterChange={setFilterType}
            onNew={() => setEditorState('new')}
            onEdit={doc => setEditorState(doc)}
            onActivate={handleActivate}
          />
        ) : (
          <div>
            <button className="al-back-btn" onClick={() => setEditorState(null)}>
              <ArrowLeft size={13} />
              Back to list
            </button>
            <LegalEditor
              document={editorState === 'new' ? null : editorState}
              onSuccess={handleEditorSuccess}
              onCancel={() => setEditorState(null)}
            />
          </div>
        )}
      </div>

    </div>
  );
}