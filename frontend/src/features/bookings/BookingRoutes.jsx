import { Route } from 'react-router-dom';
import MyBookingsPage          from './MyBookingsPage.jsx';
import BookingConfirmationPage from './BookingConfirmationPage.jsx';
import BookingReschedulePage   from './BookingReschedulePage.jsx';
import BookingExtendPage       from './BookingExtendPage.jsx';

export const bookingRoutes = [
  <Route key="my-bookings"  path="/bookings/my"                element={<MyBookingsPage />} />,
  <Route key="confirmation" path="/bookings/confirmation/:id"  element={<BookingConfirmationPage />} />,
  <Route key="reschedule"   path="/bookings/my/:id/reschedule" element={<BookingReschedulePage />} />,
  <Route key="extend"       path="/bookings/my/:id/extend"     element={<BookingExtendPage />} />,
];

/**
 * Route map:
 *
 *   /bookings/my                      → MyBookingsPage         (list + inline modal)
 *   /bookings/confirmation/:id        → BookingConfirmationPage (post-payment)
 *   /bookings/my/:id/reschedule       → BookingReschedulePage
 *   /bookings/my/:id/extend           → BookingExtendPage
 *
 * NOTE: /bookings/my/:id (MyBookingDetailPage) has been removed.
 * Full booking detail is now surfaced via the BookingDetailModal inside MyBookingsPage.
 *
 * The booking form lives inside /rooms/:id (RoomDetailPage sidebar).
 * After successful booking creation it navigates to /bookings/confirmation/:id.
 */