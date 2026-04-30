// src/features/auth/Login.jsx
// Adaptive challenge — shown only when backend signals it's needed.
// No react-google-recaptcha or any external CAPTCHA package required.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, getStoredUser } from '../../services/api';
import { Eye, EyeOff, Mail, Lock, ShieldAlert } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import './AuthModern.css';
import './LoginCaptcha.css';

const API_BASE = import.meta.env.VITE_AUTH_URL  || '/api/auth';

function getPostLoginRoute() {
  const user = getStoredUser();
  if (!user?.is_staff) return '/dashboard';
  const role =
    user?.staff_profile?.effective_role ??
    (user?.is_staff ? 'admin' : null);
  switch (role) {
    case 'front_desk':   return '/staff/front-desk';
    case 'housekeeping': return '/staff/cleaning';
    case 'maintenance':  return '/staff/maintenance';
    case 'security':     return '/staff/incidents';
    default:             return '/admin/dashboard';
  }
}

// ── Math Challenge widget ─────────────────────────────────────────────────────
// Backend sends { question: "12 + 7", token: "<signed-jwt>" }.
// The frontend shows the question and sends the answer + token back.
// If the captcha endpoint is unavailable we generate one locally as a fallback.
function MathChallenge({ puzzle, value, onChange, hasError }) {
  return (
    <div className="lc-captcha">
      <div className="lc-captcha__header">
        <ShieldAlert size={13} />
        <span>Security check — solve to continue</span>
      </div>
      <div className="lc-captcha__row">
        <span className="lc-captcha__question">{puzzle?.question ?? '…'}</span>
        <span className="lc-captcha__eq">=</span>
        <input
          type="number"
          className={`lc-captcha__input${hasError ? ' lc-captcha__input--error' : ''}`}
          placeholder="?"
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete="off"
          inputMode="numeric"
          aria-label="Answer"
        />
      </div>
      {hasError && <p className="lc-captcha__hint">Wrong answer — try again</p>}
    </div>
  );
}

