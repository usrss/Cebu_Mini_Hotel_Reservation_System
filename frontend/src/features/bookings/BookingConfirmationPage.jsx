import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Calendar, Users, Hash,
  Key, Clock, CreditCard, QrCode, AlertCircle, Copy, Check,
  CalendarPlus, Mail, Tag, ChevronRight,
} from 'lucide-react';
import { useBookingDetail } from '../hooks/useBookings';
import Navbar from '../../components/UIComponents/Navbar';
import './BookingConfirmationPage.css';

const STATUS_CONFIG = {
  pending_payment: { label: 'Pending Payment', className: 'status-awaiting',   icon: <Clock size={12} /> },
  confirmed:       { label: 'Confirmed',        className: 'status-confirmed',  icon: <CheckCircle2 size={12} /> },
  checked_in:      { label: 'Checked In',       className: 'status-checkedin',  icon: <CheckCircle2 size={12} /> },
  checked_out:     { label: 'Checked Out',      className: 'status-checkedout', icon: <CheckCircle2 size={12} /> },
  cancelled:       { label: 'Cancelled',        className: 'status-cancelled',  icon: null },
  expired:         { label: 'Expired',          className: 'status-cancelled',  icon: null },
  no_show:         { label: 'No Show',          className: 'status-noshow',     icon: null },
};

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(text => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);
  return { copied, copy };
}

