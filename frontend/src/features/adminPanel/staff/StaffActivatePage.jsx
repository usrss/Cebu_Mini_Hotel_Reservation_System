/**
 * StaffActivatePage.jsx
 *
 * Frontend activation page — rendered at:
 *   /staff/activate/:uidb64/:token
 *
 * Flow:
 *   1. On mount → GET /api/staff/activate/<uidb64>/<token>/ to validate the link
 *   2. If valid → show "Set Password" form
 *   3. On submit → POST /api/staff/activate/<uidb64>/<token>/ with { password, confirm_password }
 *   4. On success → redirect to /login with a success banner
 *
 * Add this route to your React Router config:
 *   <Route path="/staff/activate/:uidb64/:token" element={<StaffActivatePage />} />
 *
 * Matches the dark-gold luxury theme.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Lock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function StaffActivatePage() {
  const { uidb64, token } = useParams();
  const navigate = useNavigate();

  // States
  const [checking,  setChecking]  = useState(true);  // initial token pre-check
  const [tokenInfo, setTokenInfo] = useState(null);   // { email, full_name, role }
  const [tokenErr,  setTokenErr]  = useState('');     // invalid/expired message

  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErr,   setFieldErr]   = useState({});
  const [globalErr,  setGlobalErr]  = useState('');
  const [success,    setSuccess]    = useState(false);

  // ── Step 1: validate token on mount ─────────────────────────────────────────
  useEffect(() => {
    async function checkToken() {
      try {
        const res = await fetch(`${API_BASE}/staff/activate/${uidb64}/${token}/`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setTokenInfo(data);
        } else {
          setTokenErr(data.detail ?? 'This activation link is invalid or has expired.');
        }
      } catch {
        setTokenErr('Could not reach the server. Please try again later.');
      } finally {
        setChecking(false);
      }
    }
    checkToken();
  }, [uidb64, token]);

  // ── Step 2: submit password ──────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErr({});
    setGlobalErr('');

    const errs = {};
    if (!password)               errs.password = 'Password is required.';
    if (password !== confirm)    errs.confirm  = 'Passwords do not match.';
    if (password.length < 8)     errs.password = 'Password must be at least 8 characters.';
    if (Object.keys(errs).length) { setFieldErr(errs); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/staff/activate/${uidb64}/${token}/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password, confirm_password: confirm }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => navigate('/login?activated=1'), 3000);
      } else {
        setGlobalErr(data.detail ?? 'Activation failed. Please try again.');
      }
    } catch {
      setGlobalErr('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────────
  const inputStyle = (hasErr) => ({
    width: '100%', boxSizing: 'border-box',
    background: '#1a1a1a', border: `1px solid ${hasErr ? '#F87171' : '#2a2a2a'}`,
    borderRadius: 8, color: '#f5f5f5', fontSize: 14, padding: '11px 40px 11px 14px',
    outline: 'none', fontFamily: 'inherit', transition: 'border-color .2s',
  });

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#666' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#C9A84C' }} />
          <p style={{ marginTop: 16, fontSize: 13 }}>Verifying your activation link…</p>
        </div>
      </PageShell>
    );
  }

  // ── Invalid token ────────────────────────────────────────────────────────────
  if (tokenErr) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <XCircle size={26} color="#F87171" />
          </div>
          <h2 style={{ color: '#f5f5f5', margin: '0 0 10px', fontSize: 20 }}>Link Expired or Invalid</h2>
          <p style={{ color: '#888', fontSize: 13, lineHeight: 1.7, margin: '0 0 24px', maxWidth: 320, marginInline: 'auto' }}>
            {tokenErr}
          </p>
          <p style={{ fontSize: 12, color: '#666' }}>
            Please contact your administrator to request a new activation email.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(110,231,183,.1)', border: '1px solid rgba(110,231,183,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <CheckCircle2 size={26} color="#6EE7B7" />
          </div>
          <h2 style={{ color: '#f5f5f5', margin: '0 0 10px', fontSize: 20 }}>Account Activated!</h2>
          <p style={{ color: '#888', fontSize: 13, lineHeight: 1.7, margin: '0 0 24px' }}>
            Your password has been set. Redirecting you to login…
          </p>
          <Link to="/login" style={{ color: '#C9A84C', fontSize: 13 }}>Go to Login →</Link>
        </div>
      </PageShell>
    );
  }

  // ── Set Password form ────────────────────────────────────────────────────────
  return (
    <PageShell>
      {/* Welcome */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 2, fontWeight: 700,
                    textTransform: 'uppercase', margin: '0 0 6px' }}>
          Staff Activation
        </p>
        <h1 style={{ color: '#f5f5f5', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
          Set Your Password
        </h1>
        <p style={{ color: '#777', fontSize: 13, margin: 0 }}>
          Welcome, <strong style={{ color: '#aaa' }}>
            {tokenInfo?.full_name || tokenInfo?.email}
          </strong>
          {tokenInfo?.role && (
            <span style={{
              marginLeft: 8, fontSize: 11, color: '#C9A84C', fontWeight: 600,
              background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)',
              borderRadius: 5, padding: '2px 8px',
            }}>
              {tokenInfo.role.replace('_', ' ').toUpperCase()}
            </span>
          )}
        </p>
      </div>

      {globalErr && (
        <div style={{
          background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.25)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#F87171', marginBottom: 20,
        }}>
          {globalErr}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* Password */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#aaa',
                          fontWeight: 600, marginBottom: 6, letterSpacing: .3 }}>
            <Lock size={11} style={{ marginRight: 4 }} />NEW PASSWORD
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setFieldErr(p => ({ ...p, password: '' })); }}
              placeholder="Minimum 8 characters"
              style={inputStyle(fieldErr.password)}
              autoFocus
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                       background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 2 }}>
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {fieldErr.password && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#F87171' }}>{fieldErr.password}</p>}
        </div>

        {/* Confirm */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#aaa',
                          fontWeight: 600, marginBottom: 6, letterSpacing: .3 }}>
            <Lock size={11} style={{ marginRight: 4 }} />CONFIRM PASSWORD
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConf ? 'text' : 'password'}
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setFieldErr(p => ({ ...p, confirm: '' })); }}
              placeholder="Re-enter your password"
              style={inputStyle(fieldErr.confirm)}
            />
            <button type="button" onClick={() => setShowConf(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                       background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 2 }}>
              {showConf ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {fieldErr.confirm && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#F87171' }}>{fieldErr.confirm}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', background: '#C9A84C', color: '#0f0f0f',
            border: 'none', borderRadius: 8, padding: '13px 0',
            fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? .7 : 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, fontFamily: 'inherit', letterSpacing: .3,
          }}
        >
          {submitting
            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Activating…</>
            : 'Activate My Account'
          }
        </button>
      </form>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </PageShell>
  );
}

// ── Shared page wrapper ───────────────────────────────────────────────────────
function PageShell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0f0f0f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: "'Raleway', 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#141414',
        border: '1px solid #222', borderRadius: 14, overflow: 'hidden',
      }}>
        {/* Top bar */}
        <div style={{ background: '#1a1a1a', borderBottom: '1px solid #222', padding: '20px 32px' }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: '#C9A84C',
                        fontWeight: 700, textTransform: 'uppercase' }}>
            ⟡ CEBU MINI HOTEL
          </div>
        </div>
        <div style={{ padding: '32px 32px 36px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}