// src/features/auth/Register.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser, googleAuthenticate } from '../../services/api';
import { Eye, EyeOff, Mail, Lock, User, Check, X } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import './AuthModern.css';

const PASSWORD_RULES = [
  { id: 'length',  label: 'At least 8 characters',       test: (p) => p.length >= 8 },
  { id: 'upper',   label: 'At least 1 uppercase letter',  test: (p) => /[A-Z]/.test(p) },
  { id: 'number',  label: 'At least 1 number',            test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'At least 1 special character', test: (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
];

function validatePassword(password) {
  return PASSWORD_RULES.every(rule => rule.test(password));
}

// onSwitchToLogin, onVerify, onSuccess — provided when used inside AuthModal
export default function Register({ onSwitchToLogin, onVerify, onSuccess }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '', password: '', confirmPassword: '',
    first_name: '', last_name: '', auth_provider: 'email',
  });
  const [showPassword, setShowPassword]             = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordMatch, setPasswordMatch]           = useState(null);
  const [passwordFocused, setPasswordFocused]       = useState(false);
  const [loading, setLoading]                       = useState(false);
  const [error, setError]                           = useState('');
  const [agreedTerms, setAgreedTerms]               = useState(false);
  const [agreedPrivacy, setAgreedPrivacy]           = useState(false);
  const [legalError, setLegalError]                 = useState('');

  useEffect(() => {
    if (formData.confirmPassword) {
      setPasswordMatch(formData.password === formData.confirmPassword);
    } else {
      setPasswordMatch(null);
    }
  }, [formData.password, formData.confirmPassword]);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    ux_mode: isMobile ? 'redirect' : 'popup',
    redirect_uri: 'https://cebu-mini-hotel-reservation-system-three.vercel.app/auth/google/callback',
    onSuccess: async (tokenResponse) => {
      console.log('Google login success:', tokenResponse);
      setLoading(true);
      setError('');
      try {
        // Get user info from Google
        const userInfoResponse = await axios.get(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
        );
        console.log('User info:', userInfoResponse.data);

        // Use googleAuthenticate function
        await googleAuthenticate(tokenResponse.access_token, userInfoResponse.data);

        // Use onSuccess if provided (modal context), otherwise navigate directly
        if (onSuccess) {
          onSuccess();
        } else {
          navigate('/');
        }
      } catch (err) {
        console.error('Google authentication error:', err);

        const errorData = err.response?.data;
        setError(
          errorData?.email?.[0] || errorData?.email ||
          errorData?.detail || 'Google sign-in failed. Please try email registration.'
        );
      } finally {
        setLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google login error:', error);
      setError('Google sign-in was cancelled or failed. Please try again.');
      setLoading(false);
    },
  });

  const handleGoogleLogin = () => {
    // Check if legal agreements are accepted before proceeding with Google sign-in
    if (!agreedTerms || !agreedPrivacy) {
      setLegalError('You must agree to both the Terms & Conditions and Privacy Policy to create an account.');
      return;
    }
    setError('');
    setLegalError('');
    googleLogin();
  };

  const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validatePassword(formData.password)) { setError('Password does not meet all the requirements.'); return; }
    if (formData.password !== formData.confirmPassword) { setError('Passwords do not match'); return; }
    if (!agreedTerms || !agreedPrivacy) {
      setLegalError('You must agree to both the Terms & Conditions and Privacy Policy to create an account.');
      return;
    }

    setLoading(true);
    try {
      const { confirmPassword, ...dataToSend } = formData;
      await registerUser(dataToSend);
      if (onVerify) {
        onVerify(formData.email);
      } else {
        navigate('/verify');
      }
    } catch (err) {
      console.error('Registration error:', err);
      if (err.response?.data) {
        const d = err.response.data;
        setError(
          d.email?.[0] || d.email ||
          d.password?.[0] || d.password ||
          d.non_field_errors?.[0] ||
          d.detail ||
          'Registration failed. Please try again.'
        );
      } else {
        setError('Network error. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isPasswordValid = validatePassword(formData.password);
  const canUseGoogleAuth = agreedTerms && agreedPrivacy;

  return (
    <div className="auth-modern-container">
      <div className="auth-modern-image">
        <div className="auth-modern-overlay">
          <div className="auth-modern-branding">
            <h1>Cebu Mini Hotel</h1>
            <p>Experience Comfort, Create Memories</p>
          </div>
          <div className="auth-modern-quote">
            <h2>Welcome to Your Home Away From Home</h2>
            <p>Book your perfect stay with us</p>
          </div>
        </div>
      </div>

      <div className="auth-modern-form-section">
        <div className="auth-modern-form-container">
          <div className="auth-modern-header">
            <h2>Become a Member</h2>
            <p>Join us for exclusive benefits and easy booking</p>
          </div>

          {error && (
            <div className="alert-modern alert-error"><X size={18} /><span>{error}</span></div>
          )}

          <div className="auth-modern-social">
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="btn-social btn-google"
              disabled={loading || !canUseGoogleAuth}
            >
              <svg width="20" height="20" viewBox="0 0 20 20">
                <path fill="#4285F4" d="M19.6 10.23c0-.82-.1-1.42-.25-2.05H10v3.72h5.5c-.15.96-.74 2.31-2.04 3.22v2.45h3.16c1.89-1.73 2.98-4.3 2.98-7.34z"/>
                <path fill="#34A853" d="M13.46 15.13c-.83.59-1.96 1-3.46 1-2.64 0-4.88-1.74-5.68-4.15H1.07v2.52C2.72 17.75 6.09 20 10 20c2.7 0 4.96-.89 6.62-2.42l-3.16-2.45z"/>
                <path fill="#FBBC05" d="M3.99 10c0-.69.12-1.35.32-1.97V5.51H1.07A9.973 9.973 0 000 10c0 1.61.39 3.14 1.07 4.49l3.24-2.52c-.2-.62-.32-1.28-.32-1.97z"/>
                <path fill="#EA4335" d="M10 3.88c1.88 0 3.13.81 3.85 1.48l2.84-2.76C14.96.99 12.7 0 10 0 6.09 0 2.72 2.25 1.07 5.51l3.24 2.52C5.12 5.62 7.36 3.88 10 3.88z"/>
              </svg>
              {loading ? 'Connecting...' : 'Continue with Google'}
            </button>
          </div>

          <div className="auth-modern-divider"><span>or register with email</span></div>

          <form onSubmit={handleSubmit} className="auth-modern-form">
            {/* ... rest of the form is exactly the same as before ... */}
            <div className="form-row">
              <div className="form-group-modern">
                <label htmlFor="reg-first_name"><User size={16} /> First Name</label>
                <input type="text" id="reg-first_name" name="first_name" placeholder="John"
                  value={formData.first_name} onChange={handleChange} className="form-input-modern" />
              </div>
              <div className="form-group-modern">
                <label htmlFor="reg-last_name"><User size={16} /> Last Name</label>
                <input type="text" id="reg-last_name" name="last_name" placeholder="Doe"
                  value={formData.last_name} onChange={handleChange} className="form-input-modern" />
              </div>
            </div>

            <div className="form-group-modern">
              <label htmlFor="reg-email"><Mail size={16} /> Email Address *</label>
              <input type="email" id="reg-email" name="email" placeholder="your@email.com"
                value={formData.email} onChange={handleChange}
                className="form-input-modern" autoComplete="username" required />
            </div>

            <div className="form-group-modern">
              <label htmlFor="reg-password"><Lock size={16} /> Password *</label>
              <div className="input-with-icon">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reg-password" name="password"
                  placeholder="Create a strong password"
                  value={formData.password} onChange={handleChange}
                  onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)}
                  className="form-input-modern" autoComplete="new-password" required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="password-toggle">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {(passwordFocused || formData.password) && (
                <div className="password-requirements">
                  {PASSWORD_RULES.map(rule => {
                    const passed = rule.test(formData.password);
                    return (
                      <div key={rule.id} className={`password-requirement ${passed ? 'passed' : 'failed'}`}>
                        {passed ? <Check size={13} className="req-icon" /> : <X size={13} className="req-icon" />}
                        <span>{rule.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="form-group-modern">
              <label htmlFor="reg-confirmPassword"><Lock size={16} /> Confirm Password *</label>
              <div className="input-with-icon">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="reg-confirmPassword" name="confirmPassword"
                  placeholder="Re-enter your password"
                  value={formData.confirmPassword} onChange={handleChange}
                  className={`form-input-modern ${passwordMatch === true ? 'input-success' : passwordMatch === false ? 'input-error' : ''}`}
                  autoComplete="new-password" required
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="password-toggle">
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
                {passwordMatch !== null && (
                  <div className="password-match-indicator">
                    {passwordMatch
                      ? <Check size={20} className="match-icon success" />
                      : <X size={20} className="match-icon error" />}
                  </div>
                )}
              </div>
              {passwordMatch === false && formData.confirmPassword && (
                <p className="input-hint error">Passwords do not match</p>
              )}
              {passwordMatch === true && (
                <p className="input-hint success">Passwords match!</p>
              )}
            </div>

            <div className="legal-agreements">
              <label className="legal-checkbox-label">
                <input type="checkbox" checked={agreedTerms}
                  onChange={e => { setAgreedTerms(e.target.checked); setLegalError(''); }}
                  className="legal-checkbox-input" />
                <span className="legal-checkbox-custom" />
                <span className="legal-checkbox-text">
                  I agree to the{' '}
                  <a href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="legal-link">
                    Terms &amp; Conditions
                  </a>
                </span>
              </label>
              <label className="legal-checkbox-label">
                <input type="checkbox" checked={agreedPrivacy}
                  onChange={e => { setAgreedPrivacy(e.target.checked); setLegalError(''); }}
                  className="legal-checkbox-input" />
                <span className="legal-checkbox-custom" />
                <span className="legal-checkbox-text">
                  I agree to the{' '}
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="legal-link">
                    Privacy Policy
                  </a>
                </span>
              </label>
              {legalError && <p className="legal-error"><X size={13} /> {legalError}</p>}
            </div>

            <button
              type="submit" className="btn-modern btn-primary"
              disabled={loading || passwordMatch === false || !isPasswordValid || !agreedTerms || !agreedPrivacy}
            >
              {loading ? <><span className="spinner-modern"></span>Creating Account...</> : 'Create Account'}
            </button>
          </form>

          <div className="auth-modern-footer">
            <p>
              Already have an account?{' '}
              <button
                onClick={() => onSwitchToLogin ? onSwitchToLogin() : navigate('/login')}
                className="link-modern"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}