/**
 * src/features/staff/hooks/useStaffRole.js
 *
 * Returns the current user's effective_role and granular permission flags.
 * Mirrors the useAdminRole.js pattern from the adminPanel feature.
 *
 * Always reads effective_role (respects temp role overrides).
 */

import { getStoredUser } from '../../../services/api';
import { STAFF_ROLES } from '../services/staffApi';

export function useStaffRole() {
  const user = getStoredUser();

  // effective_role respects temp_role overrides — always use this, never role directly
  const role =
    user?.staff_profile?.effective_role ??
    (user?.is_staff ? STAFF_ROLES.ADMIN : null);

  const is = (...roles) => roles.includes(role);

  return {
    role,

    // ── Staff management ──────────────────────────────────────────────────
    canViewStaffList:   is('admin', 'manager'),
    canCreateStaff:     is('admin'),
    canEditStaff:       is('admin'),
    canDeleteStaff:     is('admin'),
    canPromoteStaff:    is('admin'),
    canDeactivateStaff: is('admin'),

    // ── Shifts ────────────────────────────────────────────────────────────
    canManageShifts:    is('admin', 'manager'),
    canViewOwnShifts:   !!role,   // all staff

    // ── Tasks ─────────────────────────────────────────────────────────────
    canManageCleaning:    is('admin', 'manager'),
    canDoHousekeeping:    is('housekeeping', 'admin', 'manager'),
    canManageMaintenance: is('admin', 'manager'),
    canDoMaintenance:     is('maintenance', 'admin', 'manager'),

    // ── Incidents ─────────────────────────────────────────────────────────
    canLogIncidents:  is('security', 'admin'),
    canViewIncidents: is('admin', 'manager', 'security'),

    // ── Reports & logs ────────────────────────────────────────────────────
    canViewReports:      is('admin', 'manager'),
    canViewActivityLogs: is('admin', 'manager'),

    // ── Monitoring ────────────────────────────────────────────────────────
    canViewMonitoring: is('admin', 'manager'),
  };
}