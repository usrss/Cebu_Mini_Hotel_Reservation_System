import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, User, Mail, Phone, CreditCard, AlertCircle, Clock } from 'lucide-react';
import { useCreateBooking, useCurrentUser } from '../hooks/useBookings';
import './BookingForm.css';

const getTodayDate = () => new Date().toISOString().split('T')[0];

function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const diff = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BookingForm({ room, prefillCheckIn, prefillCheckOut }) {
  const navigate = useNavigate();
  const { createBooking, loading, error } = useCreateBooking();

  // Fetch logged-in user internally
  const { user, loading: userLoading } = useCurrentUser();

  const [form, setForm] = useState({
    check_in:     prefillCheckIn  || '',
    check_out:    prefillCheckOut || '',
    guests_count: 1,
    full_name:    '',
    email:        '',
    phone:        '',
  });
  const [fieldErrors, setFieldErrors] = useState({});

  // Auto-fill guest fields once user data loads
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        full_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '',
        email:     user.email        || '',
        phone:     user.phone_number || user.phone || '',
      }));
    }
  }, [user]);

  const nights         = calculateNights(form.check_in, form.check_out);
  const effectiveRate  = Number(room.discounted_price ?? room.price_per_night);
  const subtotal       = nights * effectiveRate;
  const tax            = subtotal * 0.12;
  const fee            = subtotal * 0.05;
  const total          = subtotal + tax + fee;
  const hasDiscount    = Number(room.discount_percentage) > 0;
  const originalSubtotal = nights * Number(room.price_per_night);
  const savedAmount    = originalSubtotal - subtotal;

  const update = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'check_in' && next.check_out && next.check_out <= value) {
        next.check_out = '';
      }
      return next;
    });
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
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
      room_id:      room.id,
      check_in:     form.check_in,
      check_out:    form.check_out,
      guests_count: Number(form.guests_count),
      full_name:    form.full_name,
      email:        form.email,
      phone:        form.phone,
    };

    const booking = await createBooking(payload);
    if (booking) {
      // Phase 1 complete: booking is PENDING_PAYMENT.
      // Navigate to payment page — confirmation page is only shown after payment.
      navigate(`/payments/${booking.id}`, { state: { booking } });
    }
  };

  const minCheckOut = form.check_in || getTodayDate();
  const isLoggedIn  = !!user;

  return (
    <div className="booking-form">

      {/* Stay Dates */}
      <FormSection title="Stay Dates" icon={<Calendar size={16} />}>
        <div className="booking-date-inputs">
          <div className="booking-date-wrapper">
            <label>Check-in</label>
            <input
              type="date"
              min={getTodayDate()}
              value={form.check_in}
              onChange={(e) => update('check_in', e.target.value)}
              className={`booking-date-input ${fieldErrors.check_in ? 'input-error' : ''}`}
            />
            {fieldErrors.check_in && <span className="field-error">{fieldErrors.check_in}</span>}
          </div>
          <div className="booking-date-wrapper">
            <label>Check-out</label>
            <input
              type="date"
              min={minCheckOut}
              value={form.check_out}
              onChange={(e) => update('check_out', e.target.value)}
              className={`booking-date-input ${fieldErrors.check_out ? 'input-error' : ''}`}
              disabled={!form.check_in}
            />
            {fieldErrors.check_out && <span className="field-error">{fieldErrors.check_out}</span>}
          </div>
        </div>
        {nights > 0 && (
          <p className="booking-nights-label">{nights} night{nights !== 1 ? 's' : ''}</p>
        )}
      </FormSection>

      {/* Number of Guests */}
      <FormSection title="Guests" icon={<Users size={16} />}>
        <div className="booking-guest-wrapper">
          <input
            type="number"
            min="1"
            max={room.capacity}
            value={form.guests_count}
            onChange={(e) => update('guests_count', parseInt(e.target.value) || 1)}
            className={`booking-guest-input ${fieldErrors.guests_count ? 'input-error' : ''}`}
          />
          <div className="booking-guest-quick">
            {Array.from({ length: Math.min(room.capacity, 4) }, (_, i) => i + 1).map((n) => (
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
          {fieldErrors.guests_count && <span className="field-error">{fieldErrors.guests_count}</span>}
        </div>
        <p className="booking-capacity-hint">Max capacity: {room.capacity} guest{room.capacity !== 1 ? 's' : ''}</p>
      </FormSection>

      {/* Guest Info */}
      <FormSection
        title="Guest Information"
        icon={<User size={16} />}
        badge={isLoggedIn ? 'Auto-filled from your account' : null}
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
                onChange={(e) => update('full_name', e.target.value)}
                className={fieldErrors.full_name ? 'input-error' : ''}
              />
              {fieldErrors.full_name && <span className="field-error">{fieldErrors.full_name}</span>}
            </div>
            <div className="booking-field">
              <label><Mail size={14} /> Email</label>
              <input
                type="email"
                placeholder="maria@example.com"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className={fieldErrors.email ? 'input-error' : ''}
              />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </div>
            <div className="booking-field">
              <label><Phone size={14} /> Phone</label>
              <input
                type="tel"
                placeholder="+63 912 345 6789"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                className={fieldErrors.phone ? 'input-error' : ''}
              />
              {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
            </div>
          </div>
        )}
      </FormSection>

      {/* Price Breakdown */}
      {nights > 0 && (
        <div className="booking-price-breakdown">
          <h5 className="breakdown-title">
            <CreditCard size={16} />
            Price Breakdown
          </h5>
          <div className="breakdown-rows">
            {/* Discount badge — only shown when a discount is active */}
            {hasDiscount && (
              <div className="breakdown-discount-badge">
                {Number(room.discount_percentage)}% discount applied
              </div>
            )}
            <div className="breakdown-row">
              <span>
                {/* Show strikethrough original rate when discounted */}
                {hasDiscount && (
                  <span className="breakdown-original-price">
                    ₱{formatPrice(room.price_per_night)}
                  </span>
                )}{' '}
                ₱{formatPrice(effectiveRate)} × {nights} night{nights !== 1 ? 's' : ''}
              </span>
              <span>₱{formatPrice(subtotal)}</span>
            </div>
            {/* Savings row — only shown when a discount is active */}
            {hasDiscount && nights > 0 && (
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
        </div>
      )}

      {/* API error */}
      {error && (
        <div className="booking-api-error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || userLoading}
        className="booking-submit-btn"
      >
        {loading ? (
          <span className="btn-loading">
            <span className="spinner" />
            Processing…
          </span>
        ) : (
          <>
            <CreditCard size={18} />
            Proceed to Payment
          </>
        )}
      </button>

      <p className="booking-disclaimer">
        <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
        Your room will be held for {30} minutes while you complete payment.
        Reference number and check-in PIN are issued after payment is confirmed.
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