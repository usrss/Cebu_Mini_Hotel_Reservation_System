// src/features/utils/cancellationUtils.js
/**
 * Cancellation policy utilities.
 *
 * Single source of truth for frontend refund calculations.
 * Used by: MyBookingsPage (cancel confirm UI), BookingForm (policy display).
 *
 * Tier format (from HotelSettings.cancellation_tiers):
 *   [
 *     { hours_before: 48, refund_pct: 90, label: "48+ hours before check-in" },
 *     { hours_before: 24, refund_pct: 50, label: "24–47 hours before check-in" },
 *     { hours_before: 0,  refund_pct: 0,  label: "Less than 24 hours / same day" },
 *   ]
 *
 * Tiers MUST be sorted descending by hours_before before calling these
 * functions. useHotelSettings.js guarantees this sort on fetch.
 */

import { DEFAULT_CANCELLATION_TIERS } from '../hooks/useHotelSettings';

/**
 * Given a sorted-descending tiers array and a check-in date string (YYYY-MM-DD),
 * returns the applicable refund percentage as a number (0–100).
 *
 * Mirrors the backend Booking.compute_refund() logic exactly.
 *
 * @param {Array}  tiers    - Sorted descending by hours_before
 * @param {string} checkIn  - "YYYY-MM-DD"
 * @returns {number}        - Refund percentage (e.g. 90, 50, 0)
 */
export function computeRefundPct(tiers, checkIn) {
  if (!checkIn) return 0;

  const now        = new Date();
  const checkInMs  = new Date(checkIn + 'T00:00:00').getTime();
  const hoursUntil = (checkInMs - now.getTime()) / 3600000;

  const activeTiers = Array.isArray(tiers) && tiers.length > 0
    ? tiers
    : DEFAULT_CANCELLATION_TIERS;

  // Sorted descending — first matching tier wins
  for (const tier of activeTiers) {
    if (hoursUntil >= (tier.hours_before ?? 0)) {
      return Number(tier.refund_pct ?? 0);
    }
  }

  // Catch-all: no refund
  return 0;
}

/**
 * Returns the full matched tier object for a given check-in date.
 * Useful for displaying the label alongside the percentage.
 *
 * @param {Array}  tiers
 * @param {string} checkIn
 * @returns {{ hours_before: number, refund_pct: number, label: string } | null}
 */
export function getMatchedTier(tiers, checkIn) {
  if (!checkIn) return null;

  const now        = new Date();
  const checkInMs  = new Date(checkIn + 'T00:00:00').getTime();
  const hoursUntil = (checkInMs - now.getTime()) / 3600000;

  const activeTiers = Array.isArray(tiers) && tiers.length > 0
    ? tiers
    : DEFAULT_CANCELLATION_TIERS;

  for (const tier of activeTiers) {
    if (hoursUntil >= (tier.hours_before ?? 0)) {
      return tier;
    }
  }
  return activeTiers[activeTiers.length - 1] ?? null;
}

/**
 * Given a refund percentage and total booking price, returns the
 * refund amount in PHP (2 decimal places).
 *
 * @param {number} pct        - Refund percentage (0–100)
 * @param {number|string} total
 * @returns {number}
 */
export function computeRefundAmount(pct, total) {
  const t = Number(total) || 0;
  return parseFloat(((t * pct) / 100).toFixed(2));
}

/**
 * Returns a human-readable summary string for the current refund eligibility.
 * Used in the cancel confirmation panel.
 *
 * @param {Array}  tiers
 * @param {string} checkIn
 * @param {number|string} totalPrice
 * @param {boolean} hasPaid
 * @returns {{ pct: number, amount: number, label: string, description: string }}
 */
export function getCancellationSummary(tiers, checkIn, totalPrice, hasPaid) {
  if (!hasPaid) {
    return {
      pct:         0,
      amount:      0,
      label:       'No charge',
      description: 'No payment was made — cancellation is free.',
    };
  }

  const pct    = computeRefundPct(tiers, checkIn);
  const amount = computeRefundAmount(pct, totalPrice);
  const tier   = getMatchedTier(tiers, checkIn);

  if (pct === 0) {
    return {
      pct,
      amount,
      label:       'No refund',
      description: tier?.label
        ? `${tier.label}: no refund applies.`
        : 'No refund eligible for this cancellation.',
    };
  }

  const fmt = (n) => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return {
    pct,
    amount,
    label:       `${pct}% refund`,
    description: `${tier?.label ?? ''}: ${pct}% refund — ₱${fmt(amount)}. Refunds take 3–7 business days.`,
  };
}