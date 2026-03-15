/**
 * useAdminRole.js
 * Returns the current user's role and permission flags.
 *
 * Since the login response does NOT include staff_profile,
 * we fall back to is_staff to determine access level.
 *
 * Once your backend includes staff_profile in the login response,
 * replace the fallback line with:
 *   const role = user?.staff_profile?.effective_role ?? null;
 */

import { getStoredUser } from '../../services/api';

export function useAdminRole() {
  const user = getStoredUser();

  // Use staff_profile if available, otherwise fall back to is_staff
  const role = user?.staff_profile?.effective_role
    ?? (user?.is_staff ? 'admin' : null);

  return {
    role,
    canViewGuests:     ['admin', 'manager', 'receptionist', 'front_desk'].includes(role),
    canModifyGuests:   ['admin', 'manager'].includes(role),
    canManagePayments: ['admin', 'manager', 'front_desk'].includes(role),
    canRefund:         ['admin', 'manager'].includes(role),
    canManageReviews:  ['admin', 'manager'].includes(role),
  };
}