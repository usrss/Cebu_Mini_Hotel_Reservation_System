/**
 * src/features/staff/hooks/useStaffRole.js
 *
 * Returns the current user's effective_role and granular permission flags.
 * Mirrors the strict RBAC definitions from staff/permissions.py.
 *
 * Always reads effective_role — never role directly.
 * Respects temp_role overrides automatically because the backend
 * serializer returns effective_role in the login response.
 *
 * ROLE PHILOSOPHY:
 *  - admin   → monitors, audits, manages staff accounts. Does NOT do
 *              operational work (no assigning tasks, no logging incidents).
 *  - manager → handles all hotel operations: assigns tasks, reviews requests,
 *              manages incidents. Cannot manage staff accounts.
 */

import { getStoredUser } from '../../../services/api';

export const STAFF_ROLES = {
  ADMIN:        'admin',
  MANAGER:      'manager',
  RECEPTIONIST: 'receptionist',
  FRONT_DESK:   'front_desk',
  HOUSEKEEPING: 'housekeeping',
  MAINTENANCE:  'maintenance',
  SECURITY:     'security',
};

export function useStaffRole() {
  const user = getStoredUser();

  // effective_role is set by the backend serializer and respects temp_role.
  // Fallback: if staff_profile isn't present yet (pre-serializer-fix session),
  // treat is_staff=true as admin so existing sessions aren't locked out.
  const role =
    user?.staff_profile?.effective_role ??
    (user?.is_staff ? STAFF_ROLES.ADMIN : null);

  const is = (...roles) => roles.includes(role);

  return {
    role,

    // ── Staff account management ──────────────────────────────────────────
    // Admin only — manager explicitly excluded.
    // Manager can VIEW the staff list (needs to know who's available to assign).
    canViewStaffList:   is('admin', 'manager'),  // read-only for manager
    canCreateStaff:     is('admin'),
    canEditStaff:       is('admin'),
    canDeleteStaff:     is('admin'),
    canPromoteStaff:    is('admin'),
    canDeactivateStaff: is('admin'),
    canAssignTempRole:  is('admin'),

    // ── Shift management ──────────────────────────────────────────────────
    // Manager creates/edits/deletes shifts (operational scheduling).
    // Admin does not schedule — they monitor attendance and reports.
    canManageShifts:  is('manager'),
    canViewOwnShifts: !!role,  // every active role sees their own shifts

    // ── Reservation management ────────────────────────────────────────────
    // Manager + Receptionist manage reservations.
    // Admin excluded — not their day-to-day job.
    canManageReservations: is('manager', 'receptionist'),

    // ── Check-in / check-out ──────────────────────────────────────────────
    // Front Desk does the work. Manager for oversight. Admin excluded.
    canHandleCheckInOut: is('manager', 'front_desk'),

    // ── Cleaning tasks ────────────────────────────────────────────────────
    // Manager assigns and creates cleaning tasks (operational).
    // Admin can view for monitoring but cannot create or assign.
    canManageCleaning: is('manager'),                          // create + assign
    canAccessCleaning: is('admin', 'manager', 'housekeeping'), // view only for admin

    // ── Maintenance tasks (execution layer) ───────────────────────────────
    // Manager assigns and creates maintenance tasks (operational).
    // Admin can view for monitoring but cannot create or assign.
    canManageMaintenance: is('manager'),                           // create + assign
    canAccessMaintenance: is('admin', 'manager', 'maintenance'),   // view only for admin

    // ── Maintenance Requests (reporting layer) ────────────────────────────
    // FD + HK submit requests. Manager reviews and converts them.
    // Admin can view the queue for monitoring but does not action them.
    canSubmitMaintenanceRequest:  is('manager', 'front_desk', 'housekeeping'),
    canViewMaintenanceRequests:   is('admin', 'manager', 'front_desk', 'housekeeping'),
    canManageMaintenanceRequests: is('manager'),  // review + convert — manager only

    // ── Incident logs ─────────────────────────────────────────────────────
    // Security, FD, HK report incidents.
    // Admin does NOT report incidents — they audit and monitor.
    canReportIncident: is('security', 'front_desk', 'housekeeping'),

    // View incidents: FD/HK see own (scoped server-side); others see all.
    canViewOwnIncidents: is('admin', 'manager', 'security', 'front_desk', 'housekeeping'),

    // Full incident log — admin monitors, manager manages, security sees all.
    canViewIncidents: is('admin', 'manager', 'security'),

    // Incident review dashboard — update status, assign to security.
    // Manager only — admin views the log but does not action incidents.
    canManageIncidents: is('manager'),
    canAssignIncident:  is('manager'),

    // Security staff log new incidents via IncidentLogFormPage.
    canLogIncident:     is('security'),
    canCreateIncidents: is('security'),  // backward compat alias

    // ── Reports & analytics ───────────────────────────────────────────────
    // Both see reports — admin for auditing, manager for operational oversight.
    canViewReports:      is('admin', 'manager'),
    canViewActivityLogs: is('admin', 'manager'),

    // ── Monitoring & dashboard ────────────────────────────────────────────
    // Admin's primary responsibility. Manager also has access.
    canViewMonitoring: is('admin', 'manager'),
    canViewDashboard:  is('admin', 'manager'),

    // ── Task assignment ───────────────────────────────────────────────────
    // Manager only — assigning is an operational action, not admin's job.
    canAssignHousekeeping: is('manager'),
    canAssignMaintenance:  is('manager'),
  };
}