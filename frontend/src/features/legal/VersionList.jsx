// src/features/legal/VersionList.jsx
import { Scale, ShieldCheck, Pencil, CheckCircle2, FileText, Plus } from 'lucide-react';
import './VersionList.css';

/**
 * VersionList
 * Displays a table of legal document versions with actions.
 */
export default function VersionList({
  documents = [],
  loading = false,
  onEdit,
  onActivate,
  onNew,
  filterType = '',
  onFilterChange,
}) {
  const filteredDocs = filterType
    ? documents.filter(d => d.type === filterType)
    : documents;

  const formatDate = dateStr =>
    new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

  return (
    <div className="vl-wrapper">

      {/* Toolbar */}
      <div className="vl-toolbar">
        <div className="vl-filters">
          {[
            { value: '',        label: 'All' },
            { value: 'terms',   label: 'Terms' },
            { value: 'privacy', label: 'Privacy' },
          ].map(t => (
            <button
              key={t.value}
              className={`vl-filter-btn ${filterType === t.value ? 'vl-filter-active' : ''}`}
              onClick={() => onFilterChange?.(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="vl-btn-new" onClick={onNew}>
          <Plus size={12} />
          New Document
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="vl-loading">
          <div className="vl-spinner" />
          <span>Loading documents</span>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="vl-empty">
          <div className="vl-empty-icon">
            <FileText size={20} />
          </div>
          <p className="vl-empty-label">No documents found</p>
          <button className="vl-btn-new vl-btn-sm" onClick={onNew}>
            <Plus size={11} />
            Create the first one
          </button>
        </div>
      ) : (
        <div className="vl-table-wrap">
          <table className="vl-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Version</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => (
                <tr key={doc.id} className={doc.is_active ? 'vl-row-active' : ''}>
                  <td>
                    <span className={`vl-type-badge vl-type-${doc.type}`}>
                      {doc.type === 'terms'
                        ? <><Scale size={10} /> Terms</>
                        : <><ShieldCheck size={10} /> Privacy</>}
                    </span>
                  </td>
                  <td className="vl-title-cell" title={doc.title}>{doc.title}</td>
                  <td><code className="vl-version">v{doc.version}</code></td>
                  <td>
                    {doc.is_active
                      ? <span className="vl-status vl-status-active"><CheckCircle2 size={11} /> Active</span>
                      : <span className="vl-status vl-status-inactive">Inactive</span>}
                  </td>
                  <td className="vl-date">{formatDate(doc.created_at)}</td>
                  <td className="vl-date">{formatDate(doc.updated_at)}</td>
                  <td>
                    <div className="vl-action-group">
                      <button
                        className="vl-action-btn vl-action-edit"
                        onClick={() => onEdit?.(doc)}
                      >
                        <Pencil size={10} /> Edit
                      </button>
                      {!doc.is_active && (
                        <button
                          className="vl-action-btn vl-action-activate"
                          onClick={() => onActivate?.(doc)}
                        >
                          <CheckCircle2 size={10} /> Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="vl-footer">
        {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
      </div>

    </div>
  );
}