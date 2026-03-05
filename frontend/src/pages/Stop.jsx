import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';

export default function Stop() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();
  const { state } = useLocation();
  const { email, kwh = 0, cost = 0, elapsed = 0 } = state || {};
  const [loading, setLoading] = useState(false);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handlePay = () => {
    setLoading(true);
    // TODO: wire Stripe payment intent here
    setTimeout(() => {
      setLoading(false);
      navigate(`/receipt/${chargePointId}`, { state: { email, kwh, cost, elapsed } });
    }, 1500);
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: '40px' }}>
          <Logo />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div className="fade-up">
            <h2 className="heading-md" style={{ marginBottom: '8px' }}>Session Summary</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)' }}>
              Your charging session has ended.
            </p>
          </div>

          <div className="receipt-card fade-up-2">
            <div className="receipt-row">
              <span className="r-label">Charger</span>
              <span className="r-value">{chargePointId}</span>
            </div>
            <div className="receipt-row">
              <span className="r-label">Duration</span>
              <span className="r-value">{formatTime(elapsed)}</span>
            </div>
            <div className="receipt-row">
              <span className="r-label">Energy delivered</span>
              <span className="r-value">{kwh.toFixed(3)} kWh</span>
            </div>
            <div className="receipt-row">
              <span className="r-label">Rate</span>
              <span className="r-value">$0.45 / kWh</span>
            </div>
            <div className="divider" />
            <div className="receipt-row total">
              <span className="r-label">Total</span>
              <span className="r-value">${Math.max(cost, 0.01).toFixed(2)}</span>
            </div>
          </div>

          <div className="fade-up-3" style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', lineHeight: 1.6 }}>
            Receipt will be sent to <strong style={{ color: 'var(--cream)' }}>{email}</strong>
          </div>
        </div>

        <div className="fade-up-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '32px' }}>
          <button className="btn-primary" onClick={handlePay} disabled={loading}>
            {loading ? 'Processing...' : `Pay $${Math.max(cost, 0.01).toFixed(2)} ›`}
          </button>
        </div>
      </div>
    </div>
  );
}