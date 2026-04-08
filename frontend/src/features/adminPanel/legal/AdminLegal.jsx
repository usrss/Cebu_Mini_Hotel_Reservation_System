// src/features/adminPanel/legal/AdminLegal.jsx
import { useEffect, useState, useCallback } from 'react';
import { listLegalDocuments, activateDocument } from '../../../services/legalApi';
import LegalEditor from '../../legal/LegalEditor';
import VersionList from '../../legal/VersionList';
import './AdminLegal.css';

/**
 * Admin page — /admin/legal
 * Manage all legal documents: create, edit, activate, view history.
 * Accessed via AdminLayout (already wraps this in the sidebar).
 */
export default function AdminLegal() {
  const [documents,   setDocuments]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filterType,  setFilterType]  = useState('');
  const [editorState, setEditorState] = useState(null); // null=list, 'new'=create, obj=edit
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

  return (
    <div className="al-page">

      {/* Toast */}
      {toast && (
        <div className={`al-toast al-toast-${toast.type}`} role="alert">
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="al-header">
        <div className="al-header-left">
          <div className="al-header-icon">⚖</div>
          <div>
            <h1 className="al-title">Legal Content Management</h1>
            <p className="al-subtitle">Cebu Mini Hotel — Terms &amp; Privacy Administration</p>
          </div>
        </div>
        <div className="al-header-right">
          <a href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="al-preview-link">
            Preview Terms ↗
          </a>
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="al-preview-link">
            Preview Privacy ↗
          </a>
        </div>
      </header>

      {/* Active document status cards */}
      <div className="al-status-cards">
        <div className={`al-status-card ${activeTerms ? 'al-card-ok' : 'al-card-warn'}`}>
          <div className="al-card-icon">{activeTerms ? '✓' : '!'}</div>
          <div>
            <div className="al-card-label">Terms &amp; Conditions</div>
            <div className="al-card-value">
              {activeTerms
                ? `v${activeTerms.version} — ${activeTerms.title}`
                : 'No active document'}
            </div>
          </div>
        </div>
        <div className={`al-status-card ${activePrivacy ? 'al-card-ok' : 'al-card-warn'}`}>
          <div className="al-card-icon">{activePrivacy ? '✓' : '!'}</div>
          <div>
            <div className="al-card-label">Privacy Policy</div>
            <div className="al-card-value">
              {activePrivacy
                ? `v${activePrivacy.version} — ${activePrivacy.title}`
                : 'No active document'}
            </div>
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
              ← Back to list
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