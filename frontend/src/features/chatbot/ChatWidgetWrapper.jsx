/**
 * src/features/chatbot/ChatWidgetWrapper.jsx
 *
 * Route-aware wrapper for the ChatWidget.
 * Mount this ONCE in App.jsx (or your root router layout) instead of
 * mounting ChatWidget directly.
 *
 * The widget is HIDDEN on all staff/admin routes so it never appears
 * for receptionists, managers, or admins.
 * It is VISIBLE on all guest-facing routes (homepage, dashboard, rooms, etc.)
 *
 * Usage in App.jsx:
 *   import ChatWidgetWrapper from './features/chatbot/ChatWidgetWrapper';
 *   // Inside your router/layout:
 *   <ChatWidgetWrapper />
 */

import { useLocation } from 'react-router-dom';
import ChatWidget from './ChatWidget';
import { getStoredUser } from '../../services/api';

/**
 * Route prefixes on which the widget should NOT appear.
 * Add any new staff/admin route prefixes here.
 */
const STAFF_ROUTE_PREFIXES = [
  '/admin',
  '/staff',
  '/dashboard/staff',
  '/dashboard/admin',
  '/front-desk',
  '/frontdesk',
  '/manager',
  '/support',          // staff support ticket dashboard
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

/**
 * Returns true if the widget should be hidden on the current route.
 */
function isStaffRoute(pathname) {
  const lower = pathname.toLowerCase();
  return STAFF_ROUTE_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Returns true if the currently stored user is a staff member.
 * We hide the widget for staff regardless of route, because staff
 * have their own support dashboard.
 */
function isStaffUser() {
  try {
    const user = getStoredUser();
    if (!user) return false;
    // Django sets is_staff=true for all staff roles
    return Boolean(user.is_staff);
  } catch {
    return false;
  }
}

export default function ChatWidgetWrapper() {
  const { pathname } = useLocation();

  // Hide on staff routes or for staff users
  if (isStaffRoute(pathname) || isStaffUser()) {
    return null;
  }

  return <ChatWidget />;
}