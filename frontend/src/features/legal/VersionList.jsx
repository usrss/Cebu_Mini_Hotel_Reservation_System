// src/features/legal/VersionList.jsx
import './VersionList.css';

/**
 * VersionList
 * Displays a table of legal document versions with actions.
 *
 * Props:
 *   documents      - array of LegalDocument objects
 *   loading        - boolean
 *   onEdit         - (doc) => void
 *   onActivate     - (doc) => void
 *   onNew          - () => void
 *   filterType     - 'terms' | 'privacy' | ''
 *   onFilterChange - (type: string) => void
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
          {['', 'terms', 'privacy'].map(t => (
            <button
              key={t}
              className={`vl-filter-btn ${filterType === t ? 'vl-filter-active' : ''}`}
              onClick={() => onFilterChange?.(t)}
            >
              {t === '' ? 'All' : t === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
            </button>
          ))}
        </div>
        <button className="vl-btn-new" onClick={onNew}>+ New Document</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="vl-loading">
          <div className="vl-spinner" />
          <span>Loading documents…</span>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="vl-empty">
          <span>No documents found.</span>
          <button className="vl-btn-new vl-btn-sm" onClick={onNew}>Create the first one →</button>
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
                      {doc.type === 'terms' ? 'Terms' : 'Privacy'}
                    </span>
                  </td>
                  <td className="vl-title-cell">{doc.title}</td>
                  <td><code className="vl-version">v{doc.version}</code></td>
                  <td>
                    {doc.is_active
                      ? <span className="vl-status vl-status-active">● Active</span>
                      : <span className="vl-status vl-status-inactive">○ Inactive</span>}
                  </td>
                  <td className="vl-date">{formatDate(doc.created_at)}</td>
                  <td className="vl-date">{formatDate(doc.updated_at)}</td>
                  <td>
                    <div className="vl-action-group">
                      <button
                        className="vl-action-btn vl-action-edit"
                        onClick={() => onEdit?.(doc)}
                      >
                        Edit
                      </button>
                      {!doc.is_active && (
                        <button
                          className="vl-action-btn vl-action-activate"
                          onClick={() => onActivate?.(doc)}
                        >
                          Activate
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
        <span>{filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}</span>
      </div>

    </div>
  );
}