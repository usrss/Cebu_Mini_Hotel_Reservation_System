import { Route } from 'react-router-dom';
import MyBookingsPage          from './MyBookingsPage.jsx';
import MyBookingDetailPage     from './MyBookingDetailPage';
import BookingConfirmationPage from './BookingConfirmationPage.jsx';
import BookingReschedulePage   from './BookingReschedulePage.jsx';
import BookingExtendPage       from './BookingExtendPage.jsx';

export const bookingRoutes = [
  <Route key="my-bookings"    path="/bookings/my"                    element={<MyBookingsPage />} />,
  <Route key="my-booking"     path="/bookings/my/:id"                element={<MyBookingDetailPage />} />,
  <Route key="confirmation"   path="/bookings/confirmation/:id"      element={<BookingConfirmationPage />} />,
  <Route key="reschedule"     path="/bookings/my/:id/reschedule"     element={<BookingReschedulePage />} />,
  <Route key="extend"         path="/bookings/my/:id/extend"         element={<BookingExtendPage />} />,
];

/**
 * Route map for reference:
 *
 *   /bookings/my                      → MyBookingsPage         (booking list)
 *   /bookings/my/:id                  → MyBookingDetailPage    (detail + cancel)
 *   /bookings/confirmation/:id        → BookingConfirmationPage (post-create)
 *   /bookings/my/:id/reschedule       → BookingReschedulePage  (reschedule)
 *   /bookings/my/:id/extend           → BookingExtendPage      (extend stay)
 *
 * The booking form lives inside /rooms/:id (RoomDetailPage sidebar).
 * After successful booking creation it navigates to /bookings/confirmation/:id.
 */