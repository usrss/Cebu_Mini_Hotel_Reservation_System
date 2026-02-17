// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Register from './features/auth/Register';
import Login from './features/auth/Login';
import Dashboard from './features/dashboard/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import { isAuthenticated } from './services/api';
import './App.css';
import ForgotPassword from './features/auth/ForgotPassword.jsx';
import AccountSettings from './features/auth/Accountsettings.jsx';
import RoomListPage from './features/rooms/RoomListPage';
import RoomDetailPage from './features/rooms/RoomDetailPage';
import AdminRoomsPage from './features/rooms/AdminRoomsPage';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/register"
          element={
            isAuthenticated() ? <Navigate to="/dashboard" replace /> : <Register />
          }
        />
        <Route
          path="/login"
          element={
            isAuthenticated() ? <Navigate to="/dashboard" replace /> : <Login />
          }
        />

        {/* Forgot Password & Settings */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/settings" element={<AccountSettings />} />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Room Routes — public */}
        <Route path="/rooms" element={<RoomListPage />} />
        <Route path="/rooms/:id" element={<RoomDetailPage />} />

        {/* Admin Room Management — protected */}
        <Route
          path="/admin/rooms"
          element={
            <ProtectedRoute>
              <AdminRoomsPage />
            </ProtectedRoute>
          }
        />

        {/* Default Route */}
        <Route
          path="/"
          element={
            <Navigate to={isAuthenticated() ? "/dashboard" : "/login"} replace />
          }
        />

        {/* 404 Route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;