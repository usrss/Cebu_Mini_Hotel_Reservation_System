import { Route } from 'react-router-dom';
import PaymentPage        from './PaymentPage.jsx';
import PaymentSuccessPage from './PaymentSuccessPage.jsx';
import PaymentCancelPage  from './PaymentCancelPage.jsx';

export const paymentRoutes = [
  // User picks payment method + type for a booking
  <Route key="payment"         path="/payments/:bookingId"  element={<PaymentPage />} />,

  // Provider redirect back after checkout
  <Route key="payment-success" path="/payments/success"     element={<PaymentSuccessPage />} />,
  <Route key="payment-cancel"  path="/payments/cancel"      element={<PaymentCancelPage />} />,

  // Verify a specific payment (also used for manual/cash)
  <Route key="payment-verify"  path="/payments/verify"      element={<PaymentSuccessPage />} />,
];

/**
 * Route map for reference:
 *
 *   /payments/:bookingId   → PaymentPage        (method select + initiate)
 *   /payments/success      → PaymentSuccessPage (poll + show receipt)
 *   /payments/cancel       → PaymentCancelPage  (user cancelled at provider)
 *   /payments/verify       → PaymentSuccessPage (same component, different entry)
 *
 * After booking is created (BookingConfirmationPage), add a "Pay Now" button:
 *   <Link to={`/payments/${booking.id}`}>Pay Now</Link>
 */