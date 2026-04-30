// src/features/auth/GoogleCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { googleAuthenticate, getStoredUser } from '../../services/api';
import axios from 'axios';

function getPostLoginRoute() {
  const user = getStoredUser();
  if (!user) return '/';
  if (!user?.is_staff) return '/dashboard';
  const role =
    user?.staff_profile?.effective_role ??
    (user?.is_staff ? 'admin' : null);
  switch (role) {
    case 'front_desk':   return '/staff/front-desk';
    case 'housekeeping': return '/staff/cleaning';
    case 'maintenance':  return '/staff/maintenance';
    case 'security':     return '/staff/incidents';
    default:             return '/admin/dashboard';
  }
}

export default function GoogleCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const accessToken = params.get('access_token');
    const error = params.get('error');

    if (error || !accessToken) {
      // No token — send back to login with error
      navigate('/login?error=google_failed', { replace: true });
      return;
    }

    // Clean the URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);

    axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(({ data }) => {
        // Use the googleAuthenticate function from api.js
        return googleAuthenticate(accessToken, data);
      })
      .then(() => {
        navigate(getPostLoginRoute(), { replace: true });
      })
      .catch((err) => {
        console.error('Google callback error:', err);
        navigate('/login?error=google_failed', { replace: true });
      });
  }, [navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p>Signing you in...</p>
    </div>
  );
}