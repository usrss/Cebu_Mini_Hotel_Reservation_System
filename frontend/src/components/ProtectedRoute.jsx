// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated, getStoredUser } from '../services/api';

export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If no roles required, authentication alone is enough
  if (!allowedRoles) {
    return children;
  }

  const user = getStoredUser();

  // Always use effective_role — it respects temp_role overrides.
  // Fallback: if staff_profile isn't in localStorage yet (e.g. old session
  // before the serializer fix), treat is_staff=true as 'admin' so existing
  // staff sessions don't get locked out on first deploy.
  const effectiveRole =
    user?.staff_profile?.effective_role ??
    (user?.is_staff ? 'admin' : null);

  if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}