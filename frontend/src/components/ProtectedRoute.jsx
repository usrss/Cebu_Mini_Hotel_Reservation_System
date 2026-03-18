// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated, getStoredUser } from '../services/api';

// Mirrors getPostLoginRoute() in Login.jsx — keep in sync
function getRoleHome(role) {
  switch (role) {
    case 'front_desk':   return '/staff/front-desk';
    case 'housekeeping': return '/staff/cleaning';
    case 'maintenance':  return '/staff/maintenance';
    case 'security':     return '/staff/incidents';
    case 'admin':
    case 'manager':
    case 'receptionist': return '/admin/dashboard';
    default:             return '/dashboard';
  }
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // No role restriction — authentication alone is enough
  if (!allowedRoles) {
    return children;
  }

  const user = getStoredUser();

  // Always use effective_role — respects temp_role overrides.
  // Fallback: treat is_staff=true as 'admin' so old sessions
  // don't get locked out before the serializer fix is deployed.
  const effectiveRole =
    user?.staff_profile?.effective_role ??
    (user?.is_staff ? 'admin' : null);

  if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
    // Redirect staff to their own home page, not the guest dashboard
    return <Navigate to={getRoleHome(effectiveRole)} replace />;
  }

  return children;
}