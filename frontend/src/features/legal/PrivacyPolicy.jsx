// src/features/legal/PrivacyPolicy.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActivePrivacy } from '../../services/legalApi';
import { isAuthenticated, getStoredUser } from '../../services/api';
import LegalViewer from './LegalViewer';
import './LegalPage.css';

function getBackRoute() {
  if (!isAuthenticated()) return '/';
  const user = getStoredUser();
  return user?.is_staff ? '/admin/dashboard' : '/dashboard';
}

export default function PrivacyPolicy() {
  const [document, setDocument] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    getActivePrivacy()
      .then(res => setDocument(res.data))
      .catch(err => {
        if (err.response?.status === 404) {
          setError('No Privacy Policy document has been published yet.');
        } else {
          setError('Unable to load Privacy Policy. Please try again later.');
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
        <span>Privacy Policy</span>
      </nav>
      <div className="lp-brand-strip">
        <span className="lp-brand-icon">🔒</span>
        <span className="lp-brand-label">Legal — Cebu Mini Hotel</span>
      </div>
      <LegalViewer document={document} loading={loading} error={error} />
      <p className="lp-back-link">
        <Link to={backRoute}>← {backLabel}</Link>
      </p>
    </div>
  );
}