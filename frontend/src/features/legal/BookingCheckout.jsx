import React, { useEffect, useState } from "react";
import { getActiveTerms, getActivePrivacy, acceptLegal } from "../../services/legalApi";
import LegalCheckbox from "./LegalCheckbox";
import "./BookingCheckout.css";

/**
 * BookingCheckout — Example booking page with legal agreement integration.
 *
 * Usage: Import this into your existing booking/checkout page and
 * replace the relevant sections. The key integration points are:
 *   1. Fetch active terms/privacy versions on mount
 *   2. Render <LegalCheckbox /> in your form
 *   3. Call acceptLegal() before or alongside your booking submission
 *
 * Route: /booking/checkout (adapt to your router config)
 */
const BookingCheckout = () => {
  // ── Legal state ───────────────────────────────────────────────
  const [termsDoc, setTermsDoc] = useState(null);
  const [privacyDoc, setPrivacyDoc] = useState(null);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalAgreed, setLegalAgreed] = useState(false);
  const [legalError, setLegalError] = useState(null);

  // ── Form / booking state ─────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Fetch active legal documents on mount
  useEffect(() => {
    const fetchLegal = async () => {
      try {
        const [termsRes, privacyRes] = await Promise.all([
          getActiveTerms(),
          getActivePrivacy(),
        ]);
        setTermsDoc(termsRes.data);
        setPrivacyDoc(privacyRes.data);
      } catch {
        // Legal docs missing — we still allow rendering but will block submission
      } finally {
        setLegalLoading(false);
      }
    };
    fetchLegal();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    // Legal agreement validation
    if (!legalAgreed) {
      setLegalError("You must agree to the Terms & Conditions and Privacy Policy to proceed.");
      return;
    }

    if (!termsDoc || !privacyDoc) {
      setLegalError("Legal documents are not available. Please contact support.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Record legal acceptance
      await acceptLegal({
        terms_version: termsDoc.version,
        privacy_version: privacyDoc.version,
      });

      // 2. TODO: Submit your actual booking data here
      // await createBooking({ ...bookingData });

      setConfirmed(true);
    } catch (err) {
      const data = err.response?.data;
      setSubmitError(
        data?.detail ||
        (typeof data === "object" ? JSON.stringify(data) : null) ||
        "Booking failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Confirmation screen ────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="bc-page">
        <div className="bc-confirmation">
          <div className="bc-confirm-icon">✓</div>
          <h2 className="bc-confirm-title">Booking Confirmed!</h2>
          <p className="bc-confirm-text">
            Your reservation at Cebu Mene Hotel has been submitted. You agreed to
            Terms &amp; Conditions <strong>v{termsDoc?.version}</strong> and Privacy
            Policy <strong>v{privacyDoc?.version}</strong>.
          </p>
          <a href="/" className="bc-btn bc-btn-primary">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bc-page">
      <div className="bc-container">
        <header className="bc-header">
          <div className="bc-hotel-logo">🏨</div>
          <div>
            <h1 className="bc-title">Complete Your Booking</h1>
            <p className="bc-subtitle">Cebu Mene Hotel — Checkout</p>
          </div>
        </header>

        <form className="bc-form" onSubmit={handleSubmit} noValidate>
          {/* ── Booking details section (placeholder) ── */}
          <section className="bc-section">
            <h2 className="bc-section-title">Guest Information</h2>
            <p className="bc-section-note">
              {/* Replace this with your actual booking form fields */}
              ✦ Your existing booking form fields go here (room selection, guest
              details, check-in/out dates, payment, etc.)
            </p>
          </section>

          {/* ── Legal agreement section ── */}
          <section className="bc-section">
            <h2 className="bc-section-title">Legal Agreement</h2>

            {legalLoading ? (
              <div className="bc-legal-loading">
                <div className="bc-spinner" /> Loading legal documents…
              </div>
            ) : (
              <LegalCheckbox
                checked={legalAgreed}
                onChange={(checked) => {
                  setLegalAgreed(checked);
                  if (checked) setLegalError(null);
                }}
                termsVersion={termsDoc?.version}
                privacyVersion={privacyDoc?.version}
                error={legalError}
              />
            )}

            {(!termsDoc || !privacyDoc) && !legalLoading && (
              <p className="bc-legal-warn">
                ⚠ Legal documents are not yet published. Booking may be unavailable.
              </p>
            )}
          </section>

          {/* Submit error */}
          {submitError && (
            <div className="bc-submit-error" role="alert">
              {submitError}
            </div>
          )}

          {/* Submit button */}
          <div className="bc-submit-row">
            <button
              type="submit"
              className="bc-btn bc-btn-primary bc-btn-lg"
              disabled={submitting || legalLoading || !legalAgreed}
            >
              {submitting ? (
                <><span className="bc-btn-spinner" /> Processing…</>
              ) : (
                "Confirm Booking"
              )}
            </button>
            <p className="bc-submit-note">
              By clicking "Confirm Booking" you agree to all terms listed above.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingCheckout;
