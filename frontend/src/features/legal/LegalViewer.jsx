import React from "react";
import { FileText, AlertTriangle, Loader } from "lucide-react";
import "./LegalViewer.css";

/**
 * LegalViewer
 * Renders a legal document with title, version badge, last updated, and scrollable content.
 *
 * Props:
 *   document  - { title, version, content, updated_at, type }
 *   loading   - boolean
 *   error     - string | null
 */
const LegalViewer = ({ document, loading, error }) => {
  if (loading) {
    return (
      <div className="lv-state">
        <div className="lv-spinner" />
        <p className="lv-state-label">Loading document</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lv-state">
        <div className="lv-state-icon">
          <AlertTriangle size={18} />
        </div>
        <p className="lv-state-label">Unable to load</p>
        <p className="lv-state-msg">{error}</p>
      </div>
    );
  }

  if (!document) return null;

  const updatedDate = document.updated_at
    ? new Date(document.updated_at).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <article className="lv-wrapper">
      <header className="lv-header">
        <h1 className="lv-title">{document.title}</h1>
        <div className="lv-meta">
          <span className="lv-badge">v{document.version}</span>
          <span className="lv-divider">·</span>
          <span className="lv-updated">Updated {updatedDate}</span>
        </div>
      </header>

      <div className="lv-content-area">
        {document.content.includes("<") ? (
          <div
            className="lv-content"
            dangerouslySetInnerHTML={{ __html: document.content }}
          />
        ) : (
          <div className="lv-content lv-plain">
            {document.content.split("\n").map((line, idx) =>
              line.trim() ? (
                <p key={idx}>{line}</p>
              ) : (
                <br key={idx} />
              )
            )}
          </div>
        )}
      </div>
    </article>
  );
};

export default LegalViewer;