export default function Login({ onSwitchToRegister, onForgotPassword, onClose }) {
  const navigate = useNavigate();

  const [formData, setFormData]       = useState({ email: '', password: '', auth_provider: 'email' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  // ── Adaptive challenge state ──────────────────────────────────────────────
  const [showChallenge, setShowChallenge] = useState(false);
  const [challenge, setChallenge]         = useState(null);   // { question, token }
  const [mathAnswer, setMathAnswer]       = useState('');
  const [mathError, setMathError]         = useState(false);

  const fetchChallenge = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/captcha/`);
      setChallenge(data);
    } catch {
      // Offline fallback — local puzzle (no server verification)
      const a = Math.floor(Math.random() * 15) + 2;
      const b = Math.floor(Math.random() * 15) + 2;
      setChallenge({ question: `${a} + ${b}`, answer: a + b, token: null });
    }
    setMathAnswer('');
    setMathError(false);
  };

  // ── Google OAuth ──────────────────────────────────────────────────────────
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const googleLogin = useGoogleLogin({
  flow: 'implicit',
  ux_mode: isMobile ? 'redirect' : 'popup',
  redirect_uri: 'https://cebu-mini-hotel-reservation-system-three.vercel.app/auth/google/callback',
  onSuccess: async (tokenResponse) => {
    // Only runs on desktop (popup mode)
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });
      await loginUser({
        email: data.email,
        auth_provider: 'google',
        access_token: tokenResponse.access_token,
      });
      await new Promise(r => setTimeout(r, 50));
      onClose?.();
      navigate(getPostLoginRoute());
    } catch (err) {
      setError(err.response?.data?.detail || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  },
  onError: () => { setError('Google sign-in cancelled'); setLoading(false); },
});

  // ── Email/password submit ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMathError(false);

    // Block submit if challenge is visible but unanswered
    if (showChallenge && !mathAnswer) {
      setMathError(true);
      return;
    }

    setLoading(true);
    try {
        const payload = { ...formData };
        if (showChallenge && challenge) {
          if (challenge.token) {
            payload.captcha_token  = challenge.token;
            payload.captcha_answer = mathAnswer;
          }
        }

      await loginUser(payload);
      onClose?.();
      navigate(getPostLoginRoute());

    } catch (err) {
      const d = err.response?.data;

      // ── Backend adaptive signal ───────────────────────────────────────────
      // The backend returns { captcha_required: true } under three conditions:
      //   1. ≥3 failed attempts from this IP in the last 10 minutes
      //   2. Request rate > 3 per 10 seconds from this IP
      //   3. The submitted captcha answer was wrong  →  also sets captcha_wrong: true
      if (d?.captcha_required) {
        if (d?.captcha_wrong) {
          // Keep challenge visible, highlight the input
          setMathError(true);
          setMathAnswer('');
        } else {
          // First time challenge is needed — fetch a fresh puzzle
          setShowChallenge(true);
          fetchChallenge();
          // Show the underlying auth error too if present
          if (d?.detail) setError(d.detail);
        }
        setLoading(false);
        return;
      }

      // Normal auth error
      setError(
        d?.email?.[0] || d?.email ||
        d?.password?.[0] || d?.password ||
        d?.non_field_errors?.[0] ||
        d?.detail ||
        'Invalid email or password'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
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
            <h2>Welcome Back!</h2>
            <p>Login to access your bookings and reservations</p>
          </div>
        </div>
      </div>

      <div className="auth-modern-form-section">
        <div className="auth-modern-form-container">
          <div className="auth-modern-header">
            <h2>Login</h2>
            <p>Welcome back! Please login to continue</p>
          </div>

          {error && <div className="alert-modern alert-error"><span>{error}</span></div>}

          <div className="auth-modern-social">
            <button type="button" onClick={() => { setError(''); googleLogin(); }}
              className="btn-social btn-google" disabled={loading}>
              <svg width="20" height="20" viewBox="0 0 20 20">
                <path fill="#4285F4" d="M19.6 10.23c0-.82-.1-1.42-.25-2.05H10v3.72h5.5c-.15.96-.74 2.31-2.04 3.22v2.45h3.16c1.89-1.73 2.98-4.3 2.98-7.34z"/>
                <path fill="#34A853" d="M13.46 15.13c-.83.59-1.96 1-3.46 1-2.64 0-4.88-1.74-5.68-4.15H1.07v2.52C2.72 17.75 6.09 20 10 20c2.7 0 4.96-.89 6.62-2.42l-3.16-2.45z"/>
                <path fill="#FBBC05" d="M3.99 10c0-.69.12-1.35.32-1.97V5.51H1.07A9.973 9.973 0 000 10c0 1.61.39 3.14 1.07 4.49l3.24-2.52c-.2-.62-.32-1.28-.32-1.97z"/>
                <path fill="#EA4335" d="M10 3.88c1.88 0 3.13.81 3.85 1.48l2.84-2.76C14.96.99 12.7 0 10 0 6.09 0 2.72 2.25 1.07 5.51l3.24 2.52C5.12 5.62 7.36 3.88 10 3.88z"/>
              </svg>
              {loading ? 'Connecting...' : 'Login with Google'}
            </button>
          </div>

          <div className="auth-modern-divider"><span>or login with email</span></div>

          <form onSubmit={handleSubmit} className="auth-modern-form">
            <div className="form-group-modern">
              <label htmlFor="login-email"><Mail size={16} /> Email Address</label>
              <input type="email" id="login-email" name="email"
                placeholder="your@email.com" value={formData.email}
                onChange={handleChange} className="form-input-modern"
                autoComplete="username" required />
            </div>

            <div className="form-group-modern">
              <label htmlFor="login-password"><Lock size={16} /> Password</label>
              <div className="input-with-icon">
                <input type={showPassword ? 'text' : 'password'}
                  id="login-password" name="password"
                  placeholder="Enter your password" value={formData.password}
                  onChange={handleChange} className="form-input-modern"
                  autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="password-toggle">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="form-options-modern">
              <button type="button" className="link-modern"
                onClick={() => onForgotPassword ? onForgotPassword() : navigate('/forgot-password')}>
                Forgot password?
              </button>
            </div>

            {/* Adaptive challenge — invisible to normal users */}
            {showChallenge && (
              <MathChallenge
                puzzle={challenge}
                value={mathAnswer}
                onChange={v => { setMathAnswer(v); setMathError(false); }}
                hasError={mathError}
              />
            )}

            <button type="submit" className="btn-modern btn-primary"
              disabled={loading || (showChallenge && !mathAnswer)}>
              {loading ? <><span className="spinner-modern" />Loging In...</> : 'Login'}
            </button>
          </form>

          <div className="auth-modern-footer">
            <p>
              Don't have an account?{' '}
              <button onClick={() => onSwitchToRegister ? onSwitchToRegister() : navigate('/register')}
                className="link-modern">
                Create Account
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}