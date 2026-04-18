/**
 * src/features/adminPanel/hooks/useAdminRole.js
 *
 * Returns the current staff user's role and derived permission flags.
 */

import { useState, useEffect } from 'react';
import { getStoredUser, getCurrentUser } from '../../services/api';

// Helper to extract role from various user object shapes
function extractRole(user) {
  if (!user) return null;

  // Try different possible paths for the role
  return user?.staff_profile?.effective_role
      || user?.staff_profile?.role
      || user?.role
      || (user?.is_staff ? 'admin' : null)
      || null;
}

export function useAdminRole() {
  const [role, setRole] = useState(() => {
    const u = getStoredUser();
    return extractRole(u);
  });

  const [loading, setLoading] = useState(() => {
    const u = getStoredUser();
    return !extractRole(u);
  });

  useEffect(() => {
    if (role) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          const extractedRole = extractRole(user);
          setRole(extractedRole);
        }
      })
      .catch(() => {
        // Ignore — user may not be authenticated yet.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // ── Derived permissions ───────────────────────────────────────────────────
  const isAdmin       = role === 'admin';
  const isManager     = role === 'manager';
  const isReceptionist = role === 'receptionist';
  const isFrontDesk   = role === 'front_desk';
  const isHousekeeping = role === 'housekeeping';
  const isMaintenance  = role === 'maintenance';
  const isSecurity     = role === 'security';
  const isKitchenStaff = role === 'kitchen_staff';

  // Guest management permissions
  const canViewGuests   = isAdmin || isManager || isReceptionist || isFrontDesk;
  const canModifyGuests = isAdmin || isManager;

  // Payment permissions
  const canManagePayments = isAdmin || isManager || isFrontDesk;
  const canRefund         = isAdmin || isManager;

  // Review permissions
  const canManageReviews = isAdmin || isManager;

  // Report permissions
  const canViewReports = isAdmin || isManager;

  // Staff management
  const canManageStaff = isAdmin;

  // Settings
  const canManageSettings = isAdmin;

  // Room management
  const canViewRooms   = isAdmin || isManager || isHousekeeping || isMaintenance;
  const canManageRooms = isAdmin || isManager;

  // Operations
  const canViewOperations   = isAdmin || isManager;
  const canManageOperations = isAdmin || isManager;

  // Food menu
  const canManageFoodMenu = isAdmin;

  return {
    role,
    loading,
    isAdmin,
    isManager,
    isReceptionist,
    isFrontDesk,
    isHousekeeping,
    isMaintenance,
    isSecurity,
    isKitchenStaff,

    // Permission flags - THESE WERE MISSING in your original file
    canViewGuests,
    canModifyGuests,
    canManagePayments,
    canRefund,
    canManageReviews,
    canViewReports,
    canManageStaff,
    canManageSettings,
    canViewRooms,
    canManageRooms,
    canViewOperations,
    canManageOperations,
    canManageFoodMenu,
  };
}

export default useAdminRole;