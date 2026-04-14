/**
 * PaymentCancelPage.jsx — Cebu Mini Hotel · Editorial Light Theme
 * ================================================================
 * Redesigned to match Dashboard.css palette and design language.
 * No emoji. Lucide icons.
 */

import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CreditCard, ArrowRight } from 'lucide-react';
import './PaymentCancelPage.css';

export default function PaymentCancelPage() {
  const [searchParams] = useSearchParams();
  const paymentId      = searchParams.get('payment_id');

  return (
    <div className="pcp-page">

      {/* Nav */}
      <div className="pcp-nav">
        <div className="pcp-nav-inner">
          <Link to="/bookings/my" className="pcp-back-link">
            <ArrowLeft size={16} />
            My Bookings
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="pcp-container">
        <div className="pcp-card">

          {/* Icon */}
          <div className="pcp-status-icon">
            <AlertCircle size={32} />
          </div>

          {/* Text */}
          <span className="pcp-eyebrow">Payment Cancelled</span>
          <h2 className="pcp-heading">Your payment was not completed</h2>
          <p className="pcp-desc">
            You cancelled before the payment was processed. Your booking is still{' '}
            <strong>pending payment</strong> and has not been cancelled.
            No charge was made to your account.
          </p>

          {/* Notice */}
          <div className="pcp-notice">
            <AlertCircle size={14} />
            <span>
              Your room hold may expire if payment is not completed. Return to My Bookings to try again.
            </span>
          </div>

          {/* Actions */}
          <div className="pcp-actions">
            <Link to="/bookings/my" className="pcp-btn pcp-btn-primary">
              <CreditCard size={15} />
              {paymentId ? 'Try Again from My Bookings' : 'My Bookings'}
            </Link>
            <Link to="/rooms" className="pcp-btn pcp-btn-outline">
              <ArrowRight size={15} />
              Browse Rooms
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}