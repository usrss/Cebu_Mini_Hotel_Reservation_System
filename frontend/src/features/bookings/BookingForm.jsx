import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  Calendar, Users, User, Mail, Phone, CreditCard,
  AlertCircle, Clock, Tag, MessageSquare, ShieldCheck,
} from 'lucide-react';
import { useCreateBooking, useCurrentUser } from '../hooks/useBookings';
import { useHotelSettings } from '../hooks/useHotelSettings';
import './BookingForm.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

function toDateObj(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.ceil((new Date(checkOut) - new Date(checkIn)) / 86400000));
}

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function CancellationPolicyBlock({ tiers, loading }) {
  const hasTiers = Array.isArray(tiers) && tiers.length > 0;

  const getTierStyle = (refundPct) => {
    const pct = Number(refundPct);
    if (pct >= 80) return {
      badgeBg: 'rgba(5,150,105,0.08)', badgeColor: '#059669',
      badgeBorder: 'rgba(5,150,105,0.22)', dotBg: '#059669',
    };
    if (pct >= 40) return {
      badgeBg: 'rgba(217,119,6,0.07)', badgeColor: '#d97706',
      badgeBorder: 'rgba(217,119,6,0.22)', dotBg: '#d97706',
    };
    return {
      badgeBg: 'rgba(1,0,13,0.04)', badgeColor: '#909090',
      badgeBorder: 'rgba(1,0,13,0.10)', dotBg: '#c8c7c7',
    };
  };

  return (
    <div className="bf-policy-block">
      <div className="bf-policy-header">
        <ShieldCheck size={14} className="bf-policy-icon" />
        <span className="bf-policy-title">Cancellation Policy</span>
      </div>
      {loading ? (
        <div className="bf-policy-skeleton">
          <div className="bf-skeleton bf-skeleton--line" style={{ width: '85%' }} />
          <div className="bf-skeleton bf-skeleton--line" style={{ width: '70%' }} />
          <div className="bf-skeleton bf-skeleton--line" style={{ width: '60%' }} />
        </div>
      ) : hasTiers ? (
        <div className="bf-policy-tiers">
          {tiers.map((tier, i) => {
            const style      = getTierStyle(tier.refund_pct);
            const pct        = Number(tier.refund_pct);
            const isCatchAll = Number(tier.hours_before) === 0;
            const isLast     = i === tiers.length - 1;
            return (
              <div key={i} className="bf-tier-row">
                <div className="bf-tier-timeline">
                  <div className="bf-tier-dot" style={{ background: style.dotBg }} />
                  {!isLast && <div className="bf-tier-connector" />}
                </div>
                <div className="bf-tier-content">
                  <div className="bf-tier-condition">
                    {isCatchAll
                      ? 'Same day / after check-in'
                      : `${tier.hours_before}+ hours before check-in`}
                  </div>
                  <div className="bf-tier-detail">
                    <span className="bf-tier-badge" style={{
                      background: style.badgeBg,
                      color: style.badgeColor,
                      borderColor: style.badgeBorder,
                    }}>
                      {pct > 0 ? `${pct}% refund` : 'No refund'}
                    </span>
                    {tier.label && <span className="bf-tier-label">{tier.label}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="bf-policy-text">Contact the hotel for cancellation policy details.</p>
      )}
    </div>
  );
}

export default function BookingForm({ room, prefillCheckIn, prefillCheckOut }) {
  const navigate = useNavigate();
  const { createBooking, loading, error } = useCreateBooking();
  const { user, loading: userLoading }    = useCurrentUser();
  const { settings, loading: settingsLoading } = useHotelSettings();

  const [form, setForm] = useState({
    check_in:         prefillCheckIn  || '',
    check_out:        prefillCheckOut || '',
    guests_count:     1,
    full_name:        '',
    email:            '',
    phone:            '',
    special_requests: '',
  });
  const [fieldErrors,      setFieldErrors]      = useState({});
  const [unavailableDates, setUnavailableDates] = useState([]);

  // Fetch unavailable dates for this room
  useEffect(() => {
    if (!room?.id) return;
    fetch(`${API_BASE}/rooms/${room.id}/unavailable-dates/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        // Convert strings to Date objects for react-datepicker
        const dates = (data.unavailable_dates || []).map(str => toDateObj(str));
        setUnavailableDates(dates);
      })
      .catch(() => setUnavailableDates([]));
  }, [room?.id]);

  useEffect(() => {
    if (prefillCheckIn || prefillCheckOut) {
      setForm(prev => ({
        ...prev,
        check_in:  prefillCheckIn  || prev.check_in,
        check_out: prefillCheckOut || prev.check_out,
      }));
    }
  }, [prefillCheckIn, prefillCheckOut]);

  useEffect(() => {
    if (user) {
      setForm(prev => ({
        ...prev,
        full_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '',
        email:     user.email  || '',
        phone:     user.phone  || '',
      }));
    }
  }, [user]);

  const nights        = calculateNights(form.check_in, form.check_out);
  const effectiveRate = Number(room.discounted_price ?? room.price_per_night);
  const subtotal      = nights * effectiveRate;
  const tax           = subtotal * 0.12;
  const fee           = subtotal * 0.05;
  const total         = subtotal + tax + fee;
  const hasDiscount   = Number(room.discount_percentage) > 0;
  const savedAmount   = nights * Number(room.price_per_night) - subtotal;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if a date falls within any unavailable range
  const isDateUnavailable = (date) => {
    return unavailableDates.some(
      ud => ud.toDateString() === date.toDateString()
    );
  };

  const handleCheckInChange = (date) => {
    const str = toDateStr(date);
    setForm(prev => ({
      ...prev,
      check_in: str,
      // Clear check_out if it's now before or equal to new check_in
      check_out: prev.check_out && prev.check_out <= str ? '' : prev.check_out,
    }));
    setFieldErrors(prev => ({ ...prev, check_in: undefined, check_out: undefined }));
  };

  const handleCheckOutChange = (date) => {
    setForm(prev => ({ ...prev, check_out: toDateStr(date) }));
    setFieldErrors(prev => ({ ...prev, check_out: undefined }));
  };

  const update = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFieldErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.check_in)  errs.check_in    = 'Check-in date is required.';
    if (!form.check_out) errs.check_out   = 'Check-out date is required.';
    if (!form.guests_count || form.guests_count < 1) errs.guests_count = 'At least 1 guest required.';
    if (form.guests_count > room.capacity) errs.guests_count = `Max capacity is ${room.capacity}.`;
    if (!form.full_name.trim()) errs.full_name = 'Full name is required.';
    if (!form.email.trim())     errs.email     = 'Email is required.';
    if (!form.phone.trim())     errs.phone     = 'Phone number is required.';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    const payload = {
      room_id:          room.id,
      check_in:         form.check_in,
      check_out:        form.check_out,
      guests_count:     Number(form.guests_count),
      full_name:        form.full_name,
      email:            form.email,
      phone:            form.phone,
      special_requests: form.special_requests.trim() || null,
    };

    const booking = await createBooking(payload);
    if (booking) {
      navigate(`/payments/${booking.id}`, { state: { booking } });
    }
  };

  const checkInDate  = toDateObj(form.check_in);
  const checkOutDate = toDateObj(form.check_out);

  // Minimum check-out is the day after check-in
  const minCheckOut = checkInDate
    ? new Date(checkInDate.getTime() + 86400000)
    : new Date(today.getTime() + 86400000);

  const isLoggedIn = !!user;

  return (
    <div className="booking-form">

      {/* ── Stay Dates ── */}
      <FormSection title="Stay Dates" icon={<Calendar size={16} />}>
        <div className="booking-date-inputs">

          {/* Check-in */}
          <div className="booking-date-wrapper">
            <label>Check-in</label>
            <DatePicker
              selected={checkInDate}
              onChange={handleCheckInChange}
              minDate={today}
              excludeDates={unavailableDates}
              dateFormat="yyyy-MM-dd"
              placeholderText="Select check-in"
              className={`booking-date-input ${fieldErrors.check_in ? 'input-error' : ''}`}
              calendarClassName="bf-calendar"
              renderDayContents={(day, date) => {
                const isUnavailable = isDateUnavailable(date);
                return (
                  <span title={isUnavailable ? 'Not available' : undefined}>
                    {day}
                  </span>
                );
              }}
            />
            {fieldErrors.check_in && (
              <span className="field-error">{fieldErrors.check_in}</span>
            )}
          </div>

          {/* Check-out */}
          <div className="booking-date-wrapper">
            <label>Check-out</label>
            <DatePicker
              selected={checkOutDate}
              onChange={handleCheckOutChange}
              minDate={minCheckOut}
              excludeDates={unavailableDates}
              dateFormat="yyyy-MM-dd"
              placeholderText="Select check-out"
              disabled={!form.check_in}
              className={`booking-date-input ${fieldErrors.check_out ? 'input-error' : ''}`}
              calendarClassName="bf-calendar"
              renderDayContents={(day, date) => {
                const isUnavailable = isDateUnavailable(date);
                return (
                  <span title={isUnavailable ? 'Not available' : undefined}>
                    {day}
                  </span>
                );
              }}
            />
            {fieldErrors.check_out && (
              <span className="field-error">{fieldErrors.check_out}</span>
            )}
          </div>
        </div>

        {nights > 0 && (
          <p className="booking-nights-label">
            {nights} night{nights !== 1 ? 's' : ''}
          </p>
        )}
      </FormSection>

      {/* ── Guests ── */}
      <FormSection title="Guests" icon={<Users size={16} />}>
        <div className="booking-guest-wrapper">
          <input
            type="number"
            min="1"
            max={room.capacity}
            value={form.guests_count}
            onChange={e => update('guests_count', parseInt(e.target.value) || 1)}
            className={`booking-guest-input ${fieldErrors.guests_count ? 'input-error' : ''}`}
          />
          <div className="booking-guest-quick">
            {Array.from({ length: Math.min(room.capacity, 4) }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => update('guests_count', n)}
                className={`booking-guest-btn ${form.guests_count === n ? 'active' : ''}`}
              >
                {n}
              </button>
            ))}
          </div>
          {fieldErrors.guests_count && (
            <span className="field-error">{fieldErrors.guests_count}</span>
          )}
        </div>
        <p className="booking-capacity-hint">
          Max capacity: {room.capacity} guest{room.capacity !== 1 ? 's' : ''}
        </p>
      </FormSection>

      {/* ── Guest Info ── */}
      <FormSection
        title="Guest Information"
        icon={<User size={16} />}
        badge={isLoggedIn ? 'Auto-filled' : null}
      >
        {userLoading ? (
          <div className="booking-user-loading">
            <span className="spinner spinner-sm" />
            Loading your details…
          </div>
        ) : (
          <div className="booking-guest-info">
            <div className="booking-field">
              <label><User size={14} /> Full Name</label>
              <input
                type="text"
                placeholder="Maria Santos"
                value={form.full_name}
                onChange={e => update('full_name', e.target.value)}
                className={fieldErrors.full_name ? 'input-error' : ''}
              />
              {fieldErrors.full_name && (
                <span className="field-error">{fieldErrors.full_name}</span>
              )}
            </div>
            <div className="booking-field">
              <label><Mail size={14} /> Email</label>
              <input
                type="email"
                placeholder="maria@example.com"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                className={fieldErrors.email ? 'input-error' : ''}
              />
              {fieldErrors.email && (
                <span className="field-error">{fieldErrors.email}</span>
              )}
            </div>
            <div className="booking-field">
              <label><Phone size={14} /> Phone</label>
              <input
                type="tel"
                placeholder="+63 912 345 6789"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                className={fieldErrors.phone ? 'input-error' : ''}
              />
              {fieldErrors.phone && (
                <span className="field-error">{fieldErrors.phone}</span>
              )}
            </div>
          </div>
        )}
      </FormSection>

      {/* ── Special Requests ── */}
      <FormSection title="Special Requests" icon={<MessageSquare size={16} />}>
        <textarea
          className="booking-special-requests"
          placeholder="Early check-in, extra pillows, ground floor preference…"
          value={form.special_requests}
          onChange={e => update('special_requests', e.target.value)}
          rows={3}
        />
        <p className="booking-capacity-hint">Optional — we'll do our best to accommodate.</p>
      </FormSection>

      {/* ── Price Breakdown ── */}
      {nights > 0 && (
        <div className="booking-price-breakdown">
          <h5 className="breakdown-title">
            <CreditCard size={16} />
            Price Breakdown
          </h5>
          <div className="breakdown-rows">
            {hasDiscount && (
              <div className="breakdown-discount-badge">
                <Tag size={12} />
                {Number(room.discount_percentage)}% discount applied
              </div>
            )}
            <div className="breakdown-row">
              <span>
                {hasDiscount && (
                  <span className="breakdown-original-price">
                    ₱{formatPrice(room.price_per_night)}
                  </span>
                )}{' '}
                ₱{formatPrice(effectiveRate)} × {nights} night{nights !== 1 ? 's' : ''}
              </span>
              <span>₱{formatPrice(subtotal)}</span>
            </div>
            {hasDiscount && (
              <div className="breakdown-row breakdown-savings">
                <span>You save</span>
                <span>−₱{formatPrice(savedAmount)}</span>
              </div>
            )}
            <div className="breakdown-row">
              <span>Tax (12%)</span>
              <span>₱{formatPrice(tax)}</span>
            </div>
            <div className="breakdown-row">
              <span>Service fee (5%)</span>
              <span>₱{formatPrice(fee)}</span>
            </div>
            <div className="breakdown-row breakdown-total">
              <span>Total</span>
              <span>₱{formatPrice(total)}</span>
            </div>
          </div>
          <p className="breakdown-payment-hint">
            <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
            You'll choose between full payment or 30% deposit on the next step.
          </p>
        </div>
      )}

      {/* ── Cancellation Policy ── */}
      <CancellationPolicyBlock
        tiers={settings.cancellation_tiers}
        loading={settingsLoading}
      />

      {/* ── API error ── */}
      {error && (
        <div className="booking-api-error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Submit ── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || userLoading}
        className="booking-submit-btn"
      >
        {loading ? (
          <span className="btn-loading"><span className="spinner" /> Processing…</span>
        ) : (
          <>
            <CreditCard size={18} />
            {nights > 0 ? `Continue — ₱${formatPrice(total)}` : 'Proceed to Payment'}
          </>
        )}
      </button>

      <p className="booking-disclaimer">
        <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
        Room held for <strong>30 minutes</strong>. Reference number &amp; PIN issued after payment.
        By proceeding you agree to the cancellation policy above.
      </p>
    </div>
  );
}

function FormSection({ title, icon, badge, children }) {
  return (
    <div className="booking-form-section">
      <div className="booking-section-header">
        <h5 className="booking-section-title">
          {icon && <span className="section-icon">{icon}</span>}
          {title}
        </h5>
        {badge && <span className="booking-autofill-badge">{badge}</span>}
      </div>
      {children}
    </div>
  );
}