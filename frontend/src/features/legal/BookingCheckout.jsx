import React, { useEffect, useState } from "react";
import { Hotel, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { getActiveTerms, getActivePrivacy, acceptLegal } from "../../services/legalApi";
import LegalCheckbox from "./LegalCheckbox";
import "./BookingCheckout.css";

/**
 * BookingCheckout — Example booking page with legal agreement integration.
 */
const BookingCheckout = () => {
  const [termsDoc,     setTermsDoc]     = useState(null);
  const [privacyDoc,   setPrivacyDoc]   = useState(null);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalAgreed,  setLegalAgreed]  = useState(false);
  const [legalError,   setLegalError]   = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [confirmed,    setConfirmed]    = useState(false);
  const [submitError,  setSubmitError]  = useState(null);

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
        // Legal docs missing — block submission
      } finally {
        setLegalLoading(false);
      }
    };
    fetchLegal();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

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
      await acceptLegal({
        terms_version: termsDoc.version,
        privacy_version: privacyDoc.version,
      });
      // TODO: Submit your actual booking data here
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

  if (confirmed) {
    return (
      <div className="bc-page">
        <div className="bc-confirmation">
          <div className="bc-confirm-icon">
            <CheckCircle2 size={24} />
          </div>
          <p className="bc-confirm-eyebrow">Reservation Confirmed</p>
          <h2 className="bc-confirm-title">Booking Confirmed</h2>
          <p className="bc-confirm-text">
            Your reservation at Cebu Mini Hotel has been submitted. You agreed to
            Terms &amp; Conditions <strong>v{termsDoc?.version}</strong> and Privacy
            Policy <strong>v{privacyDoc?.version}</strong>.
          </p>
          <a href="/" className="bc-btn bc-btn-primary">
            Return to Home <ArrowRight size={13} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bc-page">
      <div className="bc-container">

        <header className="bc-header">
          <div className="bc-header-icon">
            <Hotel size={20} />
          </div>
          <div>
            <span className="bc-eyebrow">Cebu Mini Hotel</span>
            <h1 className="bc-title">Complete Your Booking</h1>
          </div>
        </header>

        <form className="bc-form" onSubmit={handleSubmit} noValidate>

          {/* Booking details section (placeholder) */}
          <section className="bc-section">
            <p className="bc-section-title">Guest Information</p>
            <p className="bc-section-note">
              Your existing booking form fields go here — room selection, guest
              details, check-in / check-out dates, payment information, etc.
            </p>
          </section>

          {/* Legal agreement section */}
          <section className="bc-section">
            <p className="bc-section-title">Legal Agreement</p>

            {legalLoading ? (
              <div className="bc-legal-loading">
                <div className="bc-spinner" />
                Loading legal documents
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
                <AlertTriangle size={13} />
                Legal documents are not yet published. Booking may be unavailable.
              </p>
            )}
          </section>

          {/* Submit error */}
          {submitError && (
            <div className="bc-submit-error" role="alert">
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {submitError}
            </div>
          )}

          {/* Submit */}
          <div className="bc-submit-row">
            <button
              type="submit"
              className="bc-btn bc-btn-primary"
              disabled={submitting || legalLoading || !legalAgreed}
            >
              {submitting ? (
                <><span className="bc-btn-spinner" /> Processing</>
              ) : (
                <>Confirm Booking <ArrowRight size={13} /></>
              )}
            </button>
            <p className="bc-submit-note">
              By confirming, you agree to all terms listed above.
            </p>
          </div>

        </form>
      </div>
    </div>
  );
};

export default BookingCheckout;