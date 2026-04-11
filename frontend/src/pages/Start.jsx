import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Logo from '../components/Logo';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const cardStyle = {
  hidePostalCode: true,
  style: {
    base: {
      color: '#f5f0e8',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      '::placeholder': { color: '#888' },
      backgroundColor: 'transparent',
    },
    invalid: { color: '#ff6b6b' },
  },
};

function StartForm() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();
  const stripe = useStripe();
  const elements = useElements();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('guest'); // 'guest' | 'returning' | 'magic_link_sent' | 'free'
  const [last4, setLast4] = useState('');

  useEffect(() => {
    const jwt = localStorage.getItem('evflo_jwt');
    const savedEmail = localStorage.getItem('evflo_email');
    const savedLast4 = localStorage.getItem('evflo_last4');
    if (jwt && savedEmail) {
      setEmail(savedEmail);
      setLast4(savedLast4 || '');
      setMode('returning');
    }
  }, []);

  // Check email on blur — if returning user, switch to returning mode
  const handleEmailBlur = async () => {
    if (!email || !email.includes('@') || mode === 'returning') return;
    try {
      const res = await fetch(`${API}/api/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, chargePointId }),
      });
      const data = await res.json();
      if (data.returning) await handleSendMagicLink();
    } catch {}
  };

  const handleSendMagicLink = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/auth/send-magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, chargePointId }),
      });
      const data = await res.json();
      if (res.ok && data.sent) {
        setMode('magic_link_sent');
      } else {
        setError(data.error || 'Could not send magic link. Please try again.');
      }
    } catch {
      setError('Could not connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Returning user — start session with saved card via JWT
  const handleReturningStart = async () => {
    setLoading(true);
    setError('');
    const jwt = localStorage.getItem('evflo_jwt');
    try {
      const res = await fetch(`${API}/api/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ chargePointId, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('evflo_jwt');
          localStorage.removeItem('evflo_email');
          localStorage.removeItem('evflo_last4');
          setMode('guest');
          setError('Your session has expired. Please enter your card details again.');
        } else {
          setError(data.error || 'Failed to start session');
        }
        setLoading(false);
        return;
      }
      // Free charging branch
      if (data.freeCharge) {
        navigate(`/session/${chargePointId}`, {
          state: { sessionId: data.sessionId, email, ratePerKwh: data.ratePerKwh, freeCharge: true },
        });
        return;
      }
      navigate(`/session/${chargePointId}`, {
        state: { sessionId: data.sessionId, email, ratePerKwh: data.ratePerKwh },
      });
    } catch {
      setError('Could not connect to server. Please try again.');
      setLoading(false);
    }
  };

  // Guest — confirm card with Stripe then start session
  const handleGuestStart = async () => {
    if (!email || !email.includes('@')) { setError('Please enter a valid email address'); return; }
    if (!stripe || !elements) { setError('Payment not ready. Please wait a moment.'); return; }
    setError('');
    setLoading(true);
    try {
      // Create PaymentIntent
      const piRes = await fetch(`${API}/api/sessions/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const piData = await piRes.json();
      if (!piRes.ok) { setError(piData.error || 'Failed to initialise payment'); setLoading(false); return; }

      // Confirm card
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(piData.clientSecret, {
        payment_method: { card: elements.getElement(CardElement), billing_details: { email } },
      });
      if (stripeError) { setError(stripeError.message || 'Card authorisation failed'); setLoading(false); return; }
      if (paymentIntent.status !== 'requires_capture') { setError('Card not authorised. Please try again.'); setLoading(false); return; }

      // Start session
      const sessionRes = await fetch(`${API}/api/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargePointId, email, paymentIntentId: paymentIntent.id }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) { setError(sessionData.error || 'Failed to start session'); setLoading(false); return; }

      navigate(`/session/${chargePointId}`, {
        state: { sessionId: sessionData.sessionId, email, ratePerKwh: sessionData.ratePerKwh },
      });
    } catch {
      setError('Could not connect to server. Please try again.');
      setLoading(false);
    }
  };

  // ── RETURNING USER SCREEN ──────────────────────────────────────────────────
  if (mode === 'returning') {
    return (
      <div className="screen">
        <div className="screen-inner">
          <div style={{ marginBottom: '40px' }}><Logo /></div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="fade-up">
              <h2 className="heading-md" style={{ marginBottom: '8px' }}>Welcome back</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)', lineHeight: 1.6 }}>{email}</p>
            </div>
            <div className="fade-up-2" style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '4px' }}>Saved card</div>
                  <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}>
                    {last4 ? `•••• •••• •••• ${last4}` : 'Saved card on file'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '4px' }}>Hold</div>
                  <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--green)' }}>$25.00 AUD</div>
                </div>
              </div>
            </div>
            {error && <div className="error-msg">{error}</div>}
          </div>
          <div className="fade-up-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '32px' }}>
            <button className="btn-primary" onClick={handleReturningStart} disabled={loading}>
              {loading ? 'Starting...' : 'Begin Charging ›'}
            </button>
            <button className="btn-secondary" onClick={() => {
              localStorage.removeItem('evflo_jwt');
              localStorage.removeItem('evflo_email');
              localStorage.removeItem('evflo_last4');
              setMode('guest');
              setEmail('');
            }}>
              Use a different card
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAGIC LINK SENT SCREEN ─────────────────────────────────────────────────
  if (mode === 'magic_link_sent') {
    return (
      <div className="screen">
        <div className="screen-inner">
          <div style={{ marginBottom: '40px' }}><Logo /></div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '24px', textAlign: 'center' }}>
            <div className="fade-up">
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✉</div>
              <h2 className="heading-md" style={{ marginBottom: '8px' }}>Check your email</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)', lineHeight: 1.6, maxWidth: '280px' }}>
                We've sent a link to <strong style={{ color: 'var(--cream)' }}>{email}</strong>. Tap it to start charging with your saved card.
              </p>
            </div>
            <div className="fade-up-2" style={{ marginTop: '8px' }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--cream-dim)', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }} onClick={handleSendMagicLink} disabled={loading}>
                {loading ? 'Sending...' : 'Resend link'}
              </button>
            </div>
          </div>
          <div className="fade-up-3" style={{ paddingTop: '16px' }}>
            <button className="btn-secondary" onClick={() => { setMode('guest'); setError(''); }}>
              Use a different card instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── GUEST SCREEN (default) ─────────────────────────────────────────────────
  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: '40px' }}><Logo /></div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div className="fade-up">
            <h2 className="heading-md" style={{ marginBottom: '8px' }}>Start Session</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)', lineHeight: 1.6 }}>
              Enter your email and card details. A $25 hold will be placed and adjusted to your actual usage.
            </p>
          </div>
          <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="input-group">
              <label className="input-label">Email address</label>
              <input
                className="input-field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                onKeyDown={e => e.key === 'Enter' && handleGuestStart()}
                autoFocus
              />
            </div>
            <div className="input-group">
              <label className="input-label">Card details</label>
              <div style={{ background: 'var(--grey-input, #2a2a2a)', border: '1px solid var(--grey-border, #444)', borderRadius: '4px', padding: '14px 16px' }}>
                <CardElement options={cardStyle} />
              </div>
            </div>
            {error && <div className="error-msg">{error}</div>}
          </div>
          <div className="fade-up-3" style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '4px' }}>Charger</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}>{chargePointId}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '4px' }}>Hold</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--green)' }}>$25.00 AUD</div>
            </div>
          </div>
        </div>
        <div className="fade-up-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '32px' }}>
          <button className="btn-primary" onClick={handleGuestStart} disabled={loading || !stripe}>
            {loading ? 'Authorising...' : 'Begin Charging ›'}
          </button>
          <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    </div>
  );
}

export default function Start() {
  return (
    <Elements stripe={stripePromise}>
      <StartForm />
    </Elements>
  );
}