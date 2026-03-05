import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';

export default function Receipt() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();
  const { state } = useLocation();
  const { email, kwh = 0, cost = 0, elapsed = 0 } = state || {};

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: '40px' }}>
          <Logo />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="success-icon">✓</div>
            <div>
              <h2 className="heading-md">Payment Complete</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--cream-dim)', marginTop: '4px' }}>Thank you for using evflo</p>
            </div>
          </div>

          <div className="receipt-card fade-up-2">
            <div className="receipt-row">
              <span className="r-label">Date</span>
              <span className="r-value">{dateStr}</span>
            </div>
            <div className="receipt-row">
              <span className="r-label">Time</span>
              <span className="r-value">{timeStr}</span>
            </div>
            <div className="receipt-row">
              <span className="r-label">Charger</span>
              <span className="r-value">{chargePointId}</span>
            </div>
            <div className="receipt-row">
              <span className="r-label">Duration</span>
              <span className="r-value">{formatTime(elapsed)}</span>
            </div>
            <div className="receipt-row">
              <span className="r-label">Energy</span>
              <span className="r-value">{kwh.toFixed(3)} kWh</span>
            </div>
            <div className="divider" />
            <div className="receipt-row total">
              <span className="r-label">Total Paid</span>
              <span className="r-value">${Math.max(cost, 0.01).toFixed(2)}</span>
            </div>
          </div>

          <div className="fade-up-3" style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', lineHeight: 1.6, textAlign: 'center' }}>
            Receipt sent to <strong style={{ color: 'var(--cream)' }}>{email}</strong>
          </div>

          <div className="fade-up-4" style={{ display: 'flex', justifyContent: 'center' }}>
            <span className="chevron" style={{ fontSize: '5rem', opacity: 0.3 }}>›</span>
          </div>
        </div>

        <div className="fade-up-5" style={{ paddingTop: '16px' }}>
          <button className="btn-secondary" onClick={() => navigate(`/charger/${chargePointId}`)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}