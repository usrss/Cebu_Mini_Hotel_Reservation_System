// src/components/AdminPanelRoutes.jsx

import { Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

// Layout & Dashboard
import AdminLayout    from '../features/adminPanel/layout/AdminLayout';
import AdminDashboard from '../features/adminPanel/dashboard/AdminDashboard';

// Guests
import GuestListPage       from '../features/adminPanel/GuestListPage';
import GuestDetailPage     from '../features/adminPanel/GuestDetailPage';
import GuestBookingHistory from '../features/adminPanel/GuestBookingHistory';

// Payments
import PaymentListPage    from '../features/adminPanel/PaymentListPage';
import PaymentDetailPage  from '../features/adminPanel/PaymentDetailPage';
import RevenueSummaryPage from '../features/adminPanel/RevenueSummaryPage';

// Reviews
import ReviewListPage   from '../features/adminPanel/ReviewListPage';
import ReviewDetailPage from '../features/adminPanel/ReviewDetailPage';
import ReviewStatsPage  from '../features/adminPanel/ReviewStatsPage';

// Rooms
import AdminRoomsPage from '../features/rooms/AdminRoomsPage';

// Staff
import StaffManagement from '../features/adminPanel/staff/StaffManagement';

// Analytics
import AnalyticsDashboard from '../features/adminPanel/analytics/AnalyticsDashboard';

// Chatbot Support
import SupportDashboard from '../features/chatbot/SupportDashboard';

// Reports
import ReportPage from '../features/staff/reports/ReportPage';
import CustomReportPage from '../features/adminPanel/reports/CustomReportPage';

// Hotel Settings
import HotelSettingsPage from '../features/adminPanel/settings/HotelSettingsPage';


// ── Role groups — mirror permissions.py & AdminLayout NAV_ITEMS exactly ───────
const ALL_STAFF_ROLES = ['admin', 'manager', 'receptionist', 'front_desk', 'housekeeping', 'maintenance', 'security'];
const ADMIN_MANAGER   = ['admin', 'manager'];
const GUEST_ROLES     = ['admin', 'manager', 'receptionist', 'front_desk'];
const PAYMENT_ROLES   = ['admin', 'manager', 'front_desk'];
const ROOM_ROLES      = ['admin', 'manager', 'housekeeping', 'maintenance'];

/**
 * AdminRoute
 * Wraps a page in ProtectedRoute (with role enforcement) + AdminLayout.
 */
function AdminRoute({ element, allowedRoles = ALL_STAFF_ROLES }) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <AdminLayout>
        {element}
      </AdminLayout>
    </ProtectedRoute>
  );
}

export const adminPanelRoutes = [

  // ── Dashboard ──────────────────────────────────────────────────────────────
  <Route key="admin-dashboard"
    path="/admin/dashboard"
    element={<AdminRoute element={<AdminDashboard />} />}
  />,

  // ── Analytics ──────────────────────────────────────────────────────────────
  <Route key="admin-analytics"
    path="/admin/analytics"
    element={<AdminRoute allowedRoles={ADMIN_MANAGER} element={<AnalyticsDashboard />} />}
  />,

  // ── Staff Management (Admin only) ──────────────────────────────────────────
  <Route key="admin-staff"
    path="/admin/staff"
    element={<AdminRoute allowedRoles={['admin']} element={<StaffManagement />} />}
  />,

  // ── Guests ─────────────────────────────────────────────────────────────────
  <Route key="admin-guests"
    path="/admin/guests"
    element={<AdminRoute allowedRoles={GUEST_ROLES} element={<GuestListPage />} />}
  />,
  <Route key="admin-guest-detail"
    path="/admin/guests/:id"
    element={<AdminRoute allowedRoles={GUEST_ROLES} element={<GuestDetailPage />} />}
  />,
  <Route key="admin-guest-bookings"
    path="/admin/guests/:id/bookings"
    element={<AdminRoute allowedRoles={GUEST_ROLES} element={<GuestBookingHistory />} />}
  />,

  // ── Payments — revenue/ MUST come before :id ───────────────────────────────
  <Route key="admin-payments"
    path="/admin/payments"
    element={<AdminRoute allowedRoles={PAYMENT_ROLES} element={<PaymentListPage />} />}
  />,
  <Route key="admin-payment-revenue"
    path="/admin/payments/revenue"
    element={<AdminRoute allowedRoles={ADMIN_MANAGER} element={<RevenueSummaryPage />} />}
  />,
  <Route key="admin-payment-detail"
    path="/admin/payments/:id"
    element={<AdminRoute allowedRoles={PAYMENT_ROLES} element={<PaymentDetailPage />} />}
  />,

  // ── Reviews — stats/ MUST come before :id ─────────────────────────────────
  <Route key="admin-reviews"
    path="/admin/reviews"
    element={<AdminRoute allowedRoles={ADMIN_MANAGER} element={<ReviewListPage />} />}
  />,
  <Route key="admin-review-stats"
    path="/admin/reviews/stats"
    element={<AdminRoute allowedRoles={ADMIN_MANAGER} element={<ReviewStatsPage />} />}
  />,
  <Route key="admin-review-detail"
    path="/admin/reviews/:id"
    element={<AdminRoute allowedRoles={ADMIN_MANAGER} element={<ReviewDetailPage />} />}
  />,

  // ── Rooms ──────────────────────────────────────────────────────────────────
  <Route key="admin-rooms"
    path="/admin/rooms"
    element={<AdminRoute allowedRoles={ROOM_ROLES} element={<AdminRoomsPage />} />}
  />,

  // ── Support Tickets ────────────────────────────────────────────────────────
  <Route key="admin-support"
    path="/admin/support"
    element={<AdminRoute allowedRoles={ADMIN_MANAGER} element={<SupportDashboard />} />}
  />,

  // ── Custom Reports ─────────────────────────────────────────────────────────
  <Route key="admin-reports"
    path="/admin/reports"
    element={<AdminRoute allowedRoles={ADMIN_MANAGER} element={<CustomReportPage />} />}
  />,

  // ── Hotel Settings ─────────────────────────────────────────────────────────
  <Route key="admin-hotel-settings"
    path="/admin/hotel-settings"
    element={<AdminRoute allowedRoles={ADMIN_MANAGER} element={<HotelSettingsPage />} />}
  />,

];