import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Calendar, Users, Hash,
  Key, Clock, CreditCard, QrCode, AlertCircle,
} from 'lucide-react';
import { useBookingDetail } from '../hooks/useBookings';
import './BookingConfirmationPage.css';


// Confirmation page is ONLY reached after successful payment.
// At this point the booking is CONFIRMED and reference_number + checkin_pin
// are guaranteed to be present. If they are not, we show an error.

const STATUS_CONFIG = {
  pending_payment: { label: 'Pending Payment', className: 'status-awaiting',   icon: <Clock size={14} /> },
  confirmed:       { label: 'Confirmed',        className: 'status-confirmed',  icon: <CheckCircle2 size={14} /> },
  checked_in:      { label: 'Checked In',       className: 'status-checkedin',  icon: <CheckCircle2 size={14} /> },
  checked_out:     { label: 'Checked Out',      className: 'status-checkedout', icon: <CheckCircle2 size={14} /> },
  cancelled:       { label: 'Cancelled',        className: 'status-cancelled',  icon: null },
  expired:         { label: 'Expired',          className: 'status-cancelled',  icon: null },
  no_show:         { label: 'No Show',          className: 'status-noshow',     icon: null },
};

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Inline QR component ───────────────────────────────────────────────────────

function BookingQR({ reference }) {
  const canvasRef = useRef(null);
  const [dataUrl, setDataUrl] = useState(null);
  const SIZE = 160;

  useEffect(() => {
    if (!reference) return;

    const draw = () => {
      try {
        const qr      = window.qrcode(0, 'M');
        qr.addData(reference);
        qr.make();

        const canvas  = canvasRef.current;
        if (!canvas) return;
        const ctx     = canvas.getContext('2d');
        const modules = qr.getModuleCount();
        const cell    = Math.floor((SIZE - 16) / modules);
        const offset  = Math.floor((SIZE - cell * modules) / 2);

        canvas.width  = SIZE;
        canvas.height = SIZE;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, SIZE, SIZE);

        ctx.fillStyle = '#0f172a';
        for (let row = 0; row < modules; row++) {
          for (let col = 0; col < modules; col++) {
            if (qr.isDark(row, col)) {
              ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
            }
          }
        }

        setDataUrl(canvas.toDataURL('image/png'));
      } catch (e) {
        console.warn('QR generation failed:', e);
      }
    };

    if (window.qrcode) { draw(); return; }

    const existing = document.getElementById('qrcode-gen-script');
    if (existing) {
      existing.addEventListener('load', draw);
      return () => existing.removeEventListener('load', draw);
    }
    const script  = document.createElement('script');
    script.id     = 'qrcode-gen-script';
    script.src    = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    script.onload = draw;
    document.head.appendChild(script);
  }, [reference]);

  return (
    <div className="booking-qr-wrapper">
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="booking-qr-frame">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`QR for ${reference}`}
            className="booking-qr-img"
            width={SIZE}
            height={SIZE}
          />
        ) : (
          <div className="booking-qr-placeholder" style={{ width: SIZE, height: SIZE }}>
            <QrCode size={32} color="#d1d5db" />
          </div>
        )}
        <span className="qr-corner qr-tl" />
        <span className="qr-corner qr-tr" />
        <span className="qr-corner qr-bl" />
        <span className="qr-corner qr-br" />
      </div>
      <p className="booking-qr-hint">
        Show this to the receptionist<br />or share your reference number
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BookingConfirmationPage() {
  const { id }    = useParams();
  const { state } = useLocation();

  // State booking passed from payment page after successful payment
  const hasStateBooking = Boolean(state?.booking);
  const { booking: fetched, loading, error } = useBookingDetail(
    hasStateBooking ? null : id
  );
  const booking = state?.booking || fetched;

  if (!hasStateBooking && loading) return <LoadingSkeleton />;

  if (error || !booking) {
    return (
      <div className="confirmation-error-container">
        <div className="error-content">
          <h2 className="error-heading">Booking Not Found</h2>
          <p className="error-message">{error || 'We could not find this booking.'}</p>
          <Link to="/rooms" className="btn btn-primary">
            <ArrowLeft size={18} /> Back to Rooms
          </Link>
        </div>
      </div>
    );
  }

  // Guard: this page must only be displayed for CONFIRMED bookings with credentials.
  // If a guest somehow navigates here for a PENDING_PAYMENT booking, redirect them
  // to the payment page instead of showing empty credential fields.
  if (booking.status === 'pending_payment' || !booking.has_credentials) {
    return (
      <div className="confirmation-error-container">
        <div className="error-content">
          <AlertCircle size={48} color="#f59e0b" style={{ marginBottom: 16 }} />
          <h2 className="error-heading">Payment Required</h2>
          <p className="error-message">
            Your booking is awaiting payment. Complete payment to receive your
            reference number, QR code, and check-in PIN.
          </p>
          <Link to={`/payments/${booking.id}`} className="btn btn-primary">
            <CreditCard size={18} /> Complete Payment
          </Link>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.confirmed;

  return (
    <div className="confirmation-page">

      {/* Nav */}
      <div className="confirmation-nav">
        <div className="nav-container">
          <Link to="/bookings/my" className="back-link">
            <ArrowLeft size={18} /> My Bookings
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="confirmation-hero">
        <div className="confirmation-hero-icon">
          <CheckCircle2 size={40} />
        </div>
        <h1 className="confirmation-hero-title">Booking Confirmed!</h1>
        <p className="confirmation-hero-subtitle">
          Payment received. Your reference number and check-in credentials are below.
        </p>
      </div>

      <div className="confirmation-container">
        <div className="confirmation-layout">

          {/* Left column */}
          <div className="confirmation-main">

            {/* Reference card with QR — only shown because booking is CONFIRMED */}
            <div className="confirmation-card reference-card">
              <div className="reference-qr-row">
                <div className="reference-text-block">
                  <p className="reference-eyebrow">
                    <Hash size={13} /> Reference Number
                  </p>
                  <p className="reference-number">{booking.reference_number}</p>
                  <div className={`booking-status-badge ${statusCfg.className}`}>
                    {statusCfg.icon}
                    {statusCfg.label}
                  </div>
                </div>
                {/* QR code encodes the confirmed reference number */}
                <BookingQR reference={booking.reference_number} />
              </div>
            </div>

            {/* PIN card — only rendered when checkin_pin is present (CONFIRMED+) */}
            {booking.checkin_pin && (
              <div className="confirmation-card pin-card">
                <h3 className="card-section-title">
                  <Key size={16} /> Check-in PIN
                </h3>
                <div className="pin-display">
                  {booking.checkin_pin.split('').map((digit, i) => (
                    <span key={i} className="pin-digit">{digit}</span>
                  ))}
                </div>
                <p className="pin-note">
                  Present this PIN at the reception desk along with a valid ID.
                </p>
              </div>
            )}

            {/* Stay details */}
            <div className="confirmation-card">
              <h3 className="card-section-title">
                <Calendar size={16} /> Stay Details
              </h3>
              <div className="detail-rows">
                <DetailRow label="Room"      value={`#${booking.room_number} — ${booking.room_type}`} />
                <DetailRow label="Check-in"  value={booking.check_in} />
                <DetailRow label="Check-out" value={booking.check_out} />
                <DetailRow label="Nights"    value={`${booking.nights} night${booking.nights !== 1 ? 's' : ''}`} />
                <DetailRow label="Guests"    value={`${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''}`} />
              </div>
            </div>

            {/* Guest info */}
            <div className="confirmation-card">
              <h3 className="card-section-title">
                <Users size={16} /> Guest Information
              </h3>
              <div className="detail-rows">
                <DetailRow label="Name"  value={booking.full_name} />
                <DetailRow label="Email" value={booking.email} />
                <DetailRow label="Phone" value={booking.phone} />
              </div>
            </div>

          </div>

          {/* Right sidebar */}
          <div className="confirmation-sidebar">
            <div className="confirmation-card price-card">
              <h3 className="card-section-title">
                <CreditCard size={16} /> Price Summary
              </h3>
              <div className="price-rows">
                <PriceRow
                  label={`₱${formatPrice(booking.room_price_snapshot)} × ${booking.nights} night${booking.nights !== 1 ? 's' : ''}`}
                  value={`₱${formatPrice(booking.subtotal)}`}
                />
                <PriceRow label="Tax (12%)"        value={`₱${formatPrice(booking.tax)}`} />
                <PriceRow label="Service fee (5%)" value={`₱${formatPrice(booking.service_fee)}`} />
                <div className="price-total-row">
                  <span>Total</span>
                  <span className="price-total-amount">₱{formatPrice(booking.total_price)}</span>
                </div>
              </div>
              <div className="payment-status-row">
                <span>Payment</span>
                <span className={`payment-badge payment-${booking.payment_status}`}>
                  {booking.payment_status_display}
                </span>
              </div>
            </div>

            <div className="confirmation-actions">
              <Link to="/bookings/my" className="btn btn-primary btn-full">
                View My Bookings
              </Link>
              <Link to="/rooms" className="btn btn-outline btn-full">
                Browse More Rooms
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value ?? '—'}</span>
    </div>
  );
}

function PriceRow({ label, value }) {
  return (
    <div className="price-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="confirmation-page">
      <div className="confirmation-nav">
        <div className="nav-container"><div className="skeleton skeleton-back" /></div>
      </div>
      <div className="confirmation-container">
        <div className="skeleton skeleton-hero" />
        <div className="confirmation-layout">
          <div className="confirmation-main">
            <div className="skeleton skeleton-card-lg" />
            <div className="skeleton skeleton-card-md" />
            <div className="skeleton skeleton-card-md" />
          </div>
          <div className="skeleton skeleton-sidebar" />
        </div>
      </div>
    </div>
  );
}