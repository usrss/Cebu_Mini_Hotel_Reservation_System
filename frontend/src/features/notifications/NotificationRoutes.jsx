
import { Route } from 'react-router-dom';
import NotificationsPage from './NotificationsPage';

export const notificationRoutes = [
  <Route
    key="notifications"
    path="/notifications"
    element={<NotificationsPage />}
  />,
];

/**
 * Route map:
 *
 *   /notifications   → NotificationsPage  (full list with filter tabs)
 *
 * The bell icon + dropdown panel (NotificationBell) is placed
 * directly in your nav-bar layout component — it does not need a route.
 */