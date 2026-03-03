// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Register          from './features/auth/Register';
import Login             from './features/auth/Login';
import Dashboard         from './features/dashboard/Dashboard';
import ProtectedRoute    from './components/ProtectedRoute';
import { isAuthenticated } from './services/api';
import ForgotPassword    from './features/auth/ForgotPassword.jsx';
import AccountSettings   from './features/auth/Accountsettings.jsx';
import RoomListPage      from './features/rooms/RoomListPage';
import RoomDetailPage    from './features/rooms/RoomDetailPage';
import AdminRoomsPage    from './features/rooms/AdminRoomsPage';
import { bookingRoutes } from './features/bookings/BookingRoutes';
import { paymentRoutes } from './features/payments/PaymentRoutes.jsx';
import HotelHomepage from "./features/home/HotelHomepage.jsx";

import './App.css';



function App() {
  return (
    <Router>
      <Routes>

        {/* ── Auth ─────────────────────────────────────────────────────── */}
        <Route
          path="/login"
          element={isAuthenticated() ? <Navigate to="/dashboard" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated() ? <Navigate to="/dashboard" replace /> : <Register />}
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* ── Protected ────────────────────────────────────────────────── */}
        <Route
          path="/dashboard"
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
        />
        <Route
          path="/settings"
          element={<ProtectedRoute><AccountSettings /></ProtectedRoute>}
        />
        <Route
          path="/admin/rooms"
          element={<ProtectedRoute><AdminRoomsPage /></ProtectedRoute>}
        />

        {/* ── Rooms (public) ───────────────────────────────────────────── */}
        <Route path="/rooms"    element={<RoomListPage />} />
        <Route path="/rooms/:id" element={<RoomDetailPage />} />

        {/* ── Bookings & Payments ──────────────────────────────────────── */}
        {bookingRoutes}
        {paymentRoutes}

        {/* ── Default & 404 ────────────────────────────────────────────── */}
        <Route path="/" element={<HotelHomepage />} />
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </Router>
  );
}

export default App;