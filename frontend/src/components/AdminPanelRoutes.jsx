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

// staff
import StaffManagement from '../features/adminPanel/staff/StaffManagement';

// Analytics
import AnalyticsDashboard from '../features/adminPanel/analytics/AnalyticsDashboard';

function AdminRoute({ element }) {
  return (
    <ProtectedRoute>
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
    element={<AdminRoute element={<AnalyticsDashboard />} />}
  />,

   // ── Staff Management (Admin only) ──────────────────────────────────────────
  <Route key="admin-staff"
    path="/admin/staff"
    element={<AdminRoute element={<StaffManagement />} />}
  />,

  // ── Guests ─────────────────────────────────────────────────────────────────
  <Route key="admin-guests"
    path="/admin/guests"
    element={<AdminRoute element={<GuestListPage />} />}
  />,
  <Route key="admin-guest-detail"
    path="/admin/guests/:id"
    element={<AdminRoute element={<GuestDetailPage />} />}
  />,
  <Route key="admin-guest-bookings"
    path="/admin/guests/:id/bookings"
    element={<AdminRoute element={<GuestBookingHistory />} />}
  />,

  // ── Payments — revenue/ MUST come before :id ───────────────────────────────
  <Route key="admin-payments"
    path="/admin/payments"
    element={<AdminRoute element={<PaymentListPage />} />}
  />,
  <Route key="admin-payment-revenue"
    path="/admin/payments/revenue"
    element={<AdminRoute element={<RevenueSummaryPage />} />}
  />,
  <Route key="admin-payment-detail"
    path="/admin/payments/:id"
    element={<AdminRoute element={<PaymentDetailPage />} />}
  />,

  // ── Reviews — stats/ MUST come before :id ─────────────────────────────────
  <Route key="admin-reviews"
    path="/admin/reviews"
    element={<AdminRoute element={<ReviewListPage />} />}
  />,
  <Route key="admin-review-stats"
    path="/admin/reviews/stats"
    element={<AdminRoute element={<ReviewStatsPage />} />}
  />,
  <Route key="admin-review-detail"
    path="/admin/reviews/:id"
    element={<AdminRoute element={<ReviewDetailPage />} />}
  />,

  <Route key="admin-rooms"
  path="/admin/rooms"
  element={<AdminRoute element={<AdminRoomsPage />} />}
/>,
];