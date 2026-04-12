/**
 * FoodPaymentCancelPage.jsx
 * User cancelled at the PayMongo checkout — show a clean cancel screen.
 *
 * FIXES:
 *  - Added missing `import { useEffect } from 'react'`
 *  - Added missing `import api from '../../services/api'`
 */
import { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import api from '../../services/api';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';

export default function FoodPaymentCancelPage() {
  const [params] = useSearchParams();
  const orderId  = params.get('order_id');

  useEffect(() => {
    if (!orderId) return;
    // Tell the backend this order was abandoned at checkout
    api.patch(`/food/orders/${orderId}/cancel/`).catch(() => {/* silent */});
  }, [orderId]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--navy, #0A0E1A)',
      display: 'flex', flexDirection: 'column',
    }}>
      <Navbar />
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '48px 24px',
      }}>
        <div style={{
          background: 'var(--navy-card, #111827)',
          border: '1px solid rgba(248,113,113,0.25)',
          padding: '48px 40px',
          maxWidth: 480, width: '100%',
          textAlign: 'center',
          fontFamily: "'Raleway', sans-serif",
          position: 'relative', overflow: 'hidden',
        }}>
          {/* red top line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, #f87171, transparent)',
          }} />

          <XCircle size={40} style={{ color: '#f87171', marginBottom: 16 }} />
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 22, color: 'var(--white, #F8F6F0)',
            margin: '0 0 8px',
          }}>
            Payment Cancelled
          </h2>
          <p style={{
            color: 'rgba(248,246,240,0.55)',
            fontSize: 14, marginBottom: 24,
          }}>
            Your payment was cancelled. Your order has not been charged.
            {orderId && (
              <span style={{
                display: 'block', marginTop: 8,
                fontSize: 12, color: 'rgba(248,246,240,0.3)',
              }}>
                Order #{orderId}
              </span>
            )}
          </p>

          <div style={{
            display: 'flex', gap: 12,
            justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <Link to="/food" style={{
              padding: '10px 24px',
              background: 'var(--gold-dim, rgba(201,168,76,0.10))',
              border: '1px solid var(--gold, #C9A84C)',
              color: 'var(--gold, #C9A84C)',
              textDecoration: 'none',
              fontSize: 13, fontWeight: 600, letterSpacing: 1,
            }}>
              Back to Menu
            </Link>
            <Link to="/dashboard" style={{
              padding: '10px 24px',
              background: 'transparent',
              border: '1px solid rgba(248,246,240,0.15)',
              color: 'rgba(248,246,240,0.55)',
              textDecoration: 'none',
              fontSize: 13, fontWeight: 600,
            }}>
              Dashboard
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}