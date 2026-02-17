// src/features/auth/ForgotPassword.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import './AuthModern.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api/auth';

export default function ForgotPassword() {
  const navigate = useNavigate();

  // Steps: 'email' → 'code' → 'reset' → 'done'
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const inputRefs = useRef([]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Auto-focus first code input when step changes to 'code'
  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  // Step 1: Send reset code
  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axios.post(`${API_BASE}/forgot-password/`, { email });
      setStep('code');
      setCountdown(60);
    } catch (err) {
      const errorData = err.response?.data;
      setError(
        errorData?.email?.[0] ||
        errorData?.detail ||
        errorData?.non_field_errors?.[0] ||
        'Failed to send code. Please check your email and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Handle code input
  const handleCodeChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every(digit => digit !== '') && value) {
      handleVerifyCode(newCode.join(''));
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        const digits = text.replace(/\D/g, '').slice(0, 6).split('');
        const newCode = Array(6).fill('');
        digits.forEach((digit, i) => { newCode[i] = digit; });
        setCode(newCode);
        if (digits.length === 6) {
          handleVerifyCode(newCode.join(''));
        } else {
          inputRefs.current[Math.min(digits.length, 5)]?.focus();
        }
      });
    }
  };

  // Step 2: Verify the 6-digit code
  const handleVerifyCode = async (codeValue) => {
    const verificationCode = codeValue || code.join('');
    if (verificationCode.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await axios.post(`${API_BASE}/forgot-password/verify/`, {
        email,
        code: verificationCode
      });
      setStep('reset');
    } catch (err) {
      const errorData = err.response?.data;
      setError(
        errorData?.code?.[0] ||
        errorData?.detail ||
        'Invalid or expired code. Please try again.'
      );
      setCode(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Set new password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_BASE}/forgot-password/reset/`, {
        email,
        code: code.join(''),
        new_password: newPassword
      });
      setStep('done');
    } catch (err) {
      const errorData = err.response?.data;
      setError(
        errorData?.new_password?.[0] ||
        errorData?.detail ||
        'Failed to reset password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Resend code
  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setLoading(true);

    try {
      await axios.post(`${API_BASE}/forgot-password/`, { email });
      setCountdown(60);
      setCode(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modern-container">
      {/* Left Side - Image */}
      <div className="auth-modern-image">
        <div className="auth-modern-overlay">
          <div className="auth-modern-branding">
            <h1>Cebu Mini Hotel</h1>
            <p>Experience Comfort, Create Memories</p>
          </div>
          <div className="auth-modern-quote">
            <h2>Reset Your Password</h2>
            <p>We'll help you get back into your account</p>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="auth-modern-form-section">
        <div className="auth-modern-form-container">

          {/* Back button */}
          {step !== 'done' && (
            <button
              onClick={() => step === 'email' ? navigate('/login') : setStep(step === 'reset' ? 'code' : 'email')}
              className="link-modern"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}

          {/* Error Alert */}
          {error && (
            <div className="alert-modern alert-error">
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Enter Email */}
          {step === 'email' && (
            <>
              <div className="auth-modern-header">
                <h2>Forgot Password?</h2>
                <p>Enter your email and we'll send you a 6-digit reset code</p>
              </div>
              <form onSubmit={handleSendCode} className="auth-modern-form">
                <div className="form-group-modern">
                  <label htmlFor="email">
                    <Mail size={16} />
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    className="form-input-modern"
                    autoComplete="email"
                    required
                  />
                </div>
                <button type="submit" className="btn-modern btn-primary" disabled={loading}>
                  {loading ? (
                    <><span className="spinner-modern"></span>Sending Code...</>
                  ) : 'Send Reset Code'}
                </button>
              </form>
              <div className="auth-modern-footer">
                <p>
                  Remember your password?{' '}
                  <button onClick={() => navigate('/login')} className="link-modern">
                    Sign In
                  </button>
                </p>
              </div>
            </>
          )}

          {/* STEP 2: Enter 6-digit Code */}
          {step === 'code' && (
            <>
              <div className="auth-modern-header">
                <h2>Check Your Email</h2>
                <p>
                  We sent a 6-digit code to<br />
                  <strong>{email}</strong>
                </p>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }} className="auth-modern-form">
                <div className="code-input-group" style={{ justifyContent: 'center', margin: '1rem 0' }}>
                  {code.map((digit, index) => (
                    <input
                      key={index}
                      ref={el => inputRefs.current[index] = el}
                      type="text"
                      inputMode="numeric"
                      maxLength="1"
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      className={`code-input ${error ? 'error' : ''}`}
                      disabled={loading}
                      autoComplete="off"
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  className="btn-modern btn-primary"
                  disabled={loading || code.join('').length !== 6}
                >
                  {loading ? (
                    <><span className="spinner-modern"></span>Verifying...</>
                  ) : 'Verify Code'}
                </button>
              </form>
              <div className="verify-footer" style={{ textAlign: 'center', marginTop: '1rem' }}>
                <p>
                  Didn't receive the code?{' '}
                  <button
                    onClick={handleResend}
                    className="link-modern"
                    disabled={countdown > 0 || loading}
                    style={{ background: 'none', border: 'none', cursor: countdown > 0 ? 'default' : 'pointer' }}
                  >
                    {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                  </button>
                </p>
                <p style={{ marginTop: '0.5rem' }}>
                  <small>⏱ Code expires in 5 minutes</small>
                </p>
              </div>
            </>
          )}

          {/* STEP 3: Set New Password */}
          {step === 'reset' && (
            <>
              <div className="auth-modern-header">
                <h2>Set New Password</h2>
                <p>Choose a strong password for your account</p>
              </div>
              <form onSubmit={handleResetPassword} className="auth-modern-form">
                <div className="form-group-modern">
                  <label htmlFor="newPassword">
                    <Lock size={16} />
                    New Password
                  </label>
                  <div className="input-with-icon">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="newPassword"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                      className="form-input-modern"
                      autoComplete="new-password"
                      minLength="8"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="password-toggle"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div className="form-group-modern">
                  <label htmlFor="confirmPassword">
                    <Lock size={16} />
                    Confirm New Password
                  </label>
                  <div className="input-with-icon">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                      className={`form-input-modern ${
                        confirmPassword && newPassword === confirmPassword ? 'input-success' :
                        confirmPassword && newPassword !== confirmPassword ? 'input-error' : ''
                      }`}
                      autoComplete="new-password"
                      minLength="8"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="password-toggle"
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="input-hint error">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn-modern btn-primary"
                  disabled={loading || (confirmPassword && newPassword !== confirmPassword)}
                >
                  {loading ? (
                    <><span className="spinner-modern"></span>Resetting Password...</>
                  ) : 'Reset Password'}
                </button>
              </form>
            </>
          )}

          {/* STEP 4: Done */}
          {step === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div className="auth-modern-header">
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
                <h2>Password Reset!</h2>
                <p>Your password has been successfully updated. You can now sign in with your new password.</p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="btn-modern btn-primary"
                style={{ marginTop: '1rem' }}
              >
                Go to Sign In
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}