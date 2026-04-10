import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export default function Stop() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();
  const { state } = useLocation();
  const { sessionId, email, kwh = 0, cost = 0, elapsed = 0 } = state || {};

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [finalKwh, setFinalKwh] = useState(kwh);
  const [finalCost, setFinalCost] = useState(cost);

  // On mount, call stop endpoint to turn relay off and get final billing
  useEffect(() => {
    if (!sessionId) return;

    const stopSession = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/sessions/${sessionId}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Failed to stop session');
          setLoading(false);
          return;
        }

        setFinalKwh(data.kwhConsumed);
        setFinalCost(parseFloat(data.totalAmountAud));
        setLoading(false);

      } catch (err) {
        setError('Could not connect to server.');
        setLoading(false);
      }
    };

    stopSession();
  }, [sessionId]);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleDone = () => {
    navigate(`/receipt/${chargePointId}`, {
      state: { email, kwh: finalKwh, cost: finalCost, elapsed }
    });
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
              {loading ? 'Finalising your session...' : 'Your charging session has ended.'}
            </p>
          </div>

          {error && <div className="error-msg">{error}</div>}

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
              <span className="r-value">{finalKwh.toFixed(3)} kWh</span>
            </div>
            <div className="divider" />
            <div className="receipt-row total">
              <span className="r-label">Total</span>
              <span className="r-value">
                {loading ? '...' : `$${Math.max(finalCost, 0).toFixed(2)}`}
              </span>
            </div>
          </div>

          <div className="fade-up-3" style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', lineHeight: 1.6 }}>
            Receipt will be sent to <strong style={{ color: 'var(--cream)' }}>{email}</strong>
          </div>
        </div>

        <div className="fade-up-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '32px' }}>
          <button className="btn-primary" onClick={handleDone} disabled={loading}>
            {loading ? 'Processing...' : `Done — $${Math.max(finalCost, 0).toFixed(2)} charged ›`}
          </button>
        </div>
      </div>
    </div>
  );
}
