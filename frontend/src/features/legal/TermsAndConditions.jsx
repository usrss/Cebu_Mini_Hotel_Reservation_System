// src/features/legal/TermsAndConditions.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveTerms } from '../../services/legalApi';
import { isAuthenticated, getStoredUser } from '../../services/api';
import LegalViewer from './LegalViewer';
import './LegalPage.css';

function getBackRoute() {
  if (!isAuthenticated()) return '/';
  const user = getStoredUser();
  return user?.is_staff ? '/admin/dashboard' : '/dashboard';
}

export default function TermsAndConditions() {
  const [document, setDocument] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    getActiveTerms()
      .then(res => setDocument(res.data))
      .catch(err => {
        if (err.response?.status === 404) {
          setError('No Terms & Conditions document has been published yet.');
        } else {
          setError('Unable to load Terms & Conditions. Please try again later.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const backRoute = getBackRoute();
  const backLabel = backRoute === '/'
    ? 'Back to Home'
    : backRoute.includes('admin')
      ? 'Back to Admin Dashboard'
      : 'Back to Dashboard';

  return (
    <div className="lp-page">
      <nav className="lp-breadcrumb" aria-label="Breadcrumb">
        <Link to={backRoute} className="lp-breadcrumb-link">Home</Link>
        <span className="lp-breadcrumb-sep">›</span>
        <span>Terms &amp; Conditions</span>
      </nav>
      <div className="lp-brand-strip">
        <span className="lp-brand-icon">⚖</span>
        <span className="lp-brand-label">Legal — Cebu Mini Hotel</span>
      </div>
      <LegalViewer document={document} loading={loading} error={error} />
      <p className="lp-back-link">
        <Link to={backRoute}>← {backLabel}</Link>
      </p>
    </div>
  );
}