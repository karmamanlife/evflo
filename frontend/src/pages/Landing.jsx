import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Logo from '../components/Logo';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const CONNECTOR_LABELS = {
  schuko: 'Schuko (GPO)',
  type2: 'Type 2 (AC)',
  ccs: 'CCS (DC)',
  chademo: 'CHAdeMO (DC)',
};

export default function Landing() {
  const navigate = useNavigate();
  const { chargePointId } = useParams();

  const [charger, setCharger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    const fetchCharger = async () => {
      try {
        const res = await fetch(`${API}/api/charger/${chargePointId}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Charger not found');
        } else {
          setCharger(data);
        }
      } catch (err) {
        setError('Could not connect. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchCharger();
  }, [chargePointId]);

  const handleStart = () => {
    navigate(`/start/${chargePointId}`, {
      state: { ratePerKwh: charger?.ratePerKwh, siteName: charger?.siteName }
    });
  };

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-inner" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div className="pulse-dot" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <div className="screen-inner">
          <div style={{ marginBottom: '40px' }}><Logo /></div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
            <h2 className="heading-md">Charger Unavailable</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--cream-dim)' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-inner">
        <div style={{ marginBottom: '40px' }}>
          <Logo />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Site info */}
          <div className="fade-up">
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>
              {charger.siteAddress || 'EV Charging Point'}
            </div>
            <h2 className="heading-md">{charger.siteName}</h2>
          </div>

          {/* Rate card */}
          <div className="fade-up-2" style={{
            background: 'var(--grey-card)',
            borderRadius: '4px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Charger</div>
                <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.2rem', fontWeight: 600 }}>{chargePointId}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                  <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1rem', color: 'var(--green)' }}>Available</span>
                </div>
              </div>
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Rate</div>
                <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '2rem', fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>
                  ${charger.ratePerKwh}
                  <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--cream-dim)', marginLeft: '4px' }}>/ kWh</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Currency</div>
                <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1rem' }}>{charger.currency}</div>
              </div>
            </div>

            {/* Connector / power info — shown only if data available */}
            {(charger.connectorType || charger.maxPowerKw) && (
              <>
                <div className="divider" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {charger.connectorType && (
                    <div>
                      <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Connector</div>
                      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1rem' }}>
                        {CONNECTOR_LABELS[charger.connectorType] || charger.connectorType.toUpperCase()}
                      </div>
                    </div>
                  )}
                  {charger.maxPowerKw && (
                    <div style={{ textAlign: charger.connectorType ? 'right' : 'left' }}>
                      <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Max Power</div>
                      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1rem' }}>{charger.maxPowerKw} kW</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Info line */}
          <div className="fade-up-3" style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', lineHeight: 1.7 }}>
            Pay only for what you use. No app required.<br />
            You'll receive a receipt by email when charging ends.
          </div>

        </div>

        <div className="fade-up-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '32px' }}>
          <button className="btn-primary" onClick={handleStart}>
            Start Charging ›
          </button>
        </div>

      </div>
    </div>
  );
}