/* Build Google Calendar URL */
function buildGoogleCalUrl(booking) {
  const fmt = d => d.replace(/-/g, '');
  const start = fmt(booking.check_in);
  const end   = fmt(booking.check_out);
  const title = encodeURIComponent(`Hotel Stay — ${booking.room_type} Room #${booking.room_number}`);
  const details = encodeURIComponent(`Reference: ${booking.reference_number}\nPIN: ${booking.checkin_pin || 'N/A'}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
}

/*
  Build .ics content compatible with:
  - Windows Calendar (Outlook / built-in)
  - Android (Google Calendar, Samsung Calendar)
  - macOS / iOS Calendar
  Uses DTSTART;VALUE=DATE and DTEND;VALUE=DATE for all-day events.
*/
function buildICSContent(booking) {
  const fmt = d => d.replace(/-/g, '');
  const uid = `${booking.reference_number}-${Date.now()}@cebu-mini-hotel`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cebu Mini Hotel//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${fmt(booking.check_in)}`,
    `DTEND;VALUE=DATE:${fmt(booking.check_out)}`,
    `SUMMARY:Hotel Stay — ${booking.room_type} Room #${booking.room_number}`,
    `DESCRIPTION:Booking Reference: ${booking.reference_number}\\nCheck-in PIN: ${booking.checkin_pin || 'N/A'}\\nGuest: ${booking.full_name}`,
    `LOCATION:Cebu Mini Hotel`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/* QR component */
function BookingQR({ reference }) {
  const canvasRef = useRef(null);
  const [dataUrl, setDataUrl]   = useState(null);
  const [qrFailed, setQrFailed] = useState(false);
  const SIZE = 148;

  useEffect(() => {
    if (!reference) return;
    let timeout;

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
        ctx.fillStyle = '#01000D';
        for (let row = 0; row < modules; row++) {
          for (let col = 0; col < modules; col++) {
            if (qr.isDark(row, col)) ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
          }
        }
        setDataUrl(canvas.toDataURL('image/png'));
      } catch (e) {
        setQrFailed(true);
      }
    };

    timeout = setTimeout(() => { if (!dataUrl) setQrFailed(true); }, 5000);

    if (window.qrcode) { draw(); return () => clearTimeout(timeout); }
    const existing = document.getElementById('qrcode-gen-script');
    if (existing) {
      existing.addEventListener('load', draw);
      return () => { existing.removeEventListener('load', draw); clearTimeout(timeout); };
    }
    const script  = document.createElement('script');
    script.id     = 'qrcode-gen-script';
    script.src    = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    script.onerror = () => setQrFailed(true);
    script.onload  = draw;
    document.head.appendChild(script);
    return () => clearTimeout(timeout);
  }, [reference]);

  return (
    <div className="bcp-qr-wrapper">
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="bcp-qr-frame">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR for ${reference}`} className="bcp-qr-img" width={SIZE} height={SIZE} />
        ) : qrFailed ? (
          <div className="bcp-qr-fallback" style={{ width: SIZE, height: SIZE }}>
            <QrCode size={24} />
            <span>QR unavailable</span>
            <span className="bcp-qr-fallback-hint">Use reference number at reception</span>
          </div>
        ) : (
          <div className="bcp-qr-placeholder" style={{ width: SIZE, height: SIZE }}>
            <QrCode size={28} />
          </div>
        )}
      </div>
      <p className="bcp-qr-hint">
        {qrFailed
          ? 'Show your reference number to the receptionist'
          : 'Present at reception or share your reference number'}
      </p>
    </div>
  );
}

/* Page */
export default function BookingConfirmationPage() {
  const { id }    = useParams();
  const { state } = useLocation();

  const hasStateBooking = Boolean(state?.booking);
  const { booking: fetched, loading, error } = useBookingDetail(hasStateBooking ? null : id);
  const booking = state?.booking || fetched;

  const { copied: refCopied, copy: copyRef } = useCopy();
  const { copied: pinCopied, copy: copyPin } = useCopy();

  if (!hasStateBooking && loading) return <LoadingSkeleton />;

  if (error || !booking) {
    return (
      <div className="bcp-page">
        <Navbar />
        <div className="bcp-error-container">
          <div className="bcp-error-content">
            <AlertCircle size={40} className="bcp-error-icon" />
            <h2 className="bcp-error-heading">Booking Not Found</h2>
            <p className="bcp-error-message">{error || 'We could not find this booking.'}</p>
            <Link to="/rooms" className="bcp-btn bcp-btn-primary">
              <ArrowLeft size={15} /> Back to Rooms
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (booking.status === 'pending_payment' || !booking.has_credentials) {
    return (
      <div className="bcp-page">
        <Navbar />
        <div className="bcp-error-container">
          <div className="bcp-error-content">
            <CreditCard size={40} className="bcp-error-icon bcp-error-icon--warn" />
            <h2 className="bcp-error-heading">Payment Required</h2>
            <p className="bcp-error-message">
              Your booking is awaiting payment. Complete payment to receive your
              reference number, QR code, and check-in PIN.
            </p>
            <Link to={`/payments/${booking.id}`} className="bcp-btn bcp-btn-primary">
              <CreditCard size={15} /> Complete Payment
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.confirmed;
  const googleCalUrl = buildGoogleCalUrl(booking);
  const icsBlob  = new Blob([buildICSContent(booking)], { type: 'text/calendar;charset=utf-8' });
  const icsUrl   = URL.createObjectURL(icsBlob);

  return (
    <div className="bcp-page">
      <Navbar />

      {/* Breadcrumb */}
      <div className="bcp-nav">
        <div className="bcp-nav-inner">
          <Link to="/bookings/my" className="bcp-back-link">
            <ArrowLeft size={15} /> My Bookings
          </Link>
        </div>
      </div>

      {/* Page header — no hero, just a clean title row */}
      <div className="bcp-page-header">
        <div className="bcp-page-header-inner">
          <span className="bcp-eyebrow">Booking Confirmation</span>
          <h1 className="bcp-page-title">Booking Confirmed</h1>
          <div className="bcp-email-notice">
            <Mail size={13} />
            Confirmation sent to <strong>{booking.email}</strong>
          </div>
        </div>
      </div>

      <div className="bcp-container">
        <div className="bcp-layout">

          {/* Left column */}
          <div className="bcp-main">

            {/* Reference + QR */}
            <div className="bcp-card">
              <div className="bcp-ref-qr-row">
                <div className="bcp-ref-block">
                  <p className="bcp-field-label">
                    <Hash size={11} /> Reference Number
                  </p>
                  <div className="bcp-ref-number-row">
                    <span className="bcp-ref-number">{booking.reference_number}</span>
                    <button
                      className="bcp-copy-btn"
                      onClick={() => copyRef(booking.reference_number)}
                      title="Copy reference number"
                    >
                      {refCopied ? <Check size={13} /> : <Copy size={13} />}
                      <span>{refCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className={`bcp-status-badge ${statusCfg.className}`}>
                    {statusCfg.icon}{statusCfg.label}
                  </div>
                </div>
                <BookingQR reference={booking.reference_number} />
              </div>
            </div>

            {/* PIN */}
            {booking.checkin_pin && (
              <div className="bcp-card bcp-pin-card">
                <p className="bcp-card-label"><Key size={12} /> Check-in PIN</p>
                <div className="bcp-pin-row">
                  <div className="bcp-pin-display">
                    {booking.checkin_pin.split('').map((digit, i) => (
                      <span key={i} className="bcp-pin-digit">{digit}</span>
                    ))}
                  </div>
                  <button
                    className="bcp-copy-btn bcp-copy-btn--ghost"
                    onClick={() => copyPin(booking.checkin_pin)}
                    title="Copy PIN"
                  >
                    {pinCopied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{pinCopied ? 'Copied' : 'Copy PIN'}</span>
                  </button>
                </div>
                <p className="bcp-pin-note">
                  Present this PIN at the reception desk along with a valid ID.
                </p>
              </div>
            )}

            {/* Stay details */}
            <div className="bcp-card">
              <p className="bcp-card-label"><Calendar size={12} /> Stay Details</p>
              <div className="bcp-detail-rows">
                <DetailRow label="Room"      value={`#${booking.room_number} — ${booking.room_type}`} />
                <DetailRow label="Check-in"  value={booking.check_in} />
                <DetailRow label="Check-out" value={booking.check_out} />
                <DetailRow label="Nights"    value={`${booking.nights} night${booking.nights !== 1 ? 's' : ''}`} />
                <DetailRow label="Guests"    value={`${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''}`} />
                {booking.special_requests && (
                  <DetailRow label="Requests" value={booking.special_requests} />
                )}
              </div>
            </div>

            {/* Guest info */}
            <div className="bcp-card">
              <p className="bcp-card-label"><Users size={12} /> Guest Information</p>
              <div className="bcp-detail-rows">
                <DetailRow label="Name"  value={booking.full_name} />
                <DetailRow label="Email" value={booking.email} />
                <DetailRow label="Phone" value={booking.phone} />
              </div>
            </div>

          </div>

          {/* Right sidebar */}
          <div className="bcp-sidebar">

            {/* Price summary */}
            <div className="bcp-card">
              <p className="bcp-card-label"><CreditCard size={12} /> Price Summary</p>
              <div className="bcp-price-rows">
                <PriceRow
                  label={`₱${formatPrice(booking.room_price_snapshot)} × ${booking.nights} night${booking.nights !== 1 ? 's' : ''} (at booking)`}
                  value={`₱${formatPrice(booking.subtotal)}`}
                />
                {Number(booking.discount_amount) > 0 && (
                  <PriceRow
                    label={`Discount (${booking.discount_percentage}% off)`}
                    value={`−₱${formatPrice(booking.discount_amount)}`}
                    isDiscount
                  />
                )}
                <PriceRow label="Tax (12%)"        value={`₱${formatPrice(booking.tax)}`} />
                <PriceRow label="Service fee (5%)" value={`₱${formatPrice(booking.service_fee)}`} />
                <div className="bcp-price-total-row">
                  <span>Total</span>
                  <span className="bcp-price-total-amount">₱{formatPrice(booking.total_price)}</span>
                </div>
              </div>
              <div className="bcp-payment-row">
                <span>Payment</span>
                <span className={`bcp-payment-badge bcp-payment-${booking.payment_status}`}>
                  {booking.payment_status_display}
                </span>
              </div>
            </div>

            {/* Add to Calendar */}
            <div className="bcp-card bcp-calendar-card">
              <p className="bcp-card-label"><CalendarPlus size={12} /> Add to Calendar</p>
              <p className="bcp-calendar-desc">
                Save your check-in and check-out dates to your preferred calendar app.
              </p>
              <div className="bcp-calendar-actions">
                <a
                  href={googleCalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bcp-cal-btn"
                >
                  Google Calendar
                </a>
                {/*
                  .ics download is compatible with:
                  - Windows Calendar & Outlook (double-click to import)
                  - Android Google Calendar & Samsung Calendar (open with)
                  - macOS / iOS Calendar
                */}
                <a
                  href={icsUrl}
                  download={`booking-${booking.reference_number}.ics`}
                  className="bcp-cal-btn bcp-cal-btn--outline"
                >
                  Download .ics
                  <span className="bcp-cal-compat">Outlook · Windows · Android</span>
                </a>
              </div>
            </div>

            {/* Actions */}
            <div className="bcp-actions">
              <Link to="/bookings/my" className="bcp-btn bcp-btn-primary bcp-btn-full">
                View My Bookings <ChevronRight size={14} />
              </Link>
              <Link to="/rooms" className="bcp-btn bcp-btn-outline bcp-btn-full">
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
    <div className="bcp-detail-row">
      <span className="bcp-detail-label">{label}</span>
      <span className="bcp-detail-value">{value ?? '—'}</span>
    </div>
  );
}

function PriceRow({ label, value, isDiscount = false }) {
  return (
    <div className={`bcp-price-row${isDiscount ? ' bcp-price-row--discount' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="bcp-page">
      <Navbar />
      <div className="bcp-nav">
        <div className="bcp-nav-inner"><div className="bcp-skeleton bcp-skeleton--back" /></div>
      </div>
      <div className="bcp-container">
        <div className="bcp-skeleton bcp-skeleton--header" />
        <div className="bcp-layout">
          <div className="bcp-main">
            <div className="bcp-skeleton bcp-skeleton--card-lg" />
            <div className="bcp-skeleton bcp-skeleton--card-md" />
            <div className="bcp-skeleton bcp-skeleton--card-md" />
          </div>
          <div className="bcp-skeleton bcp-skeleton--sidebar" />
        </div>
      </div>
    </div>
  );
}