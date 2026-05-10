// src/features/auth/VerifyCode.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { verifyCode, resendCode } from '../../services/api';
import './AuthModern.css';

// onSwitchToLogin, onSuccess — provided when used inside AuthModal
export default function VerifyCode({ email: emailProp, onSwitchToLogin, onSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Use prop (modal) or navigation state (standalone page)
  const email = emailProp || location.state?.email || '';

  const [code,      setCode]      = useState(['', '', '', '', '', '']);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef([]);

  // Guard — if no email, send back to register
  useEffect(() => {
    if (!email) navigate('/register', { replace: true });
  }, [email]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newCode.every(digit => digit !== '') && value) handleSubmit(null, newCode.join(''));
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        const digits = text.replace(/\D/g, '').slice(0, 6).split('');
        const newCode = [...code];
        digits.forEach((digit, i) => { if (i < 6) newCode[i] = digit; });
        setCode(newCode);
        if (digits.length === 6) handleSubmit(null, newCode.join(''));
        else inputRefs.current[Math.min(digits.length, 5)]?.focus();
      });
    }
  };

  const handleSubmit = async (e, codeValue) => {
    if (e) e.preventDefault();
    const verificationCode = codeValue || code.join('');
    if (verificationCode.length !== 6) { setError('Please enter all 6 digits'); return; }
    setError('');
    setLoading(true);
    try {
      await verifyCode({ email, code: verificationCode });
      setSuccess(true);
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();              // AuthModal handles routing
        } else {
          navigate('/dashboard');   // standalone page always goes to dashboard
        }
      }, 1500);
    } catch (err) {
      console.error('Verification error:', err);
      if (err.response?.data) {
        const d = err.response.data;
        setError(d.code?.[0] || d.code || d.detail || 'Verification failed. Please try again.');
      } else {
        setError('Network error. Please check your connection.');
      }
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResending(true);
    setError('');
    try {
      await resendCode({ email, purpose: 'registration' });
      setCountdown(60);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch {
      setError('Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card verify-card">
        <div className="auth-header">
          <h2>Check Your Email</h2>
          <p>We sent a verification code to<br /><strong>{email}</strong></p>
        </div>

        {error   && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">Verification successful! Redirecting...</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="code-input-group">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={el => inputRefs.current[index] = el}
                type="text" inputMode="numeric" maxLength="1"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className={`code-input ${error ? 'error' : ''} ${success ? 'success' : ''}`}
                disabled={loading || success}
                autoComplete="off"
              />
            ))}
          </div>
          <button type="submit" className="btn btn-primary btn-block"
            disabled={loading || success || code.join('').length !== 6}>
            {loading ? <><span className="spinner"></span>Verifying...</> : success ? 'Verified!' : 'Verify Code'}
          </button>
        </form>

        <div className="verify-footer">
          <p>
            Didn't receive the code?{' '}
            <button onClick={handleResend} className="link-button" disabled={countdown > 0 || resending}>
              {resending ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
            </button>
          </p>
          <p className="mt-3">
            <button
              onClick={() => onSwitchToLogin ? onSwitchToLogin() : navigate('/register')}
              className="link-button"
            >
              ← Use different email
            </button>
          </p>
        </div>

        <div className="verify-info">
          <small>Code expires in 5 minutes · Check your spam folder if you don't see the email</small>
        </div>
      </div>
    </div>
  );
}