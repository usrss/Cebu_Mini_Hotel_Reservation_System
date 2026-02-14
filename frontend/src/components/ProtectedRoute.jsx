// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../services/api';

export default function ProtectedRoute({ children }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    // Redirect to login if not authenticated
    // Save the location they were trying to access
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}