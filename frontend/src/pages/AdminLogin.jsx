import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';

const ADMIN_EMAIL = 'admin@evflo.com';
const ADMIN_PASS = 'EVFLO#2026';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
      sessionStorage.setItem('evflo_admin', 'true');
      navigate('/admin');
    } else {
      setError('Invalid credentials.');
    }
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: '40px' }}><Logo /></div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div className="fade-up">
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Platform</div>
            <h2 className="heading-md">Admin Access</h2>
          </div>

          <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '8px' }}>Email</div>
              <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@evflo.com" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '8px' }}>Password</div>
              <input className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="••••••••" />
            </div>
            {error && <div style={{ fontSize: '0.85rem', color: '#ff6b6b' }}>{error}</div>}
          </div>
        </div>

        <div className="fade-up-3" style={{ paddingTop: '32px' }}>
          <button className="btn-primary" onClick={handleLogin}>Login ›</button>
        </div>
      </div>
    </div>
  );
}
