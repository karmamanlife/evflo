import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';

export default function Session() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();
  const { state } = useLocation();
  const email = state?.email || 'guest';

  const [kwh, setKwh] = useState(0);
  const [watts, setWatts] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cost, setCost] = useState(0);
  const RATE = 0.45;

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
      const simulatedWatts = 2200 + (Math.random() * 200 - 100);
      setWatts(Math.round(simulatedWatts));
      setKwh(prev => {
        const newKwh = prev + simulatedWatts / 3600000;
        setCost(newKwh * RATE);
        return newKwh;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const handleStop = () => {
    navigate(`/stop/${chargePointId}`, {
      state: { email, kwh, cost, elapsed, watts }
    });
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <Logo />
          <div className="live-badge">
            <span className="dot" />
            Live
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="fade-up">
            <h2 className="heading-md" style={{ marginBottom: '4px' }}>Charging</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--cream-dim)' }}>{chargePointId} · {email}</p>
          </div>

          <div className="session-meter fade-up-2">
            <div className="meter-row">
              <span className="meter-label">Energy</span>
              <span className="meter-value large green">{kwh.toFixed(3)} <span style={{ fontSize: '1.2rem', fontWeight: 400 }}>kWh</span></span>
            </div>
            <div className="divider" />
            <div className="meter-row">
              <span className="meter-label">Cost so far</span>
              <span className="meter-value green">${cost.toFixed(2)}</span>
            </div>
            <div className="divider" />
            <div className="meter-row">
              <span className="meter-label">Power</span>
              <span className="meter-value" style={{ fontSize: '1.3rem' }}>{watts}W</span>
            </div>
            <div className="divider" />
            <div className="meter-row">
              <span className="meter-label">Duration</span>
              <span className="meter-value" style={{ fontSize: '1.3rem' }}>{formatTime(elapsed)}</span>
            </div>
          </div>

          <div className="fade-up-3" style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', lineHeight: 1.6, textAlign: 'center' }}>
            Your vehicle is charging at <strong style={{ color: 'var(--cream)' }}>{(watts/1000).toFixed(1)} kW</strong>.<br />
            Rate: $0.45 per kWh
          </div>
        </div>

        <div className="fade-up-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '32px' }}>
          <button className="btn-danger" onClick={handleStop}>
            Stop Charging
          </button>
        </div>
      </div>
    </div>
  );
}