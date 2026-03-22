/**
 * src/features/staff/hooks/useStaffRole.js
 *
 * Returns the current user's effective_role and granular permission flags.
 * Mirrors the strict RBAC definitions from staff/permissions.py.
 *
 * Always reads effective_role — never role directly.
 * Respects temp_role overrides automatically because the backend
 * serializer returns effective_role in the login response.
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
    // Admin only — Manager explicitly excluded per prompt
    canViewStaffList:   is('admin', 'manager'),   // Manager can view, not modify
    canCreateStaff:     is('admin'),
    canEditStaff:       is('admin'),
    canDeleteStaff:     is('admin'),
    canPromoteStaff:    is('admin'),
    canDeactivateStaff: is('admin'),
    canAssignTempRole:  is('admin'),

    // ── Shift management ──────────────────────────────────────────────────
    canManageShifts:  is('admin', 'manager'),   // create/edit/delete all shifts
    canViewOwnShifts: !!role,                   // every role — via /my-shifts/

    // ── Reservation management ────────────────────────────────────────────
    // Receptionist: create/modify/cancel/view reservations
    // Front Desk does NOT get this — they use check-in/out instead
    canManageReservations: is('admin', 'manager', 'receptionist'),

    // ── Check-in / check-out ──────────────────────────────────────────────
    // Front Desk only (+ admin/manager)
    // Receptionist is explicitly excluded per prompt
    canHandleCheckInOut: is('admin', 'manager', 'front_desk'),

    // ── Cleaning tasks ────────────────────────────────────────────────────
    canManageCleaning:  is('admin', 'manager'),                // create + assign
    canAccessCleaning:  is('admin', 'manager', 'housekeeping'), // view + status update

    // ── Maintenance tasks (execution layer) ───────────────────────────────
    canManageMaintenance:  is('admin', 'manager'),               // create + assign
    canAccessMaintenance:  is('admin', 'manager', 'maintenance'), // view + status update

    // ── Maintenance Requests (reporting layer) ────────────────────────────
    // Submit a new maintenance request (FD + HK + Admin + Manager)
    canSubmitMaintenanceRequest: is('admin', 'manager', 'front_desk', 'housekeeping'),

    // View requests: FD/HK see own; Admin/Manager see all (scoped server-side)
    canViewMaintenanceRequests: is('admin', 'manager', 'front_desk', 'housekeeping'),

    // Review + convert requests (Admin/Manager only)
    canManageMaintenanceRequests: is('admin', 'manager'),

    // ── Incident logs ─────────────────────────────────────────────────────
    // Create/report an incident — expanded to FD + HK
    canReportIncident:  is('admin', 'security', 'front_desk', 'housekeeping'),

    // View incidents: FD/HK see own; Admin/Manager/Security see all (scoped server-side)
    canViewOwnIncidents: is('admin', 'manager', 'security', 'front_desk', 'housekeeping'),

    // Legacy flags — kept for backward compatibility with existing pages
    canCreateIncidents: is('admin', 'security'),             // log new incidents
    canViewIncidents:   is('admin', 'manager', 'security'),  // Manager view-only

    // ── Reports & analytics ───────────────────────────────────────────────
    canViewReports:      is('admin', 'manager'),
    canViewActivityLogs: is('admin', 'manager'),

    // ── Monitoring dashboard ──────────────────────────────────────────────
    canViewMonitoring:   is('admin', 'manager'),
    canViewDashboard:    is('admin', 'manager'),
  };
}