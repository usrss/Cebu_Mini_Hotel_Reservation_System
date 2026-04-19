// src/features/auth/AccountSettings.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentUser, getStoredUser } from '../../services/api';
import { User, Mail, Lock, Shield, LogOut, ChevronRight, Check, X, Eye, EyeOff, ArrowLeft, Smartphone, Phone } from 'lucide-react';
import axios from 'axios';
import './AccountSettings.css';

const API_BASE = import.meta.env.VITE_AUTH_URL || 'http://localhost:8000/api/auth';

function getToken() {
  return (
    localStorage.getItem('accessToken') ||
    sessionStorage.getItem('accessToken') ||
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('access_token')
  );
}

function clearTokens() {
  ['accessToken', 'access_token', 'refreshToken', 'refresh_token'].forEach(key => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

function getAuthHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

// ── Phone validation helpers ──────────────────────────────────────────────────
// Accepts: +63 912 345 6789 / +639123456789 / 09123456789 / 9123456789
const PHONE_REGEX = /^(\+63|0)?[89]\d{9}$/;

function normalizePhone(raw) {
  // Strip spaces, dashes, parentheses
  return raw.replace(/[\s\-().]/g, '');
}

function validatePhone(raw) {
  if (!raw) return null; // empty is allowed
  const cleaned = normalizePhone(raw);
  return PHONE_REGEX.test(cleaned) ? null : 'Enter a valid PH number (e.g. +63 912 345 6789 or 09123456789)';
}

// ── Section: Edit Name & Phone ────────────────────────────────────────────────
function ProfileSection({ user, onSuccess }) {
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
  });
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    setStatus(null);

    if (name === 'phone') {
      setPhoneError(validatePhone(value) || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Re-validate phone before submit
    const phoneErr = validatePhone(form.phone);
    if (phoneErr) {
      setPhoneError(phoneErr);
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      // Send normalized phone to backend
      const payload = {
        ...form,
        phone: form.phone ? normalizePhone(form.phone) : '',
      };

      const { data } = await axios.patch(`${API_BASE}/profile/`, payload, {
        headers: getAuthHeaders(),
      });
      const existingUser = JSON.parse(localStorage.getItem('user') || '{}');
      const updatedUser = { ...existingUser, ...data.user };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setStatus('success');
      setMessage('Profile updated successfully.');
      onSuccess(data.user);
    } catch (err) {
      setStatus('error');
      setMessage(
        err.response?.data?.phone?.[0] ||
        err.response?.data?.detail ||
        Object.values(err.response?.data || {})[0]?.[0] ||
        'Failed to update profile.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="as-section">
      <div className="as-section-header">
        <div className="as-section-icon"><User size={18} /></div>
        <div>
          <h3>Personal Information</h3>
          <p>Update your name and contact details</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="as-form">
        <div className="as-form-row">
          <div className="as-field">
            <label>First Name</label>
            <input name="first_name" value={form.first_name} onChange={handleChange}
              placeholder="John" className="as-input" />
          </div>
          <div className="as-field">
            <label>Last Name</label>
            <input name="last_name" value={form.last_name} onChange={handleChange}
              placeholder="Doe" className="as-input" />
          </div>
        </div>

        <div className="as-field">
          <label>Phone Number <span style={{ color: 'var(--as-text-muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="+63 912 345 6789"
            className={`as-input ${phoneError ? 'as-input-error' : form.phone && !phoneError ? 'as-input-success' : ''}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
          />
          {phoneError && (
            <span className="as-hint-error"><X size={12} />{phoneError}</span>
          )}
          {form.phone && !phoneError && (
            <span className="as-hint-success"><Check size={12} />Looks good</span>
          )}
        </div>

        {status && (
          <div className={`as-alert ${status === 'success' ? 'as-alert-success' : 'as-alert-error'}`}>
            {status === 'success' ? <Check size={16} /> : <X size={16} />}
            <span>{message}</span>
          </div>
        )}
        <button type="submit" className="as-btn-primary" disabled={loading || !!phoneError}>
          {loading ? <><span className="as-spinner" />Saving...</> : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

// ── Section: Change Email ─────────────────────────────────────────────────────
function EmailSection({ user, onSuccess }) {
  const [step, setStep] = useState(1);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await axios.post(`${API_BASE}/change-email/request/`, { new_email: newEmail, password }, {
        headers: getAuthHeaders(),
      });
      setStep(2);
      setCountdown(300);
      setStatus(null);
    } catch (err) {
      setStatus('error');
      setMessage(
        err.response?.data?.new_email?.[0] ||
        err.response?.data?.password?.[0] ||
        err.response?.data?.detail ||
        'Request failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every(d => d !== '') && value) handleVerify(null, next.join(''));
  };

  const handleCodeKey = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleVerify = async (e, codeVal) => {
    if (e) e.preventDefault();
    const full = codeVal || code.join('');
    if (full.length !== 6) return;
    setLoading(true);
    setStatus(null);
    try {
      const { data } = await axios.post(`${API_BASE}/change-email/verify/`,
        { new_email: newEmail, code: full }, { headers: getAuthHeaders() });
      setStatus('success');
      setMessage('Email updated successfully!');
      onSuccess(data.user);
      setTimeout(() => {
        setStep(1); setCode(['','','','','','']);
        setNewEmail(''); setPassword(''); setStatus(null);
      }, 2500);
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.code?.[0] || err.response?.data?.detail || 'Verification failed.');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="as-section">
      <div className="as-section-header">
        <div className="as-section-icon"><Mail size={18} /></div>
        <div>
          <h3>Email Address</h3>
          <p>Current: <strong>{user?.email}</strong></p>
        </div>
      </div>
      {step === 1 ? (
        <form onSubmit={handleRequest} className="as-form">
          <div className="as-field">
            <label>New Email Address</label>
            <input type="email" value={newEmail}
              onChange={e => { setNewEmail(e.target.value); setStatus(null); }}
              placeholder="newemail@example.com" className="as-input" required />
          </div>
          <div className="as-field">
            <label>Confirm Your Password</label>
            <div className="as-input-icon">
              <input type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => { setPassword(e.target.value); setStatus(null); }}
                placeholder="Enter your current password" className="as-input" required />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="as-eye-btn">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {status === 'error' && (
            <div className="as-alert as-alert-error"><X size={16} /><span>{message}</span></div>
          )}
          <button type="submit" className="as-btn-primary" disabled={loading}>
            {loading ? <><span className="as-spinner" />Sending Code...</> : 'Send Verification Code'}
          </button>
        </form>
      ) : (
        <div className="as-form">
          <p className="as-verify-hint">
            A 6-digit code was sent to <strong>{newEmail}</strong>.
            {countdown > 0 && (
              <span className="as-countdown">
                {' '}Expires in {Math.floor(countdown/60)}:{String(countdown%60).padStart(2,'0')}
              </span>
            )}
          </p>
          <div className="as-code-group">
            {code.map((digit, i) => (
              <input key={i} ref={el => inputRefs.current[i] = el}
                type="text" inputMode="numeric" maxLength="1" value={digit}
                onChange={e => handleCodeChange(i, e.target.value)}
                onKeyDown={e => handleCodeKey(i, e)}
                className={`as-code-input ${status === 'error' ? 'error' : ''} ${status === 'success' ? 'success' : ''}`}
                disabled={loading || status === 'success'} />
            ))}
          </div>
          {status && (
            <div className={`as-alert ${status === 'success' ? 'as-alert-success' : 'as-alert-error'}`}>
              {status === 'success' ? <Check size={16} /> : <X size={16} />}
              <span>{message}</span>
            </div>
          )}
          <div className="as-form-actions">
            <button type="button" className="as-btn-ghost"
              onClick={() => { setStep(1); setCode(['','','','','','']); setStatus(null); }}>
              ← Back
            </button>
            <button type="button" className="as-btn-primary"
              disabled={loading || code.join('').length !== 6 || status === 'success'}
              onClick={handleVerify}>
              {loading ? <><span className="as-spinner" />Verifying...</> : 'Verify & Update'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section: Change Password ──────────────────────────────────────────────────
function PasswordSection({ user }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const passwordMatch = form.confirm_password
    ? form.new_password === form.confirm_password
    : null;

  const strength = (() => {
    const p = form.new_password;
    if (!p) return null;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^a-zA-Z0-9]/.test(p)) s++;
    return s;
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength] || '';
  const strengthClass = ['', 'weak', 'fair', 'good', 'strong'][strength] || '';

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setStatus(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passwordMatch === false) return;
    setLoading(true);
    setStatus(null);
    try {
      await axios.post(`${API_BASE}/change-password/`, form, { headers: getAuthHeaders() });
      setStatus('success');
      setMessage('Password changed! You will be logged out.');
      setTimeout(() => { clearTokens(); navigate('/login'); }, 2000);
    } catch (err) {
      setStatus('error');
      setMessage(
        err.response?.data?.current_password?.[0] ||
        err.response?.data?.new_password?.[0] ||
        err.response?.data?.detail ||
        Object.values(err.response?.data || {})?.[0]?.[0] ||
        'Failed to change password.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (user?.auth_provider !== 'email') {
    return (
      <div className="as-section">
        <div className="as-section-header">
          <div className="as-section-icon"><Lock size={18} /></div>
          <div><h3>Password</h3><p>Manage your password</p></div>
        </div>
        <div className="as-social-notice">
          <Shield size={20} />
          <p>Your account is secured via <strong>{user?.auth_provider === 'google' ? 'Google' : 'Facebook'}</strong>. Password management is handled by your social provider.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="as-section">
      <div className="as-section-header">
        <div className="as-section-icon"><Lock size={18} /></div>
        <div><h3>Change Password</h3><p>Use a strong, unique password</p></div>
      </div>
      <form onSubmit={handleSubmit} className="as-form">
        <div className="as-field">
          <label>Current Password</label>
          <div className="as-input-icon">
            <input name="current_password" type={show.current ? 'text' : 'password'}
              value={form.current_password} onChange={handleChange}
              placeholder="Enter current password" className="as-input"
              autoComplete="current-password" required />
            <button type="button" onClick={() => setShow(s => ({ ...s, current: !s.current }))} className="as-eye-btn">
              {show.current ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div className="as-field">
          <label>New Password</label>
          <div className="as-input-icon">
            <input name="new_password" type={show.new ? 'text' : 'password'}
              value={form.new_password} onChange={handleChange}
              placeholder="Minimum 8 characters" className="as-input"
              autoComplete="new-password" minLength={8} required />
            <button type="button" onClick={() => setShow(s => ({ ...s, new: !s.new }))} className="as-eye-btn">
              {show.new ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {form.new_password && (
            <div className="as-strength">
              <div className="as-strength-bar">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`as-strength-seg ${strength >= i ? strengthClass : ''}`} />
                ))}
              </div>
              <span className={`as-strength-label ${strengthClass}`}>{strengthLabel}</span>
            </div>
          )}
        </div>
        <div className="as-field">
          <label>Confirm New Password</label>
          <div className="as-input-icon">
            <input name="confirm_password" type={show.confirm ? 'text' : 'password'}
              value={form.confirm_password} onChange={handleChange}
              placeholder="Re-enter new password"
              className={`as-input ${passwordMatch === false ? 'as-input-error' : passwordMatch === true ? 'as-input-success' : ''}`}
              autoComplete="new-password" required />
            <button type="button" onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))} className="as-eye-btn">
              {show.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {passwordMatch === false && <span className="as-hint-error">Passwords do not match</span>}
          {passwordMatch === true  && <span className="as-hint-success"><Check size={13} /> Passwords match</span>}
        </div>
        {status && (
          <div className={`as-alert ${status === 'success' ? 'as-alert-success' : 'as-alert-error'}`}>
            {status === 'success' ? <Check size={16} /> : <X size={16} />}
            <span>{message}</span>
          </div>
        )}
        <button type="submit" className="as-btn-primary"
          disabled={loading || passwordMatch === false}>
          {loading ? <><span className="as-spinner" />Changing Password...</> : 'Change Password'}
        </button>
      </form>
    </div>
  );
}

// ── Section: Sessions ─────────────────────────────────────────────────────────
function SessionsSection() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleLogoutAll = async () => {
    if (!window.confirm('This will log you out from all devices including this one. Continue?')) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/logout-all/`, {}, { headers: getAuthHeaders() });
      setDone(true);
      clearTokens();
      setTimeout(() => navigate('/login'), 1500);
    } catch {
      clearTokens();
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="as-section">
      <div className="as-section-header">
        <div className="as-section-icon"><Smartphone size={18} /></div>
        <div><h3>Sessions &amp; Devices</h3><p>Manage where you're logged in</p></div>
      </div>
      <div className="as-session-current">
        <div className="as-session-dot" />
        <div>
          <p><strong>Current session</strong></p>
          <p className="as-muted">This device · Active now</p>
        </div>
      </div>
      {done ? (
        <div className="as-alert as-alert-success">
          <Check size={16} /><span>Logged out from all sessions. Redirecting...</span>
        </div>
      ) : (
        <button className="as-btn-danger" onClick={handleLogoutAll} disabled={loading}>
          {loading ? <><span className="as-spinner" />Logging out...</> : <><LogOut size={16} />Logout All Devices</>}
        </button>
      )}
    </div>
  );
}

// ─── Back destination resolver ─────────────────────────────────────────────────
const STAFF_ROLE_HOME = {
  housekeeping: '/staff/cleaning',
  maintenance:  '/staff/maintenance',
  security:     '/staff/incidents',
};

function resolveBackRoute(from, role) {
  if (from === 'admin')     return '/admin/dashboard';
  if (from === 'frontdesk') return '/staff/front-desk';
  if (from === 'staff')     return STAFF_ROLE_HOME[role] ?? '/staff/cleaning';
  return '/dashboard';
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AccountSettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from');
  const role = searchParams.get('role');

  const [user, setUser] = useState(getStoredUser());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    (async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);
      } catch (err) {
        if (err.response?.status === 401) navigate('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUserUpdate = (updatedUser) => setUser(updatedUser);

  const tabs = [
    { id: 'profile',  label: 'Profile',  icon: <User size={16} /> },
    { id: 'email',    label: 'Email',    icon: <Mail size={16} /> },
    { id: 'password', label: 'Password', icon: <Lock size={16} /> },
    { id: 'sessions', label: 'Sessions', icon: <Smartphone size={16} /> },
  ];

  if (loading) {
    return (
      <div className="as-page">
        <div className="as-loading">
          <span className="as-spinner as-spinner-lg" />
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="as-page">
      <header className="as-topbar">
        <button
          className="as-back-btn"
          onClick={() => navigate(resolveBackRoute(from, role))}
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>
        <h1>Account Settings</h1>
        <div className="as-topbar-user">
          <div className="as-avatar-sm">
            {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
          </div>
          <span>{user?.full_name || user?.email}</span>
        </div>
      </header>

      <div className="as-layout">
        <aside className="as-sidebar">
          <div className="as-sidebar-user">
            <div className="as-avatar-lg">
              {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="as-sidebar-name">{user?.full_name || 'User'}</p>
              <p className="as-sidebar-email">{user?.email}</p>
            </div>
          </div>
          <nav className="as-nav">
            {tabs.map(tab => (
              <button key={tab.id}
                className={`as-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}>
                {tab.icon}
                <span>{tab.label}</span>
                <ChevronRight size={14} className="as-nav-arrow" />
              </button>
            ))}
          </nav>
        </aside>

        <main className="as-content">
          {activeTab === 'profile'  && <ProfileSection  user={user} onSuccess={handleUserUpdate} />}
          {activeTab === 'email'    && <EmailSection    user={user} onSuccess={handleUserUpdate} />}
          {activeTab === 'password' && <PasswordSection user={user} />}
          {activeTab === 'sessions' && <SessionsSection />}
        </main>
      </div>
    </div>
  );
}