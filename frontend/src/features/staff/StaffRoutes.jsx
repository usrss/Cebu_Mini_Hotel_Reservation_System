/**
 * src/features/staff/StaffRoutes.jsx
 *
 * Route definitions for the entire Staff module.
 * allowedRoles on each ProtectedRoute mirrors staff/permissions.py exactly.
 *
 * FIXES:
 *  1. /staff/front-desk/support — was missing FrontDeskLayout and ProtectedRoute.
 *     Now properly wrapped and restricted to FRONT_DESK_ROLES.
 *  2. /front-desk/support (legacy bare path) — redirects to canonical path.
 *  3. Route ordering: specific paths before wildcard paths.
 *  4. Added /staff/front-desk/checkout/:bookingId — GuestCheckoutPage.
 */

import { Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';

// ── Layouts ────────────────────────────────────────────────────────────────────
import FrontDeskLayout     from './frontdesk/FrontDeskLayout';
import AdminLayout         from '../adminPanel/layout/AdminLayout';
import KitchenDashboard from './kitchen/KitchenDashboard';
import StaffMonitoringPage from './monitoring/StaffMonitoringPage';
import StaffLayout         from './StaffLayout';
import FoodOrdersFrontDeskPage from '../food/FoodOrdersFrontDeskPage';
import { getStoredUser } from '../../services/api';

function LayoutForRole({ children }) {
  const user = getStoredUser();
  const role = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);

  if (['admin', 'manager'].includes(role)) {
    return <AdminLayout>{children}</AdminLayout>;
  }
  if (['front_desk', 'receptionist'].includes(role)) {
    return <FrontDeskLayout>{children}</FrontDeskLayout>;
  }
  // housekeeping, maintenance, security, kitchen_staff
  return <StaffLayout>{children}</StaffLayout>;
}

// ── Front Desk pages ───────────────────────────────────────────────────────────
import FrontDeskDashboard   from './frontdesk/FrontDeskDashboard';
import RoomStatusBoard      from './frontdesk/RoomStatusBoard';
import TodayArrivalsPage    from './frontdesk/TodayArrivalsPage';
import CurrentCheckInsPage  from './frontdesk/CurrentCheckInsPage';
import WalkInBookingPage    from './frontdesk/WalkInBookingPage';
import BookingExtensionPage from './frontdesk/BookingExtensionPage';
import GuestCheckoutPage    from './frontdesk/GuestCheckoutPage';   // ← NEW
import CheckInPage          from './checkin/CheckInPage';
import GuestReviewPage      from '../review/GuestReviewPage';

// Shared admin page rendered inside FrontDeskLayout for front_desk staff
import PaymentListPage from '../adminPanel/PaymentListPage';

// ── Support Ticket page for Front Desk ────────────────────────────────────────
import FrontDeskSupportPage from '../chatbot/FrontDeskSupportPage';

// ── Staff management ───────────────────────────────────────────────────────────
import StaffListPage             from './profiles/StaffListPage';
import StaffDetailPage           from './profiles/StaffDetailPage';
import ShiftCalendarPage         from './shifts/ShiftCalendarPage';
import MyShiftPage               from './shifts/MyShiftPage';
import HousekeepingDashboard     from './housekeeping/HouseKeepingDashboard';
import MaintenanceTaskListPage   from './tasks/MaintenanceTaskListPage';
import IncidentLogListPage       from './incidents/IncidentLogListPage';
import IncidentLogFormPage       from './incidents/IncidentLogFormPage';
import ReportPage                from './reports/ReportPage';
import ActivityLogPage           from './activity/ActivityLogPage';
import MyActivityLogPage         from './activity/MyActivityLogPage';

// ── Reporting pages ────────────────────────────────────────────────────────────
import ReportMaintenancePage        from './reporting/ReportMaintenancePage';
import MyMaintenanceRequestsPage    from './reporting/MyMaintenanceRequestsPage';
import ReportIncidentPage           from './reporting/ReportIncidentPage';
import MyIncidentsPage              from './reporting/MyIncidentsPage';
import MaintenanceRequestsDashboard from './reporting/MaintenanceRequestsDashboard';

// ── Role groups — mirror permissions.py exactly ───────────────────────────────

const ADMIN_MANAGER     = ['admin', 'manager'];
const FRONT_DESK_ROLES  = ['admin', 'manager', 'front_desk', 'receptionist'];
const CLEANING_ROLES    = ['admin', 'manager', 'housekeeping'];
const MAINTENANCE_ROLES = ['admin', 'manager', 'maintenance'];
const INCIDENT_VIEW     = ['admin', 'manager', 'security'];
const KITCHEN_ROLES     = ['admin', 'manager', 'kitchen_staff'];
const INCIDENT_CREATE   = ['admin', 'security'];
const ALL_STAFF         = ['admin', 'manager', 'receptionist', 'front_desk',
                           'housekeeping', 'maintenance', 'security', 'kitchen_staff'];

// ── Reporting role groups ─────────────────────────────────────────────────────
const MAINTENANCE_REPORT_ROLES = ['admin', 'manager', 'front_desk', 'housekeeping'];
const INCIDENT_REPORT_ROLES    = ['admin', 'security', 'front_desk', 'housekeeping'];
const INCIDENT_VIEW_ROLES      = ['admin', 'manager', 'security', 'front_desk', 'housekeeping'];

export const staffRoutes = [

  // ════════════════════════════════════════════════════════════════════════════
  // REVIEW (public — no layout needed)
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="guest-review"
    path="/review/:token"
    element={<GuestReviewPage />}
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // FRONT DESK PAGES — FrontDeskLayout
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="front-desk-dashboard"
    path="/staff/front-desk"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <FrontDeskDashboard />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // FRONT DESK — FOOD ORDERS
  // ════════════════════════════════════════════════════════════════════════════
  <Route
    key="front-desk-food-orders"
    path="/staff/front-desk/food-orders"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <FoodOrdersFrontDeskPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="front-desk-rooms"
    path="/staff/front-desk/rooms"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <RoomStatusBoard />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="front-desk-today"
    path="/staff/front-desk/today"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <TodayArrivalsPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="front-desk-current-checkins"
    path="/staff/front-desk/current-check-ins"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <CurrentCheckInsPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="front-desk-walk-in"
    path="/staff/front-desk/walk-in"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <WalkInBookingPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="front-desk-extend"
    path="/staff/front-desk/extend"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <BookingExtensionPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  // ── Guest Checkout (NEW) ──────────────────────────────────────────────────
  // Reached from TodayArrivalsPage departures tab → "Check Out →" button.
  // Collects accommodation balance + pay_checkout food charges before
  // calling POST /bookings/admin/<pk>/checkout/.
  <Route
    key="front-desk-checkout"
    path="/staff/front-desk/checkout/:bookingId"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <GuestCheckoutPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  // ── Support Tickets for Front Desk (FIXED) ────────────────────────────────
  <Route
    key="front-desk-support"
    path="/staff/front-desk/support"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <FrontDeskSupportPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  // Legacy path redirect
  <Route
    key="front-desk-support-legacy"
    path="/front-desk/support"
    element={<Navigate to="/staff/front-desk/support" replace />}
  />,

  <Route
    key="front-desk-payments"
    path="/staff/front-desk/payments"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <PaymentListPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="check-in"
    path="/staff/check-in"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskLayout>
          <CheckInPage />
        </FrontDeskLayout>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // STAFF MONITORING
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="staff-monitoring"
    path="/staff/monitoring"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <AdminLayout>
          <StaffMonitoringPage />
        </AdminLayout>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // STAFF MANAGEMENT (Admin + Manager — AdminLayout)
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="staff-list"
    path="/staff/members"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <AdminLayout>
          <StaffListPage />
        </AdminLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="staff-detail"
    path="/staff/members/:pk"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <AdminLayout>
          <StaffDetailPage />
        </AdminLayout>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // SHIFTS
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="shift-calendar"
    path="/staff/shifts"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <AdminLayout>
          <ShiftCalendarPage />
        </AdminLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="my-shifts"
    path="/staff/my-shifts"
    element={
      <ProtectedRoute allowedRoles={ALL_STAFF}>
        <LayoutForRole>
          <MyShiftPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // HOUSEKEEPING TASKS
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="cleaning-tasks"
    path="/staff/cleaning"
    element={
      <ProtectedRoute allowedRoles={CLEANING_ROLES}>
        <LayoutForRole>
          <HousekeepingDashboard />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // MAINTENANCE TASKS
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="maintenance-tasks"
    path="/staff/maintenance"
    element={
      <ProtectedRoute allowedRoles={MAINTENANCE_ROLES}>
        <LayoutForRole>
          <MaintenanceTaskListPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // INCIDENT LOGS
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="incident-list"
    path="/staff/incidents"
    element={
      <ProtectedRoute allowedRoles={INCIDENT_VIEW}>
        <LayoutForRole>
          <IncidentLogListPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  <Route
    key="incident-new"
    path="/staff/incidents/new"
    element={
      <ProtectedRoute allowedRoles={INCIDENT_CREATE}>
        <LayoutForRole>
          <IncidentLogFormPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  <Route
    key="incident-edit"
    path="/staff/incidents/:pk/edit"
    element={
      <ProtectedRoute allowedRoles={INCIDENT_CREATE}>
        <LayoutForRole>
          <IncidentLogFormPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // REPORTS & AUDIT LOGS (Admin + Manager — AdminLayout)
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="reports"
    path="/staff/reports"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <AdminLayout>
          <ReportPage />
        </AdminLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="activity-logs"
    path="/staff/activity-logs"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <AdminLayout>
          <ActivityLogPage />
        </AdminLayout>
      </ProtectedRoute>
    }
  />,

  <Route
    key="my-activity-logs"
    path="/staff/my-activity-logs"
    element={
      <ProtectedRoute allowedRoles={ALL_STAFF}>
        <LayoutForRole>
          <MyActivityLogPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // MAINTENANCE REQUESTS DASHBOARD (Admin + Manager — AdminLayout)
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="maintenance-requests-dashboard"
    path="/staff/maintenance-requests"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <AdminLayout>
          <MaintenanceRequestsDashboard />
        </AdminLayout>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // REPORT MAINTENANCE (FD + HK + Admin/Manager)
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="report-maintenance"
    path="/staff/report-maintenance"
    element={
      <ProtectedRoute allowedRoles={MAINTENANCE_REPORT_ROLES}>
        <LayoutForRole>
          <ReportMaintenancePage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // MY MAINTENANCE REQUESTS
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="my-maintenance-requests"
    path="/staff/my-maintenance-requests"
    element={
      <ProtectedRoute allowedRoles={MAINTENANCE_REPORT_ROLES}>
        <LayoutForRole>
          <MyMaintenanceRequestsPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // REPORT INCIDENT
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="report-incident"
    path="/staff/report-incident"
    element={
      <ProtectedRoute allowedRoles={INCIDENT_REPORT_ROLES}>
        <LayoutForRole>
          <ReportIncidentPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // MY INCIDENTS
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="my-incidents"
    path="/staff/my-incidents"
    element={
      <ProtectedRoute allowedRoles={INCIDENT_VIEW_ROLES}>
        <LayoutForRole>
          <MyIncidentsPage />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // KITCHEN
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="kitchen-dashboard"
    path="/staff/kitchen"
    element={
      <ProtectedRoute allowedRoles={KITCHEN_ROLES}>
        <LayoutForRole>
          <KitchenDashboard />
        </LayoutForRole>
      </ProtectedRoute>
    }
  />,
];