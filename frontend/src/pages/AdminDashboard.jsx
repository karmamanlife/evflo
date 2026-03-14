import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [sites, setSites] = useState([]);
  const [chargePoints, setChargePoints] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [qrModal, setQrModal] = useState(null);

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/sites`, {
        headers: { 'x-admin-key': 'EVFLO#2026' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sites');
      setSites(data);
      if (data.length > 0) {
        setSelectedSite(data[0]);
        fetchChargePoints(data[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchChargePoints = async (siteId) => {
    try {
      const res = await fetch(`${API}/api/admin/sites/${siteId}/charge-points`, {
        headers: { 'x-admin-key': 'EVFLO#2026' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChargePoints(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSiteSelect = (site) => {
    setSelectedSite(site);
    setShowCreate(false);
    setCreateError('');
    fetchChargePoints(site.id);
  };

  const handleCreateChargePoint = async () => {
    if (!newDeviceId.trim()) { setCreateError('Device ID is required.'); return; }
    if (!selectedSite) { setCreateError('Select a site first.'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`${API}/api/admin/charge-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'EVFLO#2026' },
        body: JSON.stringify({ siteId: selectedSite.id, deviceId: newDeviceId.trim(), label: newLabel.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create charge point');
      setNewDeviceId('');
      setNewLabel('');
      setShowCreate(false);
      fetchChargePoints(selectedSite.id);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('evflo_admin');
    navigate('/admin/login');
  };

  const getQrUrl = (deviceId) => `${window.location.origin}/charger/${deviceId}`;

  const handleShowQr = (cp) => setQrModal(cp);

  const handleBulkPdf = () => {
    if (!chargePoints.length) return;
    const win = window.open('', '_blank');
    const rows = chargePoints.map(cp => {
      const url = getQrUrl(cp.device_id);
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      return `
        <div style="page-break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;border:1px solid #ddd;margin:20px auto;max-width:320px;font-family:sans-serif;">
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#888;margin-bottom:8px;">EV Charging</div>
          <div style="font-size:20px;font-weight:700;margin-bottom:4px;">${cp.label || cp.device_id}</div>
          <div style="font-size:11px;color:#888;margin-bottom:20px;">${selectedSite?.name || ''}</div>
          <img src="${qrSrc}" width="200" height="200" style="margin-bottom:20px;" />
          <div style="font-size:10px;color:#aaa;">Scan to start charging</div>
        </div>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>QR Labels - ${selectedSite?.name}</title>
      <style>@media print { body { margin: 0; } }</style></head>
      <body style="background:#fff;">${rows}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  if (loading) return (
    <div className="screen">
      <div className="screen-inner" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="pulse-dot" />
      </div>
    </div>
  );

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <div className="screen-inner" style={{ minHeight: '100vh', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <Logo />
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--cream-dim)', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '0.08em' }}>
            LOGOUT
          </button>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Platform</div>
          <h2 className="heading-md">Admin Dashboard</h2>
        </div>

        {error && <div style={{ fontSize: '0.85rem', color: '#ff6b6b', marginBottom: '16px' }}>{error}</div>}

        {/* Sites */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '12px' }}>Sites</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sites.map(site => (
              <div key={site.id} onClick={() => handleSiteSelect(site)}
                style={{
                  background: selectedSite?.id === site.id ? 'var(--grey-card)' : 'transparent',
                  border: `1px solid ${selectedSite?.id === site.id ? 'var(--green)' : 'var(--grey-card)'}`,
                  borderRadius: '4px', padding: '16px', cursor: 'pointer'
                }}>
                <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}>{site.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', marginTop: '4px' }}>{site.address || site.type}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--green)', marginTop: '4px' }}>
                  ${(parseFloat(site.site_host_rate_per_kwh) + parseFloat(site.evflo_fee_per_kwh)).toFixed(2)}/kWh
                </div>
              </div>
            ))}
            {sites.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--cream-dim)' }}>No sites found.</div>}
          </div>
        </div>

        <div className="divider" style={{ marginBottom: '24px' }} />

        {/* Charge Points */}
        {selectedSite && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)' }}>
                Charge Points — {selectedSite.name}
              </div>
              {chargePoints.length > 0 && (
                <button onClick={handleBulkPdf} style={{ background: 'none', border: '1px solid var(--green)', color: 'var(--green)', fontSize: '0.7rem', letterSpacing: '0.08em', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                  EXPORT QR PDF
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {chargePoints.map(cp => (
                <div key={cp.id} style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}>{cp.label || cp.device_id}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', marginTop: '2px' }}>ID: {cp.device_id}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: cp.status === 'available' ? 'var(--green)' : cp.status === 'occupied' ? '#f0a500' : '#888', display: 'inline-block' }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cp.status}</span>
                    </div>
                  </div>
                  <button onClick={() => handleShowQr(cp)}
                    style={{ marginTop: '12px', background: 'none', border: '1px solid var(--grey-card)', color: 'var(--cream-dim)', fontSize: '0.7rem', letterSpacing: '0.08em', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', borderColor: 'var(--cream-dim)' }}>
                    VIEW QR
                  </button>
                </div>
              ))}
              {chargePoints.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--cream-dim)' }}>No charge points for this site.</div>}
            </div>

            {/* Create charge point */}
            {!showCreate ? (
              <button className="btn-secondary" onClick={() => setShowCreate(true)}>+ Add Charge Point</button>
            ) : (
              <div style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)' }}>New Charge Point</div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Device ID *</div>
                  <input className="input-field" value={newDeviceId} onChange={e => setNewDeviceId(e.target.value)} placeholder="e.g. EVFLO-02" />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Label (optional)</div>
                  <input className="input-field" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Car Park Level 1" />
                </div>
                {createError && <div style={{ fontSize: '0.85rem', color: '#ff6b6b' }}>{createError}</div>}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn-primary" onClick={handleCreateChargePoint} disabled={creating}>
                    {creating ? 'Creating...' : 'Create ›'}
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowCreate(false); setCreateError(''); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* QR Modal */}
      {qrModal && (
        <div onClick={() => setQrModal(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--grey-dark)', borderRadius: '8px', padding: '32px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: '320px', width: '90%'
          }}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.2rem', fontWeight: 600 }}>{qrModal.label || qrModal.device_id}</div>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(getQrUrl(qrModal.device_id))}`} width="220" height="220" alt="QR Code" style={{ borderRadius: '4px' }} />
            <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', textAlign: 'center', wordBreak: 'break-all' }}>{getQrUrl(qrModal.device_id)}</div>
            <button className="btn-primary" onClick={() => setQrModal(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
