import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CreditCard } from 'lucide-react';
import './PaymentCancelPage.css';

export default function PaymentCancelPage() {
  const [searchParams] = useSearchParams();
  const paymentId      = searchParams.get('payment_id');

  return (
    <div className="cancel-page">
      <div className="cancel-nav">
        <div className="nav-container">
          <Link to="/bookings/my" className="back-link">
            <ArrowLeft size={18} /> My Bookings
          </Link>
        </div>
      </div>

      <div className="cancel-container">
        <div className="cancel-card">
          <div className="cancel-icon">
            <AlertCircle size={48} />
          </div>

          <h2 className="cancel-title">Payment Cancelled</h2>
          <p className="cancel-subtitle">
            You cancelled the payment. Your booking is still <strong>pending payment</strong>.
            No charge was made.
          </p>

          <div className="cancel-actions">
            {paymentId && (
              <Link to="/bookings/my" className="btn btn-primary">
                <CreditCard size={16} /> Try Again from My Bookings
              </Link>
            )}
            <Link to="/bookings/my" className="btn btn-outline">
              <ArrowLeft size={16} /> My Bookings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}