import React from "react";
import "./LegalCheckbox.css";

/**
 * LegalCheckbox
 * Booking checkout agreement checkbox with links to Terms & Privacy pages.
 *
 * Props:
 *   checked        - boolean (controlled)
 *   onChange       - (checked: boolean) => void
 *   termsVersion   - string (active terms version)
 *   privacyVersion - string (active privacy version)
 *   disabled       - boolean (optional, disables checkbox)
 *   error          - string | null (validation error message)
 */
const LegalCheckbox = ({
  checked,
  onChange,
  termsVersion,
  privacyVersion,
  disabled = false,
  error = null,
}) => {
  const handleChange = (e) => {
    if (!disabled) onChange(e.target.checked);
  };

  return (
    <div className={`lc-wrapper ${error ? "lc-has-error" : ""}`}>
      <label className={`lc-label ${disabled ? "lc-disabled" : ""}`}>
        <div className="lc-checkbox-wrap">
          <input
            type="checkbox"
            className="lc-input"
            checked={checked}
            onChange={handleChange}
            disabled={disabled}
            aria-describedby={error ? "lc-error-msg" : undefined}
          />
          <span className={`lc-custom-checkbox ${checked ? "lc-checked" : ""}`}>
            {checked && (
              <svg viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M1 5L4.5 8.5L11 1.5"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </div>

        <span className="lc-text">
          I have read and agree to the{" "}
          <a
            href="/terms-and-conditions"
            target="_blank"
            rel="noopener noreferrer"
            className="lc-link"
            onClick={(e) => e.stopPropagation()}
          >
            Terms & Conditions
            {termsVersion && <sup className="lc-version"> v{termsVersion}</sup>}
          </a>{" "}
          and{" "}
          <a
            href="/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="lc-link"
            onClick={(e) => e.stopPropagation()}
          >
            Privacy Policy
            {privacyVersion && <sup className="lc-version"> v{privacyVersion}</sup>}
          </a>{" "}
          of Cebu Mene Hotel.
        </span>
      </label>

      {error && (
        <p id="lc-error-msg" className="lc-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default LegalCheckbox;
