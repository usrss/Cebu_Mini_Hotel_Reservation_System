// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Register          from './features/auth/Register';
import Login             from './features/auth/Login';
import Dashboard         from './features/dashboard/Dashboard';
import ProtectedRoute    from './components/ProtectedRoute';
import { isAuthenticated, getStoredUser } from './services/api';
import ForgotPassword    from './features/auth/ForgotPassword.jsx';
import AccountSettings   from './features/auth/Accountsettings.jsx';
import RoomListPage      from './features/rooms/RoomListPage';
import RoomDetailPage    from './features/rooms/RoomDetailPage';
import { bookingRoutes }      from './features/bookings/BookingRoutes';
import { paymentRoutes }      from './features/payments/PaymentRoutes.jsx';
import HotelHomepage          from './features/home/HotelHomepage.jsx';
import { notificationRoutes } from './features/notifications/NotificationRoutes';
import { adminPanelRoutes }   from './components/AdminPanelRoutes';
import { staffRoutes }        from './features/staff/StaffRoutes';
import ChatWidgetWrapper from './features/chatbot/ChatWidgetWrapper';
import StaffActivatePage      from './features/adminPanel/staff/StaffActivatePage';
import { legalRoutes } from './components/legalRoutes';
// ── at the top with other imports ─────────────────────────────────────────────
import FoodAndDrinks         from './features/food/FoodAndDrinks';
import FoodPaymentSuccessPage from './features/food/FoodPaymentSuccessPage';
import FoodPaymentCancelPage  from './features/food/FoodPaymentCancelPage';

import './features/home/HotelHomepage.css';

import './App.css';


function getHomeRoute() {
  const user = getStoredUser();
  return user?.is_staff ? '/admin/dashboard' : '/dashboard';
}

function App() {
  return (
    <Router>

      <Routes>

        {/* ── Auth ─────────────────────────────────────────────────────── */}
        <Route
          path="/login"
          element={isAuthenticated() ? <Navigate to={getHomeRoute()} replace /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated() ? <Navigate to={getHomeRoute()} replace /> : <Register />}
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
          path="/food"
          element={<ProtectedRoute><FoodAndDrinks /></ProtectedRoute>}
        />
        <Route
          path="/food-payment/success"
          element={<ProtectedRoute><FoodPaymentSuccessPage /></ProtectedRoute>}
        />
        <Route
          path="/food-payment/cancel"
          element={<ProtectedRoute><FoodPaymentCancelPage /></ProtectedRoute>}
        />


        {/* ── Rooms (public) ───────────────────────────────────────────── */}
        <Route path="/rooms"     element={<RoomListPage />} />
        <Route path="/rooms/:id" element={<RoomDetailPage />} />


        {/* ── Bookings & Payments ──────────────────────────────────────── */}
        {bookingRoutes}
        {paymentRoutes}
        {notificationRoutes}

        {/* ── Admin Panel ──────────────────────────────────────────────── */}
        {adminPanelRoutes}

        {/* ── Staff Module ─────────────────────────────────────────────── */}
        {staffRoutes}

        {legalRoutes}

        {/* ── Staff Activation (public — no login needed) ──────────────── */}
        <Route path="/staff/activate/:uidb64/:token" element={<StaffActivatePage />} />

        {/* ── Default & 404 ────────────────────────────────────────────── */}
        <Route path="/" element={<HotelHomepage />} />
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>

      {/* ── Chat Widget — outside <Routes> so it renders on every page ── */}
      <ChatWidgetWrapper />

    </Router>
  );
}

export default App;