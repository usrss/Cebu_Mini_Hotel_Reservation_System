import React from "react";
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
      <div className="lv-state lv-loading">
        <div className="lv-spinner" />
        <p>Loading document…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lv-state lv-error">
        <span className="lv-error-icon">⚠</span>
        <p>{error}</p>
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
      {/* Header */}
      <header className="lv-header">
        <h1 className="lv-title">{document.title}</h1>
        <div className="lv-meta">
          <span className="lv-badge">Version {document.version}</span>
          <span className="lv-divider">•</span>
          <span className="lv-updated">Last updated: {updatedDate}</span>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="lv-content-area">
        {/* Render as HTML if content has tags, otherwise plain paragraphs */}
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
