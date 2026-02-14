// src/features/auth/VerifyCode.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyCode, resendCode } from '../../services/api';
import './Auth.css';

export default function VerifyCode({ email }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
  // Refs for input fields
  const inputRefs = useRef([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all fields filled
    if (newCode.every(digit => digit !== '') && value) {
      handleSubmit(null, newCode.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    
    // Handle paste
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        const digits = text.replace(/\D/g, '').slice(0, 6).split('');
        const newCode = [...code];
        digits.forEach((digit, i) => {
          if (i < 6) newCode[i] = digit;
        });
        setCode(newCode);
        
        // Focus last filled input or submit if complete
        if (digits.length === 6) {
          handleSubmit(null, newCode.join(''));
        } else {
          inputRefs.current[Math.min(digits.length, 5)]?.focus();
        }
      });
    }
  };

  const handleSubmit = async (e, codeValue) => {
    if (e) e.preventDefault();
    
    const verificationCode = codeValue || code.join('');
    
    if (verificationCode.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await verifyCode({ email, code: verificationCode });
      setSuccess(true);
      
      // Check if first login
      if (response.is_first_login) {
        // Redirect to dashboard for first-time users
        setTimeout(() => navigate('/dashboard'), 1500);
      } else {
        // Redirect to login for existing users
        setTimeout(() => navigate('/login'), 1500);
      }
    } catch (err) {
      console.error('Verification error:', err);
      
      if (err.response?.data) {
        const errorData = err.response.data;
        if (errorData.code) {
          setError(Array.isArray(errorData.code) ? errorData.code[0] : errorData.code);
        } else if (errorData.detail) {
          setError(errorData.detail);
        } else {
          setError('Verification failed. Please try again.');
        }
      } else {
        setError('Network error. Please check your connection.');
      }
      
      // Clear code on error
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
      setCountdown(60); // 60 second cooldown
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      
      // Show success message briefly
      const successMsg = 'New code sent to your email';
      setError(''); // Clear any errors
      setTimeout(() => {
        // You could add a success state here if desired
      }, 100);
    } catch (err) {
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
          <p>
            We sent a verification code to<br />
            <strong>{email}</strong>
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            ✓ Verification successful! Redirecting...
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="code-input-group">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={el => inputRefs.current[index] = el}
                type="text"
                inputMode="numeric"
                maxLength="1"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className={`code-input ${error ? 'error' : ''} ${success ? 'success' : ''}`}
                disabled={loading || success}
                autoComplete="off"
              />
            ))}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading || success || code.join('').length !== 6}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Verifying...
              </>
            ) : success ? (
              '✓ Verified!'
            ) : (
              'Verify Code'
            )}
          </button>
        </form>

        <div className="verify-footer">
          <p>
            Didn't receive the code?{' '}
            <button
              onClick={handleResend}
              className="link-button"
              disabled={countdown > 0 || resending}
            >
              {resending ? (
                'Sending...'
              ) : countdown > 0 ? (
                `Resend in ${countdown}s`
              ) : (
                'Resend Code'
              )}
            </button>
          </p>
          
          <p className="mt-3">
            <button
              onClick={() => window.location.reload()}
              className="link-button"
            >
              ← Use different email
            </button>
          </p>
        </div>

        <div className="verify-info">
          <small>
            ⏱ Code expires in 5 minutes<br />
            📧 Check your spam folder if you don't see the email
          </small>
        </div>
      </div>
    </div>
  );
}