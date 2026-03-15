/**
 * src/features/staff/StaffRoutes.jsx
 *
 * Exports staffRoutes array to be spread into <Routes> in App.jsx.
 * Follows the same pattern as bookingRoutes / paymentRoutes.
 *
 * In App.jsx add:
 *   import { staffRoutes } from './features/staff/StaffRoutes';
 *   // then inside <Routes>:
 *   {staffRoutes}
 */

import { Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';

import StaffListPage          from './profiles/StaffListPage';
import StaffDetailPage        from './profiles/StaffDetailPage';
import ShiftCalendarPage      from './shifts/ShiftCalendarPage';
import MyShiftPage            from './shifts/MyShiftPage';
import CleaningTaskListPage   from './tasks/CleaningTaskListPage';
import MaintenanceTaskListPage from './tasks/MaintenanceTaskListPage';
import IncidentLogListPage    from './incidents/IncidentLogListPage';
import IncidentLogFormPage    from './incidents/IncidentLogFormPage';
import ReportPage             from './reports/ReportPage';
import ActivityLogPage        from './activity/ActivityLogPage';


const ADMIN_MANAGER       = ['admin', 'manager'];
const ADMIN_ONLY          = ['admin'];
const HOUSEKEEPING_ROLES  = ['admin', 'manager', 'housekeeping'];
const MAINTENANCE_ROLES   = ['admin', 'manager', 'maintenance'];
const SECURITY_ROLES      = ['admin', 'manager', 'security'];
const ALL_STAFF           = ['admin', 'manager', 'receptionist', 'front_desk',
                             'housekeeping', 'maintenance', 'security'];

export const staffRoutes = [

  /* ── Staff Profiles ──────────────────────────────────────────────────── */
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

  /* ── Shifts ──────────────────────────────────────────────────────────── */
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

  /* ── Tasks ───────────────────────────────────────────────────────────── */
  <Route
    key="cleaning-tasks"
    path="/staff/cleaning"
    element={
      <ProtectedRoute allowedRoles={HOUSEKEEPING_ROLES}>
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

  /* ── Incidents ───────────────────────────────────────────────────────── */
  <Route
    key="incident-list"
    path="/staff/incidents"
    element={
      <ProtectedRoute allowedRoles={SECURITY_ROLES}>
        <IncidentLogListPage />
      </ProtectedRoute>
    }
  />,

  <Route
    key="incident-form"
    path="/staff/incidents/new"
    element={
      <ProtectedRoute allowedRoles={['admin', 'security']}>
        <IncidentLogFormPage />
      </ProtectedRoute>
    }
  />,

  <Route
    key="incident-edit"
    path="/staff/incidents/:pk/edit"
    element={
      <ProtectedRoute allowedRoles={SECURITY_ROLES}>
        <IncidentLogFormPage />
      </ProtectedRoute>
    }
  />,

  /* ── Reports ─────────────────────────────────────────────────────────── */
  <Route
    key="reports"
    path="/staff/reports"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <ReportPage />
      </ProtectedRoute>
    }
  />,

  /* ── Activity Logs ───────────────────────────────────────────────────── */
  <Route
    key="activity-logs"
    path="/staff/activity-logs"
    element={
      <ProtectedRoute allowedRoles={ADMIN_MANAGER}>
        <ActivityLogPage />
      </ProtectedRoute>
    }
  />,
];