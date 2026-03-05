import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Logo from '../components/Logo';

export default function Start() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);

    // TODO: wire to API - for now simulate session start
    setTimeout(() => {
      setLoading(false);
      navigate(`/session/${chargePointId}`, { state: { email } });
    }, 1200);
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: '40px' }}>
          <Logo />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div className="fade-up">
            <h2 className="heading-md" style={{ marginBottom: '8px' }}>Start Session</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)', lineHeight: 1.6 }}>
              Enter your email to receive your charging receipt.
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
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                autoFocus
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
          </div>

          <div className="fade-up-3" style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '4px' }}>Charger</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}>{chargePointId}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '4px' }}>Rate</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--green)' }}>$0.45 / kWh</div>
            </div>
          </div>
        </div>

        <div className="fade-up-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '32px' }}>
          <button
            className="btn-primary"
            onClick={handleStart}
            disabled={loading}
          >
            {loading ? 'Starting...' : 'Begin Charging ›'}
          </button>
          <button className="btn-secondary" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}