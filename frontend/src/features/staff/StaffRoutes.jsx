/**
 * src/features/staff/StaffRoutes.jsx
 *
 * Route definitions for the entire Staff module.
 * allowedRoles on each ProtectedRoute mirrors staff/permissions.py exactly.
 *
 * In App.jsx:
 *   import { staffRoutes } from './features/staff/StaffRoutes';
 *   // inside <Routes>:
 *   {staffRoutes}
 *
 * Layout matrix:
 *   admin / manager  → AdminLayout     (no wrapper here — AdminLayout is
 *                                       already mounted in App.jsx /admin/*)
 *   front_desk       → FrontDeskLayout
 *   housekeeping     → StaffLayout
 *   maintenance      → StaffLayout
 *   security         → StaffLayout
 *   receptionist     → StaffLayout     (my-shifts / my-activity-logs only)
 */

import { Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';

// ── Layouts ────────────────────────────────────────────────────────────────────
import FrontDeskLayout from './frontdesk/FrontDeskLayout';
import AdminLayout     from '../adminPanel/layout/AdminLayout';
import StaffMonitoringPage from './monitoring/StaffMonitoringPage';
import StaffLayout     from './StaffLayout';

// ── Role-aware layout helper ───────────────────────────────────────────────────
import { getStoredUser } from '../../services/api';
function LayoutForRole({ children }) {
  const user = getStoredUser();
  const role = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);

  if (['admin', 'manager'].includes(role)) {
    return <AdminLayout>{children}</AdminLayout>;
  }
  if (role === 'front_desk') {
    return <FrontDeskLayout>{children}</FrontDeskLayout>;
  }
  // housekeeping, maintenance, security, receptionist
  return <StaffLayout>{children}</StaffLayout>;
}

// ── Front Desk pages ───────────────────────────────────────────────────────────
import FrontDeskDashboard  from './frontdesk/FrontDeskDashboard';
import RoomStatusBoard     from './frontdesk/RoomStatusBoard';
import TodayArrivalsPage   from './frontdesk/TodayArrivalsPage';
import WalkInBookingPage   from './frontdesk/WalkInBookingPage';
import CheckInPage         from './checkin/CheckInPage';

// Shared admin page rendered inside FrontDeskLayout for front_desk staff
import PaymentListPage     from '../adminPanel/PaymentListPage';

// ── Staff management ───────────────────────────────────────────────────────────
import StaffListPage           from './profiles/StaffListPage';
import StaffDetailPage         from './profiles/StaffDetailPage';
import ShiftCalendarPage       from './shifts/ShiftCalendarPage';
import MyShiftPage             from './shifts/MyShiftPage';
import HousekeepingDashboard   from './housekeeping/HouseKeepingDashboard';
import MaintenanceTaskListPage from './tasks/MaintenanceTaskListPage';
import IncidentLogListPage     from './incidents/IncidentLogListPage';
import IncidentLogFormPage     from './incidents/IncidentLogFormPage';
import ReportPage              from './reports/ReportPage';
import ActivityLogPage         from './activity/ActivityLogPage';
import MyActivityLogPage       from './activity/MyActivityLogPage';

// ── Reporting pages (NEW) ──────────────────────────────────────────────────────
import ReportMaintenancePage        from './reporting/ReportMaintenancePage';
import MyMaintenanceRequestsPage    from './reporting/MyMaintenanceRequestsPage';
import ReportIncidentPage           from './reporting/ReportIncidentPage';
import MyIncidentsPage              from './reporting/MyIncidentsPage';
import MaintenanceRequestsDashboard from './reporting/MaintenanceRequestsDashboard';

// ── Role groups — mirror permissions.py exactly ───────────────────────────────

const ADMIN_MANAGER     = ['admin', 'manager'];
const FRONT_DESK_ROLES  = ['admin', 'manager', 'front_desk'];
const CLEANING_ROLES    = ['admin', 'manager', 'housekeeping'];
const MAINTENANCE_ROLES = ['admin', 'manager', 'maintenance'];
const INCIDENT_VIEW     = ['admin', 'manager', 'security'];
const INCIDENT_CREATE   = ['admin', 'security'];
const ALL_STAFF         = ['admin', 'manager', 'receptionist', 'front_desk',
                           'housekeeping', 'maintenance', 'security'];

// ── Reporting role groups (NEW) ───────────────────────────────────────────────
const MAINTENANCE_REPORT_ROLES = ['admin', 'manager', 'front_desk', 'housekeeping'];
const INCIDENT_REPORT_ROLES    = ['admin', 'security', 'front_desk', 'housekeeping'];
const INCIDENT_VIEW_ROLES      = ['admin', 'manager', 'security', 'front_desk', 'housekeeping'];

export const staffRoutes = [

  // ════════════════════════════════════════════════════════════════════════════
  // FRONT DESK PAGES  — always FrontDeskLayout
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
  key="staff-monitoring"
  path="/staff/monitoring"
  element={
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <AdminLayout>
        <StaffMonitoringPage />
      </AdminLayout>
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

  // ════════════════════════════════════════════════════════════════════════════
  // STAFF MANAGEMENT  (Admin + Manager — AdminLayout)
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
  // admin / manager  → AdminLayout   (manager view-only)
  // security         → StaffLayout   (create + edit own incidents)
  // front_desk / hk  → own incidents via /staff/my-incidents
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
  // REPORTS & AUDIT LOGS  (Admin + Manager — AdminLayout)
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
  // MAINTENANCE REQUESTS DASHBOARD  (Admin + Manager — AdminLayout)
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
  // REPORT MAINTENANCE  (FD + HK → FrontDeskLayout/StaffLayout; Admin/Manager → AdminLayout)
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
  // MY MAINTENANCE REQUESTS  (FD + HK: own; Admin/Manager: all)
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
  // REPORT INCIDENT  (FD + HK + Security + Admin)
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
  // MY INCIDENTS  (FD + HK: own only; Security/Admin/Manager: all)
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
];