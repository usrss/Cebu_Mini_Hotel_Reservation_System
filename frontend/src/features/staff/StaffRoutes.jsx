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
 */

import { Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';

// ── Front Desk ─────────────────────────────────────────────────────────────────
import FrontDeskDashboard  from './frontdesk/FrontDeskDashboard';
import RoomStatusBoard     from './frontdesk/RoomStatusBoard';
import TodayArrivalsPage   from './frontdesk/TodayArrivalsPage';
import WalkInBookingPage   from './frontdesk/WalkInBookingPage';
import CheckInPage         from './checkin/CheckInPage';


// ── Staff management ───────────────────────────────────────────────────────────
import StaffListPage           from './profiles/StaffListPage';
import StaffDetailPage         from './profiles/StaffDetailPage';
import ShiftCalendarPage       from './shifts/ShiftCalendarPage';
import MyShiftPage             from './shifts/MyShiftPage';
import CleaningTaskListPage    from './tasks/CleaningTaskListPage';
import MaintenanceTaskListPage from './tasks/MaintenanceTaskListPage';
import IncidentLogListPage     from './incidents/IncidentLogListPage';
import IncidentLogFormPage     from './incidents/IncidentLogFormPage';
import ReportPage              from './reports/ReportPage';
import ActivityLogPage         from './activity/ActivityLogPage';
import MyActivityLogPage       from './activity/MyActivityLogPage';

// ── Role groups — mirror permissions.py exactly ───────────────────────────────

const ADMIN_MANAGER     = ['admin', 'manager'];
const FRONT_DESK_ROLES  = ['admin', 'manager', 'front_desk'];
const CLEANING_ROLES    = ['admin', 'manager', 'housekeeping'];
const MAINTENANCE_ROLES = ['admin', 'manager', 'maintenance'];
const INCIDENT_VIEW     = ['admin', 'manager', 'security'];
const INCIDENT_CREATE   = ['admin', 'security'];
const ALL_STAFF         = ['admin', 'manager', 'receptionist', 'front_desk',
                            'housekeeping', 'maintenance', 'security'];

export const staffRoutes = [

  // ════════════════════════════════════════════════════════════════════════════
  // FRONT DESK PAGES
  // front_desk, admin, manager only
  // ════════════════════════════════════════════════════════════════════════════

  // Landing dashboard — room stats, today summary, quick links
  <Route
    key="front-desk-dashboard"
    path="/staff/front-desk"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <FrontDeskDashboard />
      </ProtectedRoute>
    }
  />,

  // Live room status grid — all rooms, filterable by status/type/floor
  <Route
    key="front-desk-rooms"
    path="/staff/front-desk/rooms"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <RoomStatusBoard />
      </ProtectedRoute>
    }
  />,

  // Today's arrivals (check_in=today, confirmed) + departures (check_out=today, checked_in)
  <Route
    key="front-desk-today"
    path="/staff/front-desk/today"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <TodayArrivalsPage />
      </ProtectedRoute>
    }
  />,

  // Walk-in booking: create booking + collect payment + optionally check in
  <Route
    key="front-desk-walk-in"
    path="/staff/front-desk/walk-in"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <WalkInBookingPage />
      </ProtectedRoute>
    }
  />,

  // Guest check-in panel: QR scan / manual entry, PIN verify, deposit handling
  <Route
    key="check-in"
    path="/staff/check-in"
    element={
      <ProtectedRoute allowedRoles={FRONT_DESK_ROLES}>
        <CheckInPage />
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // STAFF MANAGEMENT  (Admin + Manager)
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="staff-list"
    path="/staff/members"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <StaffListPage />
      </ProtectedRoute>
    }
  />,
  <Route
    key="staff-detail"
    path="/staff/members/:pk"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <StaffDetailPage />
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
        <ShiftCalendarPage />
      </ProtectedRoute>
    }
  />,
  <Route
    key="my-shifts"
    path="/staff/my-shifts"
    element={
      <ProtectedRoute allowedRoles={ALL_STAFF}>
        <MyShiftPage />
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // TASKS
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="cleaning-tasks"
    path="/staff/cleaning"
    element={
      <ProtectedRoute allowedRoles={CLEANING_ROLES}>
        <CleaningTaskListPage />
      </ProtectedRoute>
    }
  />,
  <Route
    key="maintenance-tasks"
    path="/staff/maintenance"
    element={
      <ProtectedRoute allowedRoles={MAINTENANCE_ROLES}>
        <MaintenanceTaskListPage />
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // INCIDENT LOGS  (Security + Admin; Manager view-only)
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="incident-list"
    path="/staff/incidents"
    element={
      <ProtectedRoute allowedRoles={INCIDENT_VIEW}>
        <IncidentLogListPage />
      </ProtectedRoute>
    }
  />,
  <Route
    key="incident-new"
    path="/staff/incidents/new"
    element={
      <ProtectedRoute allowedRoles={INCIDENT_CREATE}>
        <IncidentLogFormPage />
      </ProtectedRoute>
    }
  />,
  <Route
    key="incident-edit"
    path="/staff/incidents/:pk/edit"
    element={
      <ProtectedRoute allowedRoles={INCIDENT_CREATE}>
        <IncidentLogFormPage />
      </ProtectedRoute>
    }
  />,

  // ════════════════════════════════════════════════════════════════════════════
  // REPORTS & LOGS  (Admin + Manager)
  // ════════════════════════════════════════════════════════════════════════════

  <Route
    key="reports"
    path="/staff/reports"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <ReportPage />
      </ProtectedRoute>
    }
  />,
  <Route
    key="activity-logs"
    path="/staff/activity-logs"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <ActivityLogPage />
      </ProtectedRoute>
    }
  />,

  // All staff: view their own activity log only
  <Route
    key="my-activity-logs"
    path="/staff/my-activity-logs"
    element={
      <ProtectedRoute allowedRoles={ALL_STAFF}>
        <MyActivityLogPage />
      </ProtectedRoute>
    }
  />,
];