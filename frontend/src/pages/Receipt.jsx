import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export default function Receipt() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();
  const { state } = useLocation();
  const { email, kwh = 0, cost = 0, elapsed = 0, sessionId } = state || {};

  const hasJwt = !!localStorage.getItem('evflo_jwt');
  const [saveState, setSaveState] = useState(hasJwt ? 'hidden' : 'prompt');
  const [saveError, setSaveError] = useState('');

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  const handleSaveCard = async () => {
    if (!sessionId) { setSaveError('Session ID missing. Cannot save card.'); return; }
    setSaveState('saving');
    setSaveError('');
    try {
      const res = await fetch(`${API}/api/user/save-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || 'Could not save card. Please try again.'); setSaveState('prompt'); return; }
      if (data.jwt) {
        localStorage.setItem('evflo_jwt', data.jwt);
        localStorage.setItem('evflo_email', email);
        if (data.last4) localStorage.setItem('evflo_last4', data.last4);
      }
      setSaveState('saved');
    } catch (err) {
      setSaveError('Could not connect. Please try again.');
      setSaveState('prompt');
    }
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: '40px' }}><Logo /></div>

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

          {saveState === 'prompt' && (
            <div className="fade-up-3" style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Save card for next time?</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', lineHeight: 1.5 }}>
                  Next time, just enter your email and we'll send you a link — no card entry needed.
                </div>
              </div>
              {saveError && <div className="error-msg" style={{ fontSize: '0.8rem' }}>{saveError}</div>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }} onClick={handleSaveCard}>Save card</button>
                <button className="btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }} onClick={() => setSaveState('hidden')}>No thanks</button>
              </div>
            </div>
          )}

          {saveState === 'saving' && (
            <div className="fade-up-3" style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '18px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--cream-dim)' }}>Saving...</div>
            </div>
          )}

          {saveState === 'saved' && (
            <div className="fade-up-3" style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '18px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 600, marginBottom: '4px' }}>✓ Card saved</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--cream-dim)' }}>Next time, just enter your email.</div>
            </div>
          )}

          {saveState === 'hidden' && (
            <div className="fade-up-4" style={{ display: 'flex', justifyContent: 'center' }}>
              <span className="chevron" style={{ fontSize: '5rem', opacity: 0.3 }}>›</span>
            </div>
          )}
        </div>

        <div className="fade-up-5" style={{ paddingTop: '16px' }}>
          <button className="btn-secondary" onClick={() => navigate(`/charger/${chargePointId}`)}>Done</button>
        </div>
      </div>
    </div>
  );
}
