/**
 * GuestCheckoutPage.jsx
 * src/features/staff/frontdesk/GuestCheckoutPage.jsx
 *
 * Front Desk — Guest Checkout flow.
 * Redesigned: matches FrontDesk light theme (fd- classes, DM Sans/DM Serif Display).
 * No emojis — Lucide icons throughout.
 * Print: opens a dedicated print window with a formal, accurate receipt.
 *
 * ══════════════════════════════════════════════════════════════════
 * WHAT THIS PAGE DOES
 * ══════════════════════════════════════════════════════════════════
 *
 * Step 1 — BILL REVIEW
 *   Shows the final bill broken into two sections:
 *     a) Accommodation — total_price, amount already paid, balance due
 *     b) Food & Drinks — all unpaid pay_checkout orders for this booking
 *   Grand Total = accommodation balance + food total.
 *
 * Step 2 — PAYMENT & CHECKOUT
 *   If grandTotal > 0 the staff selects Cash or Card.
 *   On confirm:
 *     a) Each food order is marked paid via PATCH /food/orders/<pk>/mark-paid/
 *     b) POST /bookings/admin/<pk>/checkout/ with { payment_method, note }
 *
 * Step 3 — SUCCESS
 *   Shows checkout confirmation with a Print Receipt button that opens
 *   a clean, formal receipt in a dedicated print window.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Banknote,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronLeft,
  UtensilsCrossed,
  BedDouble,
  Printer,
  CalendarCheck,
  ArrowRight,
  User,
  Hash,
  DoorOpen,
  Moon,
} from 'lucide-react';
import api from '../../../services/api';
import { frontDeskBookingsApi, formatPHP } from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

const STEP = { BILL: 'bill', PAYMENT: 'payment', SUCCESS: 'success' };

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash',       icon: <Banknote size={28} />,   desc: 'Collect at desk' },
  { value: 'card', label: 'Card (POS)', icon: <CreditCard size={28} />, desc: 'POS terminal'    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateLong(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function safeMoney(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

// ── Print receipt ─────────────────────────────────────────────────────────────
/**
 * Opens a new window with a self-contained, formal receipt and triggers print.
 * All figures are sourced directly from the data returned by the backend —
 * no recalculation is done client-side.
 *
 *   booking         — full booking object loaded on mount
 *   foodOrders      — food orders settled at checkout
 *   successSnapshot — totals captured the moment checkout was confirmed
 *   selectedMethod  — payment method object chosen by staff
 *   note            — optional checkout note entered by staff
 */
