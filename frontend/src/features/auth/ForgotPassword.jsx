// src/features/auth/ForgotPassword.jsx
// All logic identical to original — only back-button style updated
// to use .am-back-btn class (light theme compatible).

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import './AuthModern.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api/auth';

export default function ForgotPassword({ onSwitchToLogin }) {
  const navigate = useNavigate();

  const [step,            setStep]            = useState('email');
  const [email,           setEmail]           = useState('');
  const [code,            setCode]            = useState(['', '', '', '', '', '']);
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [countdown,       setCountdown]       = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (step === 'code') setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, [step]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/forgot-password/`, { email });
      setStep('code');
      setCountdown(60);
    } catch (err) {
      const d = err.response?.data;
      setError(d?.email?.[0] || d?.detail || d?.non_field_errors?.[0] || 'Failed to send code. Please check your email.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newCode.every(digit => digit !== '') && value) handleVerifyCode(newCode.join(''));
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        const digits = text.replace(/\D/g, '').slice(0, 6).split('');
        const newCode = Array(6).fill('');
        digits.forEach((digit, i) => { newCode[i] = digit; });
        setCode(newCode);
        if (digits.length === 6) handleVerifyCode(newCode.join(''));
        else inputRefs.current[Math.min(digits.length, 5)]?.focus();
      });
    }
  };

  const handleVerifyCode = async (codeValue) => {
    const verificationCode = codeValue || code.join('');
    if (verificationCode.length !== 6) { setError('Please enter all 6 digits'); return; }
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/forgot-password/verify/`, { email, code: verificationCode });
      setStep('reset');
    } catch (err) {
      const d = err.response?.data;
      setError(d?.code?.[0] || d?.detail || 'Invalid or expired code. Please try again.');
      setCode(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/forgot-password/reset/`, {
        email, code: code.join(''), new_password: newPassword,
      });
      setStep('done');
    } catch (err) {
      const d = err.response?.data;
      setError(d?.new_password?.[0] || d?.detail || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/forgot-password/`, { email });
      setCountdown(60);
      setCode(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError('Failed to resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (step === 'email') {
      onSwitchToLogin ? onSwitchToLogin() : navigate('/login');
    } else if (step === 'reset') {
      setStep('code');
    } else {
      setStep('email');
    }
  };

  return (
    <div className="auth-modern-container">
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

      <div className="auth-modern-form-section">
        <div className="auth-modern-form-container">

          {step !== 'done' && (
            <button onClick={goBack} className="am-back-btn">
              <ArrowLeft size={14} /> Back
            </button>
          )}

          {error && (
            <div className="alert-modern alert-error">
              <span>{error}</span>
            </div>
          )}

          {/* ── Email step ── */}
          {step === 'email' && (
            <>
              <div className="auth-modern-header">
                <h2>Forgot Password?</h2>
                <p>Enter your email and we'll send you a 6-digit reset code.</p>
              </div>
              <form onSubmit={handleSendCode} className="auth-modern-form">
                <div className="form-group-modern">
                  <label htmlFor="fp-email"><Mail size={13} /> Email Address</label>
                  <input
                    type="email" id="fp-email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    className="form-input-modern"
                    autoComplete="email"
                    required
                  />
                </div>
                <button type="submit" className="btn-modern btn-primary" disabled={loading}>
                  {loading ? <><span className="spinner-modern" />Sending Code…</> : 'Send Reset Code'}
                </button>
              </form>
              <div className="auth-modern-footer">
                <p>
                  Remember your password?{' '}
                  <button
                    onClick={() => onSwitchToLogin ? onSwitchToLogin() : navigate('/login')}
                    className="link-modern"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </>
          )}

          {/* ── Code step ── */}
          {step === 'code' && (
            <>
              <div className="auth-modern-header">
                <h2>Check Your Email</h2>
                <p>We sent a 6-digit code to <strong>{email}</strong></p>
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }}
                className="auth-modern-form"
              >
                <div className="code-input-group">
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
                      className={`code-input${error ? ' error' : ''}`}
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
                  {loading ? <><span className="spinner-modern" />Verifying…</> : 'Verify Code'}
                </button>
              </form>
              <div className="verify-footer" style={{ textAlign: 'center' }}>
                <p>
                  Didn't receive the code?{' '}
                  <button
                    onClick={handleResend}
                    className="link-button"
                    disabled={countdown > 0 || loading}
                  >
                    {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                  </button>
                </p>
                <p className="mt-3"><small>Code expires in 5 minutes</small></p>
              </div>
            </>
          )}

          {/* ── Reset step ── */}
          {step === 'reset' && (
            <>
              <div className="auth-modern-header">
                <h2>Set New Password</h2>
                <p>Choose a strong password for your account.</p>
              </div>
              <form onSubmit={handleResetPassword} className="auth-modern-form">
                <div className="form-group-modern">
                  <label htmlFor="fp-newPassword"><Lock size={13} /> New Password</label>
                  <div className="input-with-icon">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="fp-newPassword"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                      className="form-input-modern"
                      autoComplete="new-password"
                      minLength="8"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="password-toggle">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="form-group-modern">
                  <label htmlFor="fp-confirmPassword"><Lock size={13} /> Confirm New Password</label>
                  <div className="input-with-icon">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="fp-confirmPassword"
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                      className={`form-input-modern${confirmPassword && newPassword === confirmPassword ? ' input-success' : confirmPassword && newPassword !== confirmPassword ? ' input-error' : ''}`}
                      autoComplete="new-password"
                      minLength="8"
                      required
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="password-toggle">
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
                  {loading ? <><span className="spinner-modern" />Resetting Password…</> : 'Reset Password'}
                </button>
              </form>
            </>
          )}

          {/* ── Done step ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', paddingTop: '16px' }}>
              <div className="auth-modern-header">
                <h2>Password Reset!</h2>
                <p>Your password has been updated. You can now sign in with your new password.</p>
              </div>
              <button
                onClick={() => onSwitchToLogin ? onSwitchToLogin() : navigate('/login')}
                className="btn-modern btn-primary"
                style={{ marginTop: '16px' }}
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