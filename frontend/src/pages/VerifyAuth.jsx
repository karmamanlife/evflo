import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
export default function VerifyAuth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('ready'); // ready | verifying | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('Invalid link. Please request a new one.');
    }
  }, []);

  const handleTap = async () => {
    if (!token) return;
    setStatus('verifying');
    try {
      const res = await fetch(`${API}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'This link has expired or already been used. Please request a new one.');
        return;
      }
      localStorage.setItem('evflo_jwt', data.jwt);
      localStorage.setItem('evflo_email', data.email);
      if (data.last4) localStorage.setItem('evflo_last4', data.last4);
      setStatus('success');
      setTimeout(() => {
        const cpId = data.chargePointId || 'EVFLO-01';
        navigate(`/start/${cpId}`, { replace: true });
      }, 1200);
    } catch (err) {
      setStatus('error');
      setErrorMsg('Could not connect to server. Please try again.');
    }
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: '40px' }}><Logo /></div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '24px', textAlign: 'center' }}>
          {status === 'ready' && (
            <div className="fade-up">
              <div style={{ fontSize: '3rem', marginBottom: '24px' }}>⚡</div>
              <h2 className="heading-md" style={{ marginBottom: '8px' }}>Ready to charge</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)', marginBottom: '32px' }}>Tap the button below to verify and continue</p>
              <button className="btn-primary" onClick={handleTap}>Start Charging</button>
            </div>
          )}
          {status === 'verifying' && (
            <div className="fade-up">
              <div style={{ marginBottom: '24px' }}><div className="spinner" /></div>
              <h2 className="heading-md" style={{ marginBottom: '8px' }}>Verifying...</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)' }}>Just a moment</p>
            </div>
          )}
          {status === 'success' && (
            <div className="fade-up">
              <div className="success-icon" style={{ margin: '0 auto 24px' }}>✓</div>
              <h2 className="heading-md" style={{ marginBottom: '8px' }}>You're in</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)' }}>Taking you to your charger...</p>
            </div>
          )}
          {status === 'error' && (
            <div className="fade-up">
              <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>✕</div>
              <h2 className="heading-md" style={{ marginBottom: '8px' }}>Link expired</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)', lineHeight: 1.6, maxWidth: '280px' }}>{errorMsg}</p>
            </div>
          )}
        </div>
        {status === 'error' && (
          <div className="fade-up-2" style={{ paddingTop: '16px' }}>
            <button className="btn-secondary" onClick={() => navigate(-1)}>Go back</button>
          </div>
        )}
      </div>
      <style>{`
        .spinner {
          width: 36px;
          height: 36px;
          border: 2px solid rgba(245, 240, 232, 0.15);
          border-top-color: var(--green, #7fff6e);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}