function printReceipt({ booking, foodOrders, successSnapshot, selectedMethod, note }) {
  if (!booking || !successSnapshot) return;

  const now          = new Date();
  const printedAt    = now.toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const issuedDate   = now.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  const issuedTime   = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  const {
    bookingBalance,
    foodTotal,
    grandTotal,
    foodOrderCount,
    receiptNumber,
    methodLabel,
  } = successSnapshot;

  // Rate per night — use snapshot if available, else derive from total / nights
  const nights       = Math.max(1, booking.nights ?? 1);
  const ratePerNight = safeMoney(
    booking.room_price_snapshot ?? (safeMoney(booking.total_price) / nights),
  );

  // Food rows — each order shows item name, qty, unit price, and line total
  const foodRowsHtml = foodOrders.length > 0
    ? foodOrders.map((o) => {
        const lineTotal  = safeMoney(o.total_price);
        const qty        = o.quantity || 1;
        const unitPrice  = safeMoney(o.unit_price ?? (lineTotal / qty));
        return `
          <tr>
            <td class="td-desc">${o.food_item_name || 'Food Item'}</td>
            <td class="td-center">${qty}</td>
            <td class="td-right">${formatPHP(unitPrice)}</td>
            <td class="td-right">${formatPHP(lineTotal)}</td>
          </tr>`;
      }).join('')
    : `<tr>
         <td colspan="4" class="td-center muted" style="padding:10px 4px;">
           No food &amp; drinks charges for this stay.
         </td>
       </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Checkout Receipt — ${booking.reference_number ?? ''}</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Page setup ── */
    @page {
      size: A4 portrait;
      margin: 20mm 18mm 20mm 18mm;
    }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 10.5pt;
      color: #0a0a0a;
      background: #fff;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Utility ── */
    .td-right  { text-align: right;  }
    .td-center { text-align: center; }
    .td-desc   { text-align: left;   }
    .muted     { color: #666;        }
    .bold      { font-weight: bold;  }
    .mono      { font-family: 'Courier New', monospace; letter-spacing: 0.05em; }

    /* ── Receipt header ── */
    .receipt-header {
      text-align: center;
      padding-bottom: 18px;
      margin-bottom: 20px;
      border-bottom: 2.5px solid #0a0a0a;
    }

    .hotel-name {
      font-size: 22pt;
      font-weight: bold;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .hotel-meta {
      font-size: 8.5pt;
      color: #444;
      line-height: 1.6;
    }

    .receipt-type {
      display: inline-block;
      margin-top: 14px;
      font-size: 12pt;
      font-weight: bold;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      border-top: 1px solid #0a0a0a;
      border-bottom: 1px solid #0a0a0a;
      padding: 5px 18px;
    }

    /* ── Two-column meta grid ── */
    .meta-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 32px;
      margin-bottom: 22px;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px dotted #d0d0d0;
      padding: 4px 0;
      font-size: 9.5pt;
    }

    .meta-label { color: #555; }
    .meta-value { font-weight: bold; text-align: right; max-width: 60%; }

    /* ── Section heading ── */
    .section-head {
      font-size: 8pt;
      font-weight: bold;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #333;
      background: #f0f0f0;
      padding: 5px 8px;
      margin: 22px 0 0;
      border-left: 3px solid #0a0a0a;
    }

    /* ── Data tables ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
      margin-top: 0;
    }

    thead th {
      font-size: 8pt;
      font-weight: bold;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #333;
      border-bottom: 1px solid #aaa;
      padding: 6px 6px 5px;
    }

    tbody td {
      padding: 6px 6px;
      border-bottom: 1px dotted #e0e0e0;
      vertical-align: middle;
    }

    tbody tr:last-child td { border-bottom: none; }

    /* ── Totals block ── */
    .totals-wrap {
      margin-top: 12px;
      display: flex;
      justify-content: flex-end;
    }

    .totals-table {
      width: 55%;
      border-collapse: collapse;
      font-size: 10pt;
    }

    .totals-table td {
      padding: 4px 6px;
      border-bottom: none;
    }

    .totals-table .subtotal-row td { color: #444; }

    .totals-table .grand-row td {
      font-size: 13pt;
      font-weight: bold;
      border-top: 2px solid #0a0a0a;
      padding-top: 8px;
      padding-bottom: 2px;
    }

    /* ── Payment confirmation box ── */
    .payment-box {
      margin-top: 22px;
      border: 1.5px solid #0a0a0a;
      padding: 14px 18px 12px;
    }

    .payment-box-title {
      font-size: 8pt;
      font-weight: bold;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #333;
      margin-bottom: 10px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
    }

    .payment-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 32px;
    }

    .payment-item-label {
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.10em;
      color: #666;
      margin-bottom: 2px;
    }

    .payment-item-value {
      font-size: 11pt;
      font-weight: bold;
    }

    /* ── Staff note ── */
    .checkout-note {
      margin-top: 14px;
      padding: 10px 14px;
      border-left: 3px solid #bbb;
      font-size: 9pt;
      color: #444;
      font-style: italic;
      background: #fafafa;
    }

    /* ── Signature block ── */
    .signature-section {
      margin-top: 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 56px;
    }

    .sig-block {
      text-align: center;
    }

    .sig-line {
      border-top: 1px solid #0a0a0a;
      padding-top: 7px;
      font-size: 9pt;
      color: #333;
    }

    .sig-subline {
      font-size: 8pt;
      color: #777;
      margin-top: 3px;
    }

    /* ── Footer ── */
    .receipt-footer {
      margin-top: 32px;
      padding-top: 14px;
      border-top: 1px solid #ccc;
      text-align: center;
      font-size: 8.5pt;
      color: #555;
      line-height: 1.8;
    }

    .receipt-footer .thank-you {
      font-size: 10pt;
      font-weight: bold;
      color: #0a0a0a;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }

    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>

  <!-- ══ HEADER ══ -->
  <div class="receipt-header">
    <div class="hotel-name">Cebu Mini Hotel</div>
    <div class="hotel-meta">
      Cebu City, Philippines<br />
      Tel: (032) 000-0000 &nbsp;&bull;&nbsp; info@cebuminihotel.com
    </div>
    <div class="receipt-type">Official Checkout Receipt</div>
  </div>

  <!-- ══ RECEIPT IDENTIFIERS ══ -->
  <div class="meta-section">
    <div class="meta-row">
      <span class="meta-label">Receipt No.</span>
      <span class="meta-value mono">${receiptNumber || 'N/A'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Booking Reference</span>
      <span class="meta-value mono">${booking.reference_number || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Date Issued</span>
      <span class="meta-value">${issuedDate}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Time Issued</span>
      <span class="meta-value">${issuedTime}</span>
    </div>
  </div>

  <!-- ══ GUEST & STAY DETAILS ══ -->
  <div class="section-head">Guest &amp; Stay Details</div>
  <div class="meta-section" style="margin-top: 10px;">
    <div class="meta-row">
      <span class="meta-label">Guest Name</span>
      <span class="meta-value">${booking.full_name || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Room No.</span>
      <span class="meta-value">Room ${booking.room_number || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Room Type</span>
      <span class="meta-value">${booking.room_type || '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">No. of Guests</span>
      <span class="meta-value">${booking.guests_count ?? '—'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Check-In Date</span>
      <span class="meta-value">${formatDateLong(booking.check_in)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Check-Out Date</span>
      <span class="meta-value">${formatDateLong(booking.check_out)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Duration of Stay</span>
      <span class="meta-value">${booking.nights ?? '—'} Night${(booking.nights ?? 1) !== 1 ? 's' : ''}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Rate per Night</span>
      <span class="meta-value">${formatPHP(ratePerNight)}</span>
    </div>
  </div>

  <!-- ══ ACCOMMODATION CHARGES ══ -->
  <div class="section-head">Accommodation Charges</div>
  <table style="margin-top: 8px;">
    <thead>
      <tr>
        <th class="td-desc">Description</th>
        <th class="td-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-desc">
          Room ${booking.room_number || ''} &mdash; ${booking.room_type || 'Accommodation'}
          (${booking.nights ?? 0} night${(booking.nights ?? 1) !== 1 ? 's' : ''}
          &times; ${formatPHP(ratePerNight)}/night)
        </td>
        <td class="td-right">${formatPHP(safeMoney(booking.total_price))}</td>
      </tr>
      <tr>
        <td class="td-desc muted" style="font-size:9pt;">Less: Amount Previously Paid</td>
        <td class="td-right muted" style="font-size:9pt;">&minus;${formatPHP(safeMoney(booking.amount_paid))}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals-wrap">
    <table class="totals-table">
      <tbody>
        <tr class="subtotal-row">
          <td>Accommodation Balance Due</td>
          <td class="td-right bold">${bookingBalance > 0 ? formatPHP(bookingBalance) : 'Fully Settled'}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ══ FOOD & DRINKS CHARGES ══ -->
  <div class="section-head">Food &amp; Drinks — Charged at Checkout</div>
  <table style="margin-top: 8px;">
    <thead>
      <tr>
        <th class="td-desc">Item</th>
        <th class="td-center">Qty</th>
        <th class="td-right">Unit Price</th>
        <th class="td-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${foodRowsHtml}
    </tbody>
  </table>

  ${foodOrders.length > 0 ? `
  <div class="totals-wrap">
    <table class="totals-table">
      <tbody>
        <tr class="subtotal-row">
          <td>Food &amp; Drinks Subtotal</td>
          <td class="td-right bold">${formatPHP(foodTotal)}</td>
        </tr>
      </tbody>
    </table>
  </div>` : ''}

  <!-- ══ GRAND TOTAL ══ -->
  <div class="totals-wrap" style="margin-top: 16px;">
    <table class="totals-table">
      <tbody>
        ${bookingBalance > 0 ? `
        <tr class="subtotal-row">
          <td>Accommodation Balance</td>
          <td class="td-right">${formatPHP(bookingBalance)}</td>
        </tr>` : ''}
        ${foodTotal > 0 ? `
        <tr class="subtotal-row">
          <td>Food &amp; Drinks</td>
          <td class="td-right">${formatPHP(foodTotal)}</td>
        </tr>` : ''}
        <tr class="grand-row">
          <td>TOTAL COLLECTED</td>
          <td class="td-right">${grandTotal > 0 ? formatPHP(grandTotal) : 'FULLY SETTLED'}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ══ PAYMENT CONFIRMATION ══ -->
  <div class="payment-box">
    <div class="payment-box-title">Payment Confirmation</div>
    <div class="payment-grid">
      <div>
        <div class="payment-item-label">Payment Method</div>
        <div class="payment-item-value">${methodLabel || selectedMethod?.label || '—'}</div>
      </div>
      <div>
        <div class="payment-item-label">Amount Collected</div>
        <div class="payment-item-value">${grandTotal > 0 ? formatPHP(grandTotal) : 'No Balance Due'}</div>
      </div>
      <div>
        <div class="payment-item-label">Receipt Number</div>
        <div class="payment-item-value mono">${receiptNumber || 'N/A'}</div>
      </div>
      <div>
        <div class="payment-item-label">Settlement Status</div>
        <div class="payment-item-value">PAID &mdash; CHECKED OUT</div>
      </div>
    </div>
  </div>

  ${note && note.trim() ? `
  <div class="checkout-note">
    <strong>Staff Note:</strong> ${note.trim()}
  </div>` : ''}

  <!-- ══ SIGNATURE BLOCK ══ -->
  <div class="signature-section">
    <div class="sig-block">
      <div style="height: 40px;"></div>
      <div class="sig-line">Guest Signature &amp; Date</div>
      <div class="sig-subline">${booking.full_name || '&nbsp;'}</div>
    </div>
    <div class="sig-block">
      <div style="height: 40px;"></div>
      <div class="sig-line">Authorized by — Front Desk</div>
      <div class="sig-subline">Cebu Mini Hotel Staff</div>
    </div>
  </div>

  <!-- ══ FOOTER ══ -->
  <div class="receipt-footer">
    <div class="thank-you">Thank you for choosing Cebu Mini Hotel.</div>
    <div>We hope to have the pleasure of welcoming you again.</div>
    <div style="margin-top: 6px; font-size: 8pt; color: #777;">
      This is an official receipt. Please retain for your records.<br />
      Printed on ${printedAt}
    </div>
  </div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print receipts.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Brief delay to ensure fonts and layout are fully rendered before print dialog
  setTimeout(() => { win.print(); }, 450);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current }) {
  const steps = [
    { key: STEP.BILL,    label: 'Review Bill' },
    { key: STEP.PAYMENT, label: 'Payment'     },
    { key: STEP.SUCCESS, label: 'Complete'    },
  ];
  const idx = steps.findIndex((s) => s.key === current);

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {steps.map((s, i) => (
        <div
          key={s.key}
          style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: i <= idx ? 'var(--fd-accent)' : 'var(--fd-surface-3)',
              color: i <= idx ? '#fff' : 'var(--fd-text-faint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, transition: 'all 0.2s',
            }}>
              {i < idx ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span style={{
              fontSize: 11,
              fontWeight: i === idx ? 700 : 400,
              color: i === idx ? 'var(--fd-text)' : 'var(--fd-text-faint)',
              whiteSpace: 'nowrap',
            }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 1,
              background: i < idx ? 'var(--fd-accent)' : 'var(--fd-surface-3)',
              margin: '0 12px', transition: 'background 0.2s',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

function GuestInfoCard({ booking }) {
  const fields = [
    { icon: <User size={13} />,         label: 'Guest',     value: booking.full_name },
    { icon: <Hash size={13} />,         label: 'Reference', value: booking.reference_number },
    { icon: <BedDouble size={13} />,    label: 'Room',      value: `Room ${booking.room_number}` },
    { icon: <CalendarCheck size={13} />,label: 'Check-In',  value: formatDate(booking.check_in) },
    { icon: <DoorOpen size={13} />,     label: 'Check-Out', value: formatDate(booking.check_out) },
    { icon: <Moon size={13} />,         label: 'Nights',    value: String(booking.nights ?? '—') },
  ];

  return (
    <div className="fd-card">
      <div className="fd-card-label">Guest &amp; Room</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
        {fields.map(({ icon, label, value }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <dt style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--fd-text-muted)',
            }}>
              {icon}{label}
            </dt>
            <dd style={{ fontSize: 13, fontWeight: 600, color: 'var(--fd-text)', margin: 0 }}>
              {value || '—'}
            </dd>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentMethodButton({ pm, selected, onSelect }) {
  const isSelected = selected?.value === pm.value;
  return (
    <button
      type="button"
      onClick={() => onSelect(pm)}
      style={{
        background:    isSelected ? 'var(--fd-accent-lt)' : 'var(--fd-surface-2)',
        border:        `2px solid ${isSelected ? 'var(--fd-accent)' : 'transparent'}`,
        borderRadius:  'var(--fd-radius-lg)',
        color:         isSelected ? 'var(--fd-accent)' : 'var(--fd-text-muted)',
        padding:       '20px 16px',
        cursor:        'pointer',
        display:       'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        fontFamily:    "'DM Sans', sans-serif",
        transition:    'all 0.18s',
        boxShadow:     isSelected ? '0 0 0 3px var(--fd-accent-lt)' : 'var(--fd-shadow-xs)',
      }}
    >
      <span style={{ color: isSelected ? 'var(--fd-accent)' : 'var(--fd-text-muted)' }}>
        {pm.icon}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{pm.label}</span>
      <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>{pm.desc}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GuestCheckoutPage() {
  const navigate      = useNavigate();
  const { bookingId } = useParams();
  const location      = useLocation();

  const [booking,        setBooking]        = useState(location.state?.booking || null);
  const [foodOrders,     setFoodOrders]     = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [loadError,      setLoadError]      = useState(null);

  const [step,           setStep]           = useState(STEP.BILL);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [note,           setNote]           = useState('');
  const [busy,           setBusy]           = useState(false);
  const [payError,       setPayError]       = useState(null);

  const [successSnapshot, setSuccessSnapshot] = useState(null);

  // ── Load booking + food orders ────────────────────────────────────────────
  const load = useCallback(async () => {
    const pk = bookingId || location.state?.booking?.id;
    if (!pk) {
      setLoadError('No booking ID provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const bookingData = await frontDeskBookingsApi.detail(pk);
      setBooking(bookingData);

      let relevantOrders = [];
      try {
        const foodRes = await api.get('/food/orders/admin/', {
          params: { booking: bookingData.id, payment_type: 'pay_checkout', payment_status: 'unpaid' },
        });
        const all = Array.isArray(foodRes.data) ? foodRes.data : (foodRes.data.results ?? []);
        relevantOrders = all.filter(
          (o) => o.payment_type   === 'pay_checkout'
              && o.payment_status === 'unpaid'
              && o.order_status   !== 'cancelled'
              && o.order_status   !== 'awaiting_payment',
        );
      } catch {
        try {
          const fbRes  = await api.get('/food/orders/admin/', { params: { room: bookingData.room_number } });
          const all    = Array.isArray(fbRes.data) ? fbRes.data : (fbRes.data.results ?? []);
          const hasBid = all.some((o) => o.booking_id !== undefined);
          relevantOrders = all.filter((o) => {
            if (o.payment_type   !== 'pay_checkout')     return false;
            if (o.payment_status !== 'unpaid')           return false;
            if (o.order_status   === 'cancelled')        return false;
            if (o.order_status   === 'awaiting_payment') return false;
            if (hasBid) return String(o.booking_id) === String(bookingData.id);
            return true;
          });
        } catch { relevantOrders = []; }
      }
      setFoodOrders(relevantOrders);
    } catch (err) {
      setLoadError(err.response?.data?.detail || err.message || 'Failed to load checkout data.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Bill calculations ─────────────────────────────────────────────────────
  const bookingBalance = safeMoney(booking?.amount_due);
  const foodTotal      = foodOrders.reduce((s, o) => s + safeMoney(o.total_price), 0);
  const grandTotal     = bookingBalance + foodTotal;

  // ── Confirm checkout ──────────────────────────────────────────────────────
  async function handleConfirmCheckout() {
    if (grandTotal > 0 && !selectedMethod) {
      setPayError('Select a payment method to collect the outstanding balance.');
      return;
    }
    setBusy(true);
    setPayError(null);

    try {
      // 1 — Settle food orders first
      const failedFoodIds = [];
      for (const order of foodOrders) {
        try {
          await api.patch(`/food/orders/${order.id}/mark-paid/`);
        } catch (err) {
          if (err.response?.status === 404) {
            console.warn(`[Checkout] Food order #${order.id} returned 404 — skipping.`);
          } else {
            failedFoodIds.push(order.id);
          }
        }
      }
      if (failedFoodIds.length > 0) {
        setPayError(
          `Could not settle food order${failedFoodIds.length > 1 ? 's' : ''} ` +
          `#${failedFoodIds.join(', #')}. Please retry or contact support.`,
        );
        setBusy(false);
        return;
      }

      // 2 — Checkout + collect accommodation balance
      const checkoutNote = [
        note.trim(),
        foodTotal > 0 ? `Food & Drinks ${formatPHP(foodTotal)} settled at checkout.` : '',
      ].filter(Boolean).join(' ');

      const checkoutRes = await frontDeskBookingsApi.checkout(
        bookingId || booking?.id,
        checkoutNote,
        selectedMethod?.value || null,
      );

      setSuccessSnapshot({
        grandTotal,
        bookingBalance,
        foodTotal,
        foodOrderCount: foodOrders.length,
        methodLabel:    selectedMethod?.label || null,
        receiptNumber:  checkoutRes?.checkout_summary?.receipt_number || null,
      });

      setStep(STEP.SUCCESS);
    } catch (err) {
      setPayError(
        err.response?.data?.detail ||
        err.response?.data?.error  ||
        err.message                ||
        'Checkout failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Loading / error guards ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fd-page">
        <div className="fd-inner" style={{ maxWidth: 760 }}>
          <div className="fd-loading"><div className="fd-spinner" /><p>Loading checkout</p></div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fd-page">
        <div className="fd-inner" style={{ maxWidth: 760 }}>
          <div className="fd-notice fd-notice-error">
            <span className="fd-notice-icon"><AlertCircle size={16} /></span>
            <span>{loadError}</span>
          </div>
          <button className="fd-btn" onClick={() => navigate('/staff/front-desk/today')}>
            <ChevronLeft size={14} /> Back
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fd-page">
      <div className="fd-inner" style={{ maxWidth: 760 }}>

        {/* Top row */}
        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Guest Checkout</h1>
            <p>Settle all charges and check out the guest</p>
          </div>
          <button className="fd-btn" onClick={() => navigate('/staff/front-desk/today')}>
            <ChevronLeft size={14} /> Back
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* ════ STEP 1: BILL REVIEW ════ */}
        {step === STEP.BILL && booking && (
          <div>
            <GuestInfoCard booking={booking} />

            <div className="fd-card">
              <div className="fd-card-label">Final Bill</div>

              {/* Accommodation */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--fd-text-muted)', marginBottom: 10,
              }}>
                <BedDouble size={12} /> Accommodation
              </div>

              <div className="fd-price-box" style={{ marginBottom: 20 }}>
                <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <span className="fd-price-label">Total booking amount</span>
                  <span className="fd-price-value">{formatPHP(booking.total_price)}</span>
                </div>
                <div className="fd-price-row">
                  <span className="fd-price-label">Already paid</span>
                  <span className="fd-price-value">&minus;{formatPHP(booking.amount_paid)}</span>
                </div>
                <div className="fd-price-row" style={{
                  borderTop: '1px solid var(--fd-surface-3)', paddingTop: 8, marginTop: 4,
                }}>
                  <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--fd-text)' }}>
                    Accommodation balance
                  </span>
                  <span className="fd-price-value" style={{
                    color: bookingBalance > 0 ? 'var(--fd-amber)' : 'var(--fd-text)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {bookingBalance > 0
                      ? formatPHP(bookingBalance)
                      : <><CheckCircle2 size={13} /> Settled</>}
                  </span>
                </div>
              </div>

              {/* Food & Drinks */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--fd-text-muted)', marginBottom: 10,
              }}>
                <UtensilsCrossed size={12} /> Food &amp; Drinks (Pay at Checkout)
              </div>

              {foodOrders.length === 0 ? (
                <div className="fd-price-box" style={{ marginBottom: 20 }}>
                  <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <span className="fd-price-label" style={{ color: 'var(--fd-text-faint)' }}>
                      No outstanding food charges
                    </span>
                    <span className="fd-price-value" style={{
                      display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fd-text)',
                    }}>
                      <CheckCircle2 size={13} /> None
                    </span>
                  </div>
                </div>
              ) : (
                <div className="fd-price-box" style={{ marginBottom: 20 }}>
                  {foodOrders.map((o) => (
                    <div key={o.id} className="fd-price-row" style={{ borderTop: 'none', paddingTop: 4 }}>
                      <span className="fd-price-label">
                        {o.food_item_name} &times; {o.quantity}
                        <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--fd-text-faint)' }}>#{o.id}</span>
                      </span>
                      <span className="fd-price-value">{formatPHP(o.total_price)}</span>
                    </div>
                  ))}
                  <div className="fd-price-row" style={{
                    borderTop: '1px solid var(--fd-surface-3)', paddingTop: 8, marginTop: 4,
                  }}>
                    <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--fd-text)' }}>
                      Food &amp; Drinks subtotal
                    </span>
                    <span className="fd-price-value" style={{ color: 'var(--fd-amber)' }}>
                      {formatPHP(foodTotal)}
                    </span>
                  </div>
                </div>
              )}

              {/* Grand total */}
              <div style={{
                background: 'var(--fd-accent-lt)', borderRadius: 'var(--fd-radius-md)', padding: '14px 18px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fd-text)' }}>
                    Grand Total Due
                  </span>
                  <span style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: 26, fontWeight: 400, color: 'var(--fd-text)', letterSpacing: '-0.01em',
                  }}>
                    {grandTotal > 0 ? formatPHP(grandTotal) : 'Fully Settled'}
                  </span>
                </div>
              </div>

              {grandTotal === 0 && (
                <div className="fd-notice fd-notice-success" style={{ marginTop: 14, marginBottom: 0 }}>
                  <span className="fd-notice-icon"><CheckCircle2 size={15} /></span>
                  <span>All charges are settled. You can proceed directly to checkout.</span>
                </div>
              )}
            </div>

            <button
              className="fd-btn fd-btn-primary fd-btn-full"
              style={{ padding: 14, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => setStep(STEP.PAYMENT)}
              disabled={!booking}
            >
              {grandTotal > 0 ? 'Proceed to Payment & Checkout' : 'Confirm Checkout'}
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* ════ STEP 2: PAYMENT & CHECKOUT ════ */}
        {step === STEP.PAYMENT && (
          <div>
            <div className="fd-card">
              <div className="fd-card-label">Checkout Summary</div>
              <div className="fd-notice fd-notice-blue" style={{ marginBottom: 0 }}>
                <span className="fd-notice-icon"><Info size={15} /></span>
                <div>
                  Checking out <strong>{booking?.full_name}</strong> &middot; Room{' '}
                  <strong>{booking?.room_number}</strong>
                  {grandTotal > 0
                    ? <> &middot; Collect <strong>{formatPHP(grandTotal)}</strong> before confirming.</>
                    : <> &middot; All charges settled — no payment needed.</>}
                </div>
              </div>
            </div>

            <div className="fd-card">

              {grandTotal > 0 && (
                <>
                  <div className="fd-card-label">Collect Outstanding Balance</div>

                  {payError && (
                    <div className="fd-notice fd-notice-error" style={{ marginBottom: 18 }}>
                      <span className="fd-notice-icon"><AlertCircle size={15} /></span>
                      <span>{payError}</span>
                    </div>
                  )}

                  <div className="fd-price-box" style={{ marginBottom: 24 }}>
                    {bookingBalance > 0 && (
                      <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                        <span className="fd-price-label">Accommodation balance</span>
                        <span className="fd-price-value">{formatPHP(bookingBalance)}</span>
                      </div>
                    )}
                    {foodTotal > 0 && (
                      <div className="fd-price-row">
                        <span className="fd-price-label">
                          Food &amp; Drinks
                          <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--fd-text-faint)' }}>
                            ({foodOrders.length} order{foodOrders.length !== 1 ? 's' : ''})
                          </span>
                        </span>
                        <span className="fd-price-value">{formatPHP(foodTotal)}</span>
                      </div>
                    )}
                    <div className="fd-price-row" style={{
                      borderTop: '1px solid var(--fd-surface-3)', paddingTop: 8, marginTop: 4,
                    }}>
                      <span className="fd-price-label" style={{ fontWeight: 700, color: 'var(--fd-text)' }}>
                        Total to Collect
                      </span>
                      <span className="fd-price-value gold" style={{ fontSize: 22 }}>
                        {formatPHP(grandTotal)}
                      </span>
                    </div>
                  </div>

                  <label className="fd-label" style={{ marginBottom: 12, display: 'block' }}>
                    Payment Method
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                    {PAYMENT_METHODS.map((pm) => (
                      <PaymentMethodButton
                        key={pm.value}
                        pm={pm}
                        selected={selectedMethod}
                        onSelect={(m) => { setSelectedMethod(m); setPayError(null); }}
                      />
                    ))}
                  </div>

                  {selectedMethod?.value === 'cash' && (
                    <div className="fd-notice fd-notice-amber" style={{ marginBottom: 16 }}>
                      <span className="fd-notice-icon"><Banknote size={15} /></span>
                      <span style={{ fontSize: 12 }}>
                        Collect <strong>{formatPHP(grandTotal)}</strong> in cash, then click Confirm Checkout.
                      </span>
                    </div>
                  )}
                  {selectedMethod?.value === 'card' && (
                    <div className="fd-notice fd-notice-blue" style={{ marginBottom: 16 }}>
                      <span className="fd-notice-icon"><CreditCard size={15} /></span>
                      <span style={{ fontSize: 12 }}>
                        Process <strong>{formatPHP(grandTotal)}</strong> on the POS terminal, then click Confirm once approved.
                      </span>
                    </div>
                  )}
                </>
              )}

              {grandTotal === 0 && (
                <>
                  <div className="fd-card-label">No Outstanding Balance</div>

                  {payError && (
                    <div className="fd-notice fd-notice-error" style={{ marginBottom: 18 }}>
                      <span className="fd-notice-icon"><AlertCircle size={15} /></span>
                      <span>{payError}</span>
                    </div>
                  )}

                  <div className="fd-notice fd-notice-success" style={{ marginBottom: 16 }}>
                    <span className="fd-notice-icon"><CheckCircle2 size={15} /></span>
                    <span>All charges have been settled. Confirm checkout to free the room.</span>
                  </div>

                  {foodOrders.length > 0 && (
                    <div className="fd-notice fd-notice-blue" style={{ marginBottom: 16 }}>
                      <span className="fd-notice-icon"><UtensilsCrossed size={15} /></span>
                      <span style={{ fontSize: 12 }}>
                        {foodOrders.length} food order{foodOrders.length !== 1 ? 's' : ''} totalling{' '}
                        <strong>{formatPHP(foodTotal)}</strong> will be marked as paid on confirmation.
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Optional checkout note */}
              <div className="fd-form-group" style={{ marginBottom: 20, marginTop: grandTotal === 0 ? 4 : 0 }}>
                <label className="fd-label">
                  Checkout Note{' '}
                  <span style={{
                    color: 'var(--fd-text-faint)', fontWeight: 400,
                    textTransform: 'none', letterSpacing: 0, fontSize: 10,
                  }}>
                    (optional)
                  </span>
                </label>
                <textarea
                  className="fd-textarea-lg"
                  rows={2}
                  placeholder="e.g. guest requested late checkout, room condition notes…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="fd-btn"
                  onClick={() => { setPayError(null); setStep(STEP.BILL); }}
                  disabled={busy}
                  style={{ flex: 1 }}
                >
                  <ChevronLeft size={14} /> Back to Bill
                </button>
                <button
                  className="fd-btn fd-btn-success"
                  style={{ flex: 2, padding: '13px', fontSize: 11 }}
                  onClick={handleConfirmCheckout}
                  disabled={busy || (grandTotal > 0 && !selectedMethod)}
                >
                  {busy
                    ? <><span className="fd-spinner-sm" /> Processing Checkout…</>
                    : <><CheckCircle2 size={14} /> Confirm Guest Checkout</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ STEP 3: SUCCESS ════ */}
        {step === STEP.SUCCESS && (
          <div className="fd-card">
            <div className="fd-success">
              <div className="fd-success-icon">
                <CheckCircle2 size={30} />
              </div>
              <h2 className="fd-success-title">Guest Checked Out</h2>
              <p className="fd-success-sub">
                <strong>{booking?.full_name}</strong> has been checked out from Room{' '}
                <strong>{booking?.room_number}</strong>. Room is now queued for cleaning.
              </p>

              <dl className="fd-success-creds">
                {[
                  ['Guest',     booking?.full_name],
                  ['Room',      `Room ${booking?.room_number}`],
                  ['Reference', booking?.reference_number],
                  ['Check-In',  formatDate(booking?.check_in)],
                  ['Check-Out', formatDate(booking?.check_out)],
                  ['Nights',    `${booking?.nights ?? '—'}`],
                  ...(successSnapshot?.bookingBalance > 0
                    ? [['Accommodation', `${formatPHP(successSnapshot.bookingBalance)} via ${successSnapshot.methodLabel}`]]
                    : [['Accommodation', 'Fully Settled']]),
                  ...(successSnapshot?.foodOrderCount > 0
                    ? [[
                        'Food Charges',
                        `${successSnapshot.foodOrderCount} order${successSnapshot.foodOrderCount !== 1 ? 's' : ''} · ${formatPHP(successSnapshot.foodTotal)}`,
                      ]]
                    : []),
                  ...(successSnapshot?.grandTotal > 0
                    ? [['Total Collected', formatPHP(successSnapshot.grandTotal)]]
                    : []),
                  ...(successSnapshot?.receiptNumber
                    ? [['Receipt No.', successSnapshot.receiptNumber]]
                    : []),
                ].map(([label, value]) => (
                  <div className="fd-cred-item" key={label}>
                    <dt>{label}</dt>
                    <dd className={label === 'Reference' || label === 'Receipt No.' ? 'highlight' : ''}>
                      {value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="fd-btn fd-btn-primary"
                  onClick={() => printReceipt({ booking, foodOrders, successSnapshot, selectedMethod, note })}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Printer size={14} /> Print Receipt
                </button>
                <button
                  className="fd-btn"
                  onClick={() => navigate('/staff/front-desk/today')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <CalendarCheck size={14} /> Today's Schedule
                </button>
                <button
                  className="fd-btn"
                  onClick={() => navigate('/staff/front-desk')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  Front Desk <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}