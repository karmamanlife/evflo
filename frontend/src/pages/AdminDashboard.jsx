import { useState, useEffect } from 'react';
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

  // Add charge point state
  const [showAddCP, setShowAddCP] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addingCP, setAddingCP] = useState(false);
  const [cpError, setCpError] = useState('');

  // QR modal
  const [qrChargePoint, setQrChargePoint] = useState(null);

  // Add site state
  const [showAddSite, setShowAddSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newSuburb, setNewSuburb] = useState('');
  const [newPostcode, setNewPostcode] = useState('');
  const [newState, setNewState] = useState('NSW');
  const [newType, setNewType] = useState('hotel');
  const [newHostRate, setNewHostRate] = useState('0.35');
  const [newEvfloFee, setNewEvfloFee] = useState('0.10');
  const [addingSite, setAddingSite] = useState(false);
  const [siteError, setSiteError] = useState('');

  useEffect(() => { loadSites(); }, []);

  const loadSites = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/sites`, { headers: { 'x-admin-key': 'EVFLO#2026' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sites');
      setSites(data);
      if (data.length > 0) { setSelectedSite(data[0]); loadChargePoints(data[0].id); }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const loadChargePoints = async (siteId) => {
    try {
      const res = await fetch(`${API}/api/admin/sites/${siteId}/charge-points`, { headers: { 'x-admin-key': 'EVFLO#2026' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChargePoints(data);
    } catch (err) { setError(err.message); }
  };

  const generateDeviceId = (site, existingPoints) => {
    if (!site) return '';
    const siteTypes = ['strata'];
    let prefix = '';
    if (siteTypes.includes(site.type) && site.address) {
      const parts = site.address.toUpperCase().replace(/[^A-Z0-9\s,]/g, '').split(/[\s,]+/).filter(Boolean);
      const num = parts.find(p => /^\d+$/.test(p)) || '';
      const alpha = parts.find(p => /^[A-Z]/.test(p)) || '';
      const postcode = parts.find(p => /^\d{4}$/.test(p) && p !== num) || '';
      prefix = num + alpha.slice(0, 6) + postcode;
    } else {
      const words = site.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      if (words.length >= 2) prefix = words[0].slice(0, 4) + words[1].slice(0, 3);
      else if (words.length === 1) prefix = words[0].slice(0, 7);
    }
    if (!prefix) prefix = 'EVFLO';
    const seq = (existingPoints.length + 1).toString().padStart(2, '0');
    return `${prefix}-${seq}`;
  };

  const handleSelectSite = (site) => {
    setSelectedSite(site);
    setShowAddCP(false);
    setCpError('');
    loadChargePoints(site.id);
  };

  const handleCreateCP = async () => {
    if (!newDeviceId.trim()) { setCpError('Device ID is required.'); return; }
    if (!selectedSite) { setCpError('Select a site first.'); return; }
    setAddingCP(true);
    setCpError('');
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
      setShowAddCP(false);
      loadChargePoints(selectedSite.id);
    } catch (err) { setCpError(err.message); }
    finally { setAddingCP(false); }
  };

  const handleCreateSite = async () => {
    if (!newSiteName.trim()) { setSiteError('Site name is required.'); return; }
    const hostRate = parseFloat(newHostRate);
    const evfloFee = parseFloat(newEvfloFee);
    if (isNaN(hostRate) || hostRate < 0) { setSiteError('Invalid site host rate.'); return; }
    if (isNaN(evfloFee) || evfloFee < 0) { setSiteError('Invalid EVFLO fee.'); return; }
    setAddingSite(true);
    setSiteError('');
    try {
      const res = await fetch(`${API}/api/admin/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'EVFLO#2026' },
        body: JSON.stringify({
          name: newSiteName.trim(), street: newStreet.trim(), suburb: newSuburb.trim(),
          postcode: newPostcode.trim(), state: newState, type: newType,
          siteHostRatePerKwh: hostRate, evfloFeePerKwh: evfloFee
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create site');
      setNewSiteName(''); setNewStreet(''); setNewSuburb(''); setNewPostcode('');
      setNewState('NSW'); setNewType('hotel'); setNewHostRate('0.35'); setNewEvfloFee('0.10');
      setShowAddSite(false);
      await loadSites();
      setSelectedSite(data);
      loadChargePoints(data.id);
    } catch (err) { setSiteError(err.message); }
    finally { setAddingSite(false); }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('evflo_admin');
    navigate('/admin/login');
  };

  const getChargerUrl = (deviceId) => `${window.location.origin}/charger/${deviceId}`;

  const handleExportQR = () => {
    if (!chargePoints.length) return;
    const w = window.open('', '_blank');
    const cards = chargePoints.map(cp => {
      const url = getChargerUrl(cp.device_id);
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
    w.document.write(`<!DOCTYPE html><html><head><title>QR Labels - ${selectedSite?.name}</title>
      <style>@media print { body { margin: 0; } }</style></head>
      <body style="background:#fff;">${cards}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  const siteTypes = ['hotel', 'strata', 'motel', 'caravan_park', 'dealership', 'council', 'commercial', 'tourism'];
  const stateOptions = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-inner" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div className="pulse-dot" />
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <div className="screen-inner" style={{ minHeight: '100vh', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <Logo />
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--cream-dim)', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '0.08em' }}>LOGOUT</button>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '6px' }}>Platform</div>
          <h2 className="heading-md">Admin Dashboard</h2>
        </div>

        {error && <div style={{ fontSize: '0.85rem', color: '#ff6b6b', marginBottom: '16px' }}>{error}</div>}

        {/* Sites list */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)' }}>Sites</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sites.map(site => (
              <div key={site.id} onClick={() => handleSelectSite(site)} style={{
                background: selectedSite?.id === site.id ? 'var(--grey-card)' : 'transparent',
                border: `1px solid ${selectedSite?.id === site.id ? 'var(--green)' : 'var(--grey-card)'}`,
                borderRadius: '4px', padding: '16px', cursor: 'pointer'
              }}>
                <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}>{site.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', marginTop: '4px' }}>{[site.suburb, site.state].filter(Boolean).join(', ') || site.address || site.type}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--green)', marginTop: '4px' }}>${(parseFloat(site.site_host_rate_per_kwh) + parseFloat(site.evflo_fee_per_kwh)).toFixed(2)}/kWh</div>
              </div>
            ))}
            {sites.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--cream-dim)' }}>No sites found.</div>}
          </div>

          {/* Add Site form */}
          {showAddSite ? (
            <div style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)' }}>New Site</div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Site Name *</div>
                <input className="input-field" value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="e.g. Hilton Sydney" />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Street</div>
                <input className="input-field" value={newStreet} onChange={e => setNewStreet(e.target.value)} placeholder="e.g. 488 George St" />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Suburb</div>
                  <input className="input-field" value={newSuburb} onChange={e => setNewSuburb(e.target.value)} placeholder="e.g. Sydney" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Postcode</div>
                  <input className="input-field" value={newPostcode} onChange={e => setNewPostcode(e.target.value)} placeholder="2000" maxLength={4} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>State</div>
                  <select value={newState} onChange={e => setNewState(e.target.value)} style={{ background: 'var(--grey-dark)', color: 'var(--cream)', border: '1px solid var(--grey-card)', borderRadius: '4px', padding: '12px 16px', fontSize: '0.95rem', width: '100%' }}>
                    {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Site Type</div>
                  <select value={newType} onChange={e => setNewType(e.target.value)} style={{ background: 'var(--grey-dark)', color: 'var(--cream)', border: '1px solid var(--grey-card)', borderRadius: '4px', padding: '12px 16px', fontSize: '0.95rem', width: '100%' }}>
                    {siteTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Host Rate ($/kWh)</div>
                  <input className="input-field" type="number" step="0.01" min="0" value={newHostRate} onChange={e => setNewHostRate(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>EVFLO Fee ($/kWh)</div>
                  <input className="input-field" type="number" step="0.01" min="0" value={newEvfloFee} onChange={e => setNewEvfloFee(e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--green)' }}>User pays: ${(parseFloat(newHostRate || 0) + parseFloat(newEvfloFee || 0)).toFixed(2)}/kWh</div>
              {siteError && <div style={{ fontSize: '0.85rem', color: '#ff6b6b' }}>{siteError}</div>}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-primary" onClick={handleCreateSite} disabled={addingSite}>{addingSite ? 'Creating...' : 'Create Site ›'}</button>
                <button className="btn-secondary" onClick={() => { setShowAddSite(false); setSiteError(''); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary" onClick={() => setShowAddSite(true)} style={{ marginTop: '12px' }}>+ Add Site</button>
          )}
        </div>

        <div className="divider" style={{ marginBottom: '24px' }} />

        {/* Charge Points for selected site */}
        {selectedSite && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)' }}>Charge Points — {selectedSite.name}</div>
              {chargePoints.length > 0 && (
                <button onClick={handleExportQR} style={{ background: 'none', border: '1px solid var(--green)', color: 'var(--green)', fontSize: '0.7rem', letterSpacing: '0.08em', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>EXPORT QR PDF</button>
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
                  <button onClick={() => setQrChargePoint(cp)} style={{ marginTop: '12px', background: 'none', border: '1px solid var(--cream-dim)', color: 'var(--cream-dim)', fontSize: '0.7rem', letterSpacing: '0.08em', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>VIEW QR</button>
                </div>
              ))}
              {chargePoints.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--cream-dim)' }}>No charge points for this site.</div>}
            </div>

            {/* Add Charge Point form */}
            {showAddCP ? (
              <div style={{ background: 'var(--grey-card)', borderRadius: '4px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)' }}>New Charge Point</div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Device ID *</div>
                  <input className="input-field" value={newDeviceId} onChange={e => setNewDeviceId(e.target.value.toUpperCase())} placeholder="Auto-generated — edit if needed" />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '6px' }}>Label (optional)</div>
                  <input className="input-field" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Car Park Level 1" />
                </div>
                {cpError && <div style={{ fontSize: '0.85rem', color: '#ff6b6b' }}>{cpError}</div>}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn-primary" onClick={handleCreateCP} disabled={addingCP}>{addingCP ? 'Creating...' : 'Create ›'}</button>
                  <button className="btn-secondary" onClick={() => { setShowAddCP(false); setCpError(''); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn-secondary" onClick={() => { setNewDeviceId(generateDeviceId(selectedSite, chargePoints)); setShowAddCP(true); }}>+ Add Charge Point</button>
            )}
          </div>
        )}
      </div>

      {/* QR Modal */}
      {qrChargePoint && (
        <div onClick={() => setQrChargePoint(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--grey-dark)', borderRadius: '8px', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: '320px', width: '90%' }}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.2rem', fontWeight: 600 }}>{qrChargePoint.label || qrChargePoint.device_id}</div>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(getChargerUrl(qrChargePoint.device_id))}`} width="220" height="220" alt="QR Code" style={{ borderRadius: '4px' }} />
            <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', textAlign: 'center', wordBreak: 'break-all' }}>{getChargerUrl(qrChargePoint.device_id)}</div>
            <button className="btn-primary" onClick={() => setQrChargePoint(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
