/**
 * StaffActivatePage.jsx
 *
 * Frontend activation page — rendered at:
 *   /staff/activate/:uidb64/:token/
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
 * Light theme matching FrontDesk design.
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
    background: '#F2F3F7',
    border: hasErr ? '1.5px solid #DC2626' : 'none',
    borderRadius: 10, color: '#01000D', fontSize: 14,
    padding: '11px 40px 11px 14px',
    outline: 'none', fontFamily: 'inherit', transition: 'box-shadow .2s',
    boxShadow: hasErr ? '0 0 0 3px rgba(220,38,38,0.15)' : '0 1px 2px rgba(1,0,13,0.06)',
  });

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#7A7987' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#01000D' }} />
          <p style={{ marginTop: 16, fontSize: 13, color: '#52515E' }}>Verifying your activation link…</p>
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
            background: 'rgba(220,38,38,0.09)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <XCircle size={26} color="#DC2626" />
          </div>
          <h2 style={{ color: '#01000D', margin: '0 0 10px', fontSize: 20, fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>Link Expired or Invalid</h2>
          <p style={{ color: '#7A7987', fontSize: 13, lineHeight: 1.7, margin: '0 0 24px', maxWidth: 320, marginInline: 'auto' }}>
            {tokenErr}
          </p>
          <p style={{ fontSize: 12, color: '#7A7987' }}>
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
            background: 'rgba(13,148,136,0.09)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <CheckCircle2 size={26} color="#0D9488" />
          </div>
          <h2 style={{ color: '#01000D', margin: '0 0 10px', fontSize: 20, fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>Account Activated!</h2>
          <p style={{ color: '#7A7987', fontSize: 13, lineHeight: 1.7, margin: '0 0 24px' }}>
            Your password has been set. Redirecting you to login…
          </p>
          <Link to="/login" style={{ color: '#01000D', fontSize: 13, fontWeight: 600 }}>Go to Login →</Link>
        </div>
      </PageShell>
    );
  }

  // ── Set Password form ────────────────────────────────────────────────────────
  return (
    <PageShell>
      {/* Welcome */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: '#52515E', fontSize: 10, letterSpacing: '0.14em', fontWeight: 700,
                    textTransform: 'uppercase', margin: '0 0 8px' }}>
          Staff Activation
        </p>
        <h1 style={{ color: '#01000D', fontSize: 22, fontWeight: 400, margin: '0 0 8px',
                     fontFamily: "'DM Serif Display', serif", letterSpacing: '-0.01em' }}>
          Set Your Password
        </h1>
        <p style={{ color: '#7A7987', fontSize: 13, margin: 0, fontWeight: 400 }}>
          Welcome, <strong style={{ color: '#01000D', fontWeight: 600 }}>
            {tokenInfo?.full_name || tokenInfo?.email}
          </strong>
          {tokenInfo?.role && (
            <span style={{
              marginLeft: 8, fontSize: 10, color: '#52515E', fontWeight: 700,
              background: 'rgba(1,0,13,0.07)',
              borderRadius: 999, padding: '2px 8px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {tokenInfo.role.replace('_', ' ').toUpperCase()}
            </span>
          )}
        </p>
      </div>

      {globalErr && (
        <div style={{
          background: 'rgba(220,38,38,0.09)', borderRadius: 10,
          padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 20,
        }}>
          {globalErr}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* Password */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, color: '#52515E',
                          fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em',
                          textTransform: 'uppercase' }}>
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
                       background: 'none', border: 'none', color: '#7A7987', cursor: 'pointer', padding: 2 }}>
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {fieldErr.password && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#DC2626' }}>{fieldErr.password}</p>}
        </div>

        {/* Confirm */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontSize: 10, color: '#52515E',
                          fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em',
                          textTransform: 'uppercase' }}>
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
                       background: 'none', border: 'none', color: '#7A7987', cursor: 'pointer', padding: 2 }}>
              {showConf ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {fieldErr.confirm && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#DC2626' }}>{fieldErr.confirm}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', background: '#01000D', color: '#FFFFFF',
            border: 'none', borderRadius: 10, padding: '13px 0',
            fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? .7 : 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, fontFamily: 'inherit', letterSpacing: '0.02em',
            boxShadow: '0 2px 8px rgba(1,0,13,0.18)',
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
      minHeight: '100vh', background: '#F2F3F7',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#FFFFFF',
        borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(1,0,13,0.10), 0 2px 8px rgba(1,0,13,0.06)',
      }}>
        {/* Top bar */}
        <div style={{ background: '#F2F3F7', borderBottom: '1px solid #E4E6ED', padding: '18px 32px' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', color: '#52515E',
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