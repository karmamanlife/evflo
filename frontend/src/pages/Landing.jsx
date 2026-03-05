import { useNavigate, useParams } from 'react-router-dom';
import Logo from '../components/Logo';

export default function Landing() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: 'auto' }}>
          <Logo />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '32px' }}>
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="charger-badge">
              <span className="dot" />
              <span>Charger {chargePointId || 'EVFLO-01'}</span>
            </div>
            <h1 className="heading-xl">
              PAID<br />
              POWER<br />
              <span>FOR YOU</span>
            </h1>
            <p className="tagline">Power Where You Park</p>
          </div>

          <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="rate-info">
              <span className="rate-value">$0.45</span>
              <span className="rate-unit">per kWh</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', lineHeight: 1.5 }}>
              No app required. Pay by card when your session ends.
            </p>
          </div>
        </div>

        <div className="fade-up-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span className="chevron" style={{ fontSize: '4rem' }}>›</span>
          </div>
          <button
            className="btn-primary"
            onClick={() => navigate(`/start/${chargePointId || 'EVFLO-01'}`)}
          >
            Start Charging
          </button>
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--cream-dim)', lineHeight: 1.5 }}>
            By continuing you agree to our terms of use
          </p>
        </div>
      </div>
    </div>
  );
}