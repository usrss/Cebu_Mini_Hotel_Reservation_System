/**
 * FoodPaymentSuccessPage.jsx
 * PayMongo redirects here after a successful food order payment.
 * Polls the order until payment_status === 'paid', then shows confirmation.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
import api    from '../../services/api';

const MAX_POLLS = 10;
const POLL_MS   = 3000;

export default function FoodPaymentSuccessPage() {
  const [params]  = useSearchParams();
  const orderId   = params.get('order_id');

  const [status, setStatus] = useState('polling'); // 'polling' | 'paid' | 'failed'
  const [order,  setOrder]  = useState(null);

  useEffect(() => {
  if (!orderId) { setStatus('failed'); return; }

  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    try {
      // ← was: GET /food/orders/my/ + list scan (never updates payment_status)
      // ← now: calls the verify endpoint which polls PayMongo and marks it paid
      const res = await api.get(`/food/orders/${orderId}/verify-payment/`);
      if (res.data.payment_status === 'paid') {
        setOrder(res.data);
        setStatus('paid');
        clearInterval(interval);
      }
    } catch { /* keep polling */ }

    if (attempts >= MAX_POLLS) {
      clearInterval(interval);
      setStatus('failed');
    }
  }, POLL_MS);

  return () => clearInterval(interval);
}, [orderId]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--navy, #0A0E1A)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Navbar />
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '48px 24px',
      }}>
        <div style={{
          background: 'var(--navy-card, #111827)',
          border: '1px solid var(--gold-border, rgba(201,168,76,0.22))',
          padding: '48px 40px',
          maxWidth: 480, width: '100%',
          textAlign: 'center',
          fontFamily: "'Raleway', sans-serif",
          position: 'relative', overflow: 'hidden',
        }}>
          {/* gold top line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, var(--gold, #C9A84C), transparent)',
          }} />

          {status === 'polling' && (
            <>
              <Loader2
                size={40}
                style={{
                  color: 'var(--gold, #C9A84C)',
                  animation: 'spin 1s linear infinite',
                  marginBottom: 16,
                }}
              />
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 22, color: 'var(--white, #F8F6F0)',
                margin: '0 0 8px',
              }}>
                Confirming Payment
              </h2>
              <p style={{ color: 'rgba(248,246,240,0.55)', fontSize: 14 }}>
                Please wait while we verify your payment…
              </p>
            </>
          )}

          {status === 'paid' && (
            <>
              <CheckCircle2 size={40} style={{ color: '#4ade80', marginBottom: 16 }} />
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 22, color: 'var(--white, #F8F6F0)',
                margin: '0 0 8px',
              }}>
                Payment Confirmed
              </h2>
              <p style={{
                color: 'rgba(248,246,240,0.55)',
                fontSize: 14, marginBottom: 24,
              }}>
                Your order for{' '}
                <strong style={{ color: 'var(--white, #F8F6F0)' }}>
                  {order?.food_item_name}
                </strong>{' '}
                has been paid. Our kitchen will prepare it shortly.
              </p>
              <Link to="/food" style={{
                display: 'inline-block',
                padding: '10px 24px',
                background: 'var(--gold-dim, rgba(201,168,76,0.10))',
                border: '1px solid var(--gold, #C9A84C)',
                color: 'var(--gold, #C9A84C)',
                textDecoration: 'none',
                fontSize: 13, fontWeight: 600, letterSpacing: 1,
              }}>
                Back to Food &amp; Drinks
              </Link>
            </>
          )}

          {status === 'failed' && (
            <>
              <p style={{ color: '#f87171', fontSize: 14, marginBottom: 20 }}>
                We could not confirm your payment automatically.
                Check your orders below — it may still have gone through.
              </p>
              <Link to="/food" style={{
                display: 'inline-block',
                padding: '10px 24px',
                background: 'var(--gold-dim, rgba(201,168,76,0.10))',
                border: '1px solid var(--gold, #C9A84C)',
                color: 'var(--gold, #C9A84C)',
                textDecoration: 'none',
                fontSize: 13, fontWeight: 600,
              }}>
                View My Orders
              </Link>
            </>
          )}
        </div>
      </div>
      <Footer />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}