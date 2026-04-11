import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const ADMIN_KEY = 'EVFLO#2026';

const siteTypes = ['hotel', 'strata', 'motel', 'caravan_park', 'dealership', 'council', 'commercial', 'tourism'];
const stateOptions = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
const connectorTypes = ['gpo', 'schuko', 'type2', 'type2_socket', 'ccs', 'chademo'];
const circuitTypes = ['10a', '15a', '32a'];

const adminHeaders = { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY };

export default function AdminDashboard() {
  const navigate = useNavigate();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [sites, setSites] = useState([]);
  const [chargePoints, setChargePoints] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Site edit state ───────────────────────────────────────────────────────
  const [editingSite, setEditingSite] = useState(false);
  const [siteEdit, setSiteEdit] = useState({});
  const [savingSite, setSavingSite] = useState(false);
  const [siteEditError, setSiteEditError] = useState('');

  // ── Add site state ────────────────────────────────────────────────────────
  const [showAddSite, setShowAddSite] = useState(false);
  const [newSite, setNewSite] = useState({ name: '', street: '', suburb: '', postcode: '', state: 'NSW', type: 'hotel', siteHostRatePerKwh: '0.35', evfloFeePerKwh: '0.10', rate10a: '0.45', rate15a: '0.50', rate32a: '0.65', evfloFee10a: '0.10', evfloFee15a: '0.12', evfloFee32a: '0.15' });
  const [addingSite, setAddingSite] = useState(false);
  const [addSiteError, setAddSiteError] = useState('');

  // ── Charge point edit state ───────────────────────────────────────────────
  const [editingCpId, setEditingCpId] = useState(null);
  const [cpEdit, setCpEdit] = useState({});
  const [savingCp, setSavingCp] = useState(false);
  const [cpEditError, setCpEditError] = useState('');
  const [freeEmailInput, setFreeEmailInput] = useState('');
  const [freeEmailError, setFreeEmailError] = useState('');

  // ── Add charge point state ────────────────────────────────────────────────
  const [showAddCP, setShowAddCP] = useState(false);
  const [newCP, setNewCP] = useState({ deviceId: '', label: '', deviceType: 'shelly', ocppIdentity: '', maxPowerKw: '2.3', connectorType: 'gpo', circuitType: '10a' });
  const [addingCP, setAddingCP] = useState(false);
  const [addCpError, setAddCpError] = useState('');

  // ── QR modal ──────────────────────────────────────────────────────────────
  const [qrChargePoint, setQrChargePoint] = useState(null);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => { loadSites(); }, []);

  const loadSites = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/sites`, { headers: { 'x-admin-key': ADMIN_KEY } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sites');
      setSites(data);
      if (data.length > 0) { setSelectedSite(data[0]); loadChargePoints(data[0].id); }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const loadChargePoints = async (siteId) => {
    try {
      const res = await fetch(`${API}/api/admin/sites/${siteId}/charge-points`, { headers: { 'x-admin-key': ADMIN_KEY } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChargePoints(data);
    } catch (err) { setError(err.message); }
  };

  const handleSelectSite = (site) => {
    setSelectedSite(site);
    setEditingSite(false);
    setEditingCpId(null);
    setShowAddCP(false);
    loadChargePoints(site.id);
  };

  // ── Site edit ─────────────────────────────────────────────────────────────
  const startEditSite = () => {
    setSiteEdit({
      name: selectedSite.name,
      street: selectedSite.street || '',
      suburb: selectedSite.suburb || '',
      postcode: selectedSite.postcode || '',
      state: selectedSite.state || 'NSW',
      type: selectedSite.type,
      siteHostRatePerKwh: selectedSite.site_host_rate_per_kwh,
      evfloFeePerKwh: selectedSite.evflo_fee_per_kwh,
      rate10a: selectedSite.rate_10a_per_kwh || '0.45',
      rate15a: selectedSite.rate_15a_per_kwh || '0.50',
      rate32a: selectedSite.rate_32a_per_kwh || '0.65',
      evfloFee10a: selectedSite.evflo_fee_10a_per_kwh || '0.10',
      evfloFee15a: selectedSite.evflo_fee_15a_per_kwh || '0.12',
      evfloFee32a: selectedSite.evflo_fee_32a_per_kwh || '0.15',
    });
    setSiteEditError('');
    setEditingSite(true);
  };

  const handleSaveSite = async () => {
    setSavingSite(true);
    setSiteEditError('');
    try {
      const res = await fetch(`${API}/api/admin/sites/${selectedSite.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify(siteEdit)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update site');
      setSites(prev => prev.map(s => s.id === data.id ? data : s));
      setSelectedSite(data);
      setEditingSite(false);
    } catch (err) { setSiteEditError(err.message); }
    finally { setSavingSite(false); }
  };

  const handleDeactivateSite = async () => {
    if (!window.confirm(`Deactivate ${selectedSite.name}? This will hide it from all views.`)) return;
    try {
      const res = await fetch(`${API}/api/admin/sites/${selectedSite.id}`, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } });
      if (!res.ok) throw new Error('Failed to deactivate site');
      const remaining = sites.filter(s => s.id !== selectedSite.id);
      setSites(remaining);
      setSelectedSite(remaining[0] || null);
      setChargePoints([]);
      if (remaining[0]) loadChargePoints(remaining[0].id);
    } catch (err) { setError(err.message); }
  };

  // ── Add site ──────────────────────────────────────────────────────────────
  const handleCreateSite = async () => {
    if (!newSite.name.trim()) { setAddSiteError('Site name is required.'); return; }
    setAddingSite(true);
    setAddSiteError('');
    try {
      const res = await fetch(`${API}/api/admin/sites`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ ...newSite, siteHostRatePerKwh: parseFloat(newSite.siteHostRatePerKwh), evfloFeePerKwh: parseFloat(newSite.evfloFeePerKwh) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create site');
      setShowAddSite(false);
      setNewSite({ name: '', street: '', suburb: '', postcode: '', state: 'NSW', type: 'hotel', siteHostRatePerKwh: '0.35', evfloFeePerKwh: '0.10' });
      await loadSites();
      setSelectedSite(data);
      loadChargePoints(data.id);
    } catch (err) { setAddSiteError(err.message); }
    finally { setAddingSite(false); }
  };

  // ── Charge point edit ─────────────────────────────────────────────────────
  const startEditCp = (cp) => {
    setCpEdit({
      label: cp.label || '',
      deviceId: cp.device_id,
      deviceType: cp.device_type || 'shelly',
      ocppIdentity: cp.ocpp_identity || '',
      maxPowerKw: cp.max_power_kw || 2.3,
      connectorType: cp.connector_type || 'gpo',
      circuitType: cp.circuit_type || '10a',
      freeChargeEmails: cp.free_charge_emails ? [...cp.free_charge_emails] : [],
    });
    setFreeEmailInput('');
    setFreeEmailError('');
    setCpEditError('');
    setEditingCpId(cp.id);
  };

  const handleSaveCp = async (cpId) => {
    setSavingCp(true);
    setCpEditError('');
    try {
      const res = await fetch(`${API}/api/admin/charge-points/${cpId}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ ...cpEdit, maxPowerKw: parseFloat(cpEdit.maxPowerKw), circuitType: cpEdit.circuitType })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update charge point');
      setChargePoints(prev => prev.map(cp => cp.id === data.id ? data : cp));
      setEditingCpId(null);
    } catch (err) { setCpEditError(err.message); }
    finally { setSavingCp(false); }
  };

  const handleDeactivateCp = async (cp) => {
    if (!window.confirm(`Deactivate ${cp.label || cp.device_id}? This will hide it from all views.`)) return;
    try {
      const res = await fetch(`${API}/api/admin/charge-points/${cp.id}`, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } });
      if (!res.ok) throw new Error('Failed to deactivate charge point');
      setChargePoints(prev => prev.filter(c => c.id !== cp.id));
    } catch (err) { setError(err.message); }
  };

  const addFreeEmail = () => {
    const email = freeEmailInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFreeEmailError('Invalid email address.'); return; }
    if (cpEdit.freeChargeEmails.includes(email)) { setFreeEmailError('Email already added.'); return; }
    setCpEdit(prev => ({ ...prev, freeChargeEmails: [...prev.freeChargeEmails, email] }));
    setFreeEmailInput('');
    setFreeEmailError('');
  };

  const removeFreeEmail = (email) => {
    setCpEdit(prev => ({ ...prev, freeChargeEmails: prev.freeChargeEmails.filter(e => e !== email) }));
  };

  // ── Add charge point ──────────────────────────────────────────────────────
  const generateDeviceId = (site, existingPoints) => {
    if (!site) return '';
    const words = site.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    let prefix = words.length >= 2 ? words[0].slice(0, 4) + words[1].slice(0, 3) : (words[0] || 'EVFLO').slice(0, 7);
    const seq = (existingPoints.length + 1).toString().padStart(2, '0');
    return `${prefix}-${seq}`;
  };

  const handleCreateCP = async () => {
    if (!newCP.deviceId.trim()) { setAddCpError('Device ID is required.'); return; }
    if (newCP.deviceType === 'ocpp' && !newCP.ocppIdentity.trim()) { setAddCpError('OCPP Identity is required for OCPP devices.'); return; }
    setAddingCP(true);
    setAddCpError('');
    try {
      const res = await fetch(`${API}/api/admin/charge-points`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ siteId: selectedSite.id, deviceId: newCP.deviceId.trim(), label: newCP.label.trim() || null, deviceType: newCP.deviceType, ocppIdentity: newCP.deviceType === 'ocpp' ? newCP.ocppIdentity.trim() : null, maxPowerKw: parseFloat(newCP.maxPowerKw), connectorType: newCP.connectorType, circuitType: newCP.circuitType })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create charge point');
      setShowAddCP(false);
      setNewCP({ deviceId: '', label: '', deviceType: 'shelly', ocppIdentity: '', maxPowerKw: '2.3', connectorType: 'gpo' });
      loadChargePoints(selectedSite.id);
    } catch (err) { setAddCpError(err.message); }
    finally { setAddingCP(false); }
  };

  // ── QR / export ───────────────────────────────────────────────────────────
  const getChargerUrl = (deviceId) => `${window.location.origin}/charger/${deviceId}`;

  const handleExportQR = () => {
    if (!chargePoints.length) return;
    const w = window.open('', '_blank');
    const cards = chargePoints.map(cp => {
      const url = getChargerUrl(cp.device_id);
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      return `<div style="page-break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;border:1px solid #ddd;margin:20px auto;max-width:320px;font-family:sans-serif;">
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#888;margin-bottom:8px;">EV Charging</div>
        <div style="font-size:20px;font-weight:700;margin-bottom:4px;">${cp.label || cp.device_id}</div>
        <div style="font-size:11px;color:#888;margin-bottom:20px;">${selectedSite?.name || ''}</div>
        <img src="${qrSrc}" width="200" height="200" style="margin-bottom:20px;" />
        <div style="font-size:10px;color:#aaa;">Scan to start charging</div>
      </div>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>QR Labels - ${selectedSite?.name}</title><style>@media print { body { margin: 0; } }</style></head><body style="background:#fff;">${cards}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  const handleLogout = () => { sessionStorage.removeItem('evflo_admin'); navigate('/admin/login'); };

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputStyle = { background: 'var(--grey-dark)', color: 'var(--cream)', border: '1px solid var(--grey-card)', borderRadius: '4px', padding: '8px 12px', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' };
  const selectStyle = { ...inputStyle };
  const labelStyle = { fontSize: '0.72rem', color: 'var(--cream-dim)', marginBottom: '4px', letterSpacing: '0.05em' };
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '4px' };
  const rowStyle = { display: 'flex', gap: '12px' };
  const sectionLabel = { fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginBottom: '12px' };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--grey-dark)' }}>
      <div className="pulse-dot" />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--grey-dark)', color: 'var(--cream)', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--grey-card)', flexShrink: 0 }}>
        <Logo />
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)' }}>Admin Dashboard</span>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--cream-dim)', fontSize: '0.75rem', cursor: 'pointer', letterSpacing: '0.08em' }}>LOGOUT</button>
        </div>
      </div>

      {error && <div style={{ padding: '8px 24px', background: '#3a1a1a', color: '#ff6b6b', fontSize: '0.85rem' }}>{error}</div>}

      {/* ── Two-panel body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT PANEL — Site list ── */}
        <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid var(--grey-card)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--grey-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={sectionLabel}>Sites</span>
            <button onClick={() => { setShowAddSite(true); setAddSiteError(''); }} style={{ background: 'none', border: '1px solid var(--green)', color: 'var(--green)', fontSize: '0.7rem', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.06em' }}>+ ADD</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sites.map(site => (
              <div key={site.id} onClick={() => handleSelectSite(site)} style={{ padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid var(--grey-card)', background: selectedSite?.id === site.id ? 'var(--grey-card)' : 'transparent', borderLeft: selectedSite?.id === site.id ? '3px solid var(--green)' : '3px solid transparent' }}>
                <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1rem', fontWeight: 600 }}>{site.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginTop: '2px' }}>{[site.suburb, site.state].filter(Boolean).join(', ') || site.address || '—'}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--green)', marginTop: '2px' }}>{site.type} · ${(parseFloat(site.site_host_rate_per_kwh) + parseFloat(site.evflo_fee_per_kwh)).toFixed(2)}/kWh</div>
              </div>
            ))}
            {sites.length === 0 && <div style={{ padding: '16px', fontSize: '0.85rem', color: 'var(--cream-dim)' }}>No sites.</div>}
          </div>

          {/* Add Site form */}
          {showAddSite && (
            <div style={{ padding: '16px', borderTop: '1px solid var(--grey-card)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={sectionLabel}>New Site</div>
              <div style={fieldStyle}><div style={labelStyle}>Site Name *</div><input style={inputStyle} value={newSite.name} onChange={e => setNewSite(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Hilton Sydney" /></div>
              <div style={fieldStyle}><div style={labelStyle}>Street</div><input style={inputStyle} value={newSite.street} onChange={e => setNewSite(p => ({ ...p, street: e.target.value }))} placeholder="488 George St" /></div>
              <div style={rowStyle}>
                <div style={{ ...fieldStyle, flex: 2 }}><div style={labelStyle}>Suburb</div><input style={inputStyle} value={newSite.suburb} onChange={e => setNewSite(p => ({ ...p, suburb: e.target.value }))} placeholder="Sydney" /></div>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Postcode</div><input style={inputStyle} value={newSite.postcode} onChange={e => setNewSite(p => ({ ...p, postcode: e.target.value }))} maxLength={4} placeholder="2000" /></div>
              </div>
              <div style={rowStyle}>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>State</div><select style={selectStyle} value={newSite.state} onChange={e => setNewSite(p => ({ ...p, state: e.target.value }))}>{stateOptions.map(s => <option key={s}>{s}</option>)}</select></div>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Type</div><select style={selectStyle} value={newSite.type} onChange={e => setNewSite(p => ({ ...p, type: e.target.value }))}>{siteTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
              </div>
              <div style={rowStyle}>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Host Rate $/kWh</div><input style={inputStyle} type="number" step="0.01" value={newSite.siteHostRatePerKwh} onChange={e => setNewSite(p => ({ ...p, siteHostRatePerKwh: e.target.value }))} /></div>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>EVFLO Fee $/kWh</div><input style={inputStyle} type="number" step="0.01" value={newSite.evfloFeePerKwh} onChange={e => setNewSite(p => ({ ...p, evfloFeePerKwh: e.target.value }))} /></div>
              </div>
              <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginTop: '4px' }}>Circuit Rates — Site Host</div>
              <div style={rowStyle}>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>10A</div><input style={inputStyle} type="number" step="0.01" value={newSite.rate10a} onChange={e => setNewSite(p => ({ ...p, rate10a: e.target.value }))} /></div>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>15A</div><input style={inputStyle} type="number" step="0.01" value={newSite.rate15a} onChange={e => setNewSite(p => ({ ...p, rate15a: e.target.value }))} /></div>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>32A</div><input style={inputStyle} type="number" step="0.01" value={newSite.rate32a} onChange={e => setNewSite(p => ({ ...p, rate32a: e.target.value }))} /></div>
              </div>
              <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginTop: '4px' }}>Circuit Rates — EVFLO Fee</div>
              <div style={rowStyle}>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>10A</div><input style={inputStyle} type="number" step="0.01" value={newSite.evfloFee10a} onChange={e => setNewSite(p => ({ ...p, evfloFee10a: e.target.value }))} /></div>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>15A</div><input style={inputStyle} type="number" step="0.01" value={newSite.evfloFee15a} onChange={e => setNewSite(p => ({ ...p, evfloFee15a: e.target.value }))} /></div>
                <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>32A</div><input style={inputStyle} type="number" step="0.01" value={newSite.evfloFee32a} onChange={e => setNewSite(p => ({ ...p, evfloFee32a: e.target.value }))} /></div>
              </div>
              {addSiteError && <div style={{ fontSize: '0.8rem', color: '#ff6b6b' }}>{addSiteError}</div>}
              <div style={rowStyle}>
                <button className="btn-primary" onClick={handleCreateSite} disabled={addingSite} style={{ flex: 1 }}>{addingSite ? 'Creating...' : 'Create ›'}</button>
                <button className="btn-secondary" onClick={() => setShowAddSite(false)} style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL — Site detail + charge points ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {!selectedSite ? (
            <div style={{ color: 'var(--cream-dim)', fontSize: '0.9rem' }}>Select a site to view details.</div>
          ) : (
            <>
              {/* Site detail header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1.6rem', fontWeight: 700 }}>{selectedSite.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--cream-dim)', marginTop: '2px' }}>{selectedSite.address || '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!editingSite && <button onClick={startEditSite} style={{ background: 'none', border: '1px solid var(--cream-dim)', color: 'var(--cream-dim)', fontSize: '0.72rem', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.06em' }}>EDIT</button>}
                  {!editingSite && <button onClick={handleDeactivateSite} style={{ background: 'none', border: '1px solid #ff6b6b', color: '#ff6b6b', fontSize: '0.72rem', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.06em' }}>DEACTIVATE</button>}
                </div>
              </div>

              {/* Site edit form */}
              {editingSite && (
                <div style={{ background: 'var(--grey-card)', borderRadius: '6px', padding: '20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={sectionLabel}>Edit Site</div>
                  <div style={rowStyle}>
                    <div style={{ ...fieldStyle, flex: 2 }}><div style={labelStyle}>Site Name</div><input style={inputStyle} value={siteEdit.name} onChange={e => setSiteEdit(p => ({ ...p, name: e.target.value }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Type</div><select style={selectStyle} value={siteEdit.type} onChange={e => setSiteEdit(p => ({ ...p, type: e.target.value }))}>{siteTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
                  </div>
                  <div style={fieldStyle}><div style={labelStyle}>Street</div><input style={inputStyle} value={siteEdit.street} onChange={e => setSiteEdit(p => ({ ...p, street: e.target.value }))} /></div>
                  <div style={rowStyle}>
                    <div style={{ ...fieldStyle, flex: 2 }}><div style={labelStyle}>Suburb</div><input style={inputStyle} value={siteEdit.suburb} onChange={e => setSiteEdit(p => ({ ...p, suburb: e.target.value }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Postcode</div><input style={inputStyle} value={siteEdit.postcode} onChange={e => setSiteEdit(p => ({ ...p, postcode: e.target.value }))} maxLength={4} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>State</div><select style={selectStyle} value={siteEdit.state} onChange={e => setSiteEdit(p => ({ ...p, state: e.target.value }))}>{stateOptions.map(s => <option key={s}>{s}</option>)}</select></div>
                  </div>
                  <div style={rowStyle}>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Host Rate $/kWh</div><input style={inputStyle} type="number" step="0.01" value={siteEdit.siteHostRatePerKwh} onChange={e => setSiteEdit(p => ({ ...p, siteHostRatePerKwh: e.target.value }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>EVFLO Fee $/kWh</div><input style={inputStyle} type="number" step="0.01" value={siteEdit.evfloFeePerKwh} onChange={e => setSiteEdit(p => ({ ...p, evfloFeePerKwh: e.target.value }))} /></div>
                  </div>
                  <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginTop: '4px' }}>Circuit Rates ($/kWh) — Site Host</div>
                  <div style={rowStyle}>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>10A Rate</div><input style={inputStyle} type="number" step="0.01" value={siteEdit.rate10a} onChange={e => setSiteEdit(p => ({ ...p, rate10a: e.target.value }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>15A Rate</div><input style={inputStyle} type="number" step="0.01" value={siteEdit.rate15a} onChange={e => setSiteEdit(p => ({ ...p, rate15a: e.target.value }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>32A Rate</div><input style={inputStyle} type="number" step="0.01" value={siteEdit.rate32a} onChange={e => setSiteEdit(p => ({ ...p, rate32a: e.target.value }))} /></div>
                  </div>
                  <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-dim)', marginTop: '4px' }}>Circuit Rates ($/kWh) — EVFLO Fee</div>
                  <div style={rowStyle}>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>10A Fee</div><input style={inputStyle} type="number" step="0.01" value={siteEdit.evfloFee10a} onChange={e => setSiteEdit(p => ({ ...p, evfloFee10a: e.target.value }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>15A Fee</div><input style={inputStyle} type="number" step="0.01" value={siteEdit.evfloFee15a} onChange={e => setSiteEdit(p => ({ ...p, evfloFee15a: e.target.value }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>32A Fee</div><input style={inputStyle} type="number" step="0.01" value={siteEdit.evfloFee32a} onChange={e => setSiteEdit(p => ({ ...p, evfloFee32a: e.target.value }))} /></div>
                  </div>
                  {siteEditError && <div style={{ fontSize: '0.8rem', color: '#ff6b6b' }}>{siteEditError}</div>}
                  <div style={rowStyle}>
                    <button className="btn-primary" onClick={handleSaveSite} disabled={savingSite}>{savingSite ? 'Saving...' : 'Save ›'}</button>
                    <button className="btn-secondary" onClick={() => setEditingSite(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Site info summary (view mode) */}
              {!editingSite && (
                <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--grey-card)', borderRadius: '6px', padding: '14px 20px', minWidth: '140px' }}>
                    <div style={labelStyle}>Type</div>
                    <div style={{ fontSize: '0.9rem' }}>{selectedSite.type?.replace(/_/g, ' ')}</div>
                  </div>
                  {['10a', '15a', '32a'].map(c => (
                    <div key={c} style={{ background: 'var(--grey-card)', borderRadius: '6px', padding: '14px 20px', minWidth: '160px' }}>
                      <div style={labelStyle}>{c.toUpperCase()} Circuit</div>
                      <div style={{ fontSize: '0.85rem' }}>Host: ${parseFloat(selectedSite['rate_' + c + '_per_kwh'] || 0).toFixed(2)}</div>
                      <div style={{ fontSize: '0.85rem' }}>EVFLO: ${parseFloat(selectedSite['evflo_fee_' + c + '_per_kwh'] || 0).toFixed(2)}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--green)' }}>Total: ${(parseFloat(selectedSite['rate_' + c + '_per_kwh'] || 0) + parseFloat(selectedSite['evflo_fee_' + c + '_per_kwh'] || 0)).toFixed(2)}/kWh</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Charge points section */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={sectionLabel}>Charge Points — {chargePoints.length} active</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {chargePoints.length > 0 && <button onClick={handleExportQR} style={{ background: 'none', border: '1px solid var(--green)', color: 'var(--green)', fontSize: '0.7rem', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.06em' }}>EXPORT QR PDF</button>}
                  <button onClick={() => { setNewCP({ deviceId: generateDeviceId(selectedSite, chargePoints), label: '', deviceType: 'shelly', ocppIdentity: '', maxPowerKw: '2.3', connectorType: 'gpo' }); setShowAddCP(true); setAddCpError(''); }} style={{ background: 'none', border: '1px solid var(--cream-dim)', color: 'var(--cream-dim)', fontSize: '0.7rem', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.06em' }}>+ ADD</button>
                </div>
              </div>

              {/* Charge points table */}
              {chargePoints.length > 0 && (
                <div style={{ background: 'var(--grey-card)', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--grey-dark)' }}>
                        {['Label', 'Device ID', 'Type', 'Connector', 'Max kW', 'Status', 'Free Emails', ''].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-dim)', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chargePoints.map(cp => (
                        <>
                          <tr key={cp.id} style={{ borderBottom: editingCpId === cp.id ? 'none' : '1px solid var(--grey-dark)' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 500 }}>{cp.label || '—'}</td>
                            <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{cp.device_id}</td>
                            <td style={{ padding: '12px 14px' }}>{cp.device_type === 'ocpp' ? 'OCPP' : 'Shelly'}</td>
                            <td style={{ padding: '12px 14px', textTransform: 'uppercase', fontSize: '0.78rem' }}>{cp.connector_type || '—'}</td>
                            <td style={{ padding: '12px 14px' }}>{cp.max_power_kw}kW</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cp.status === 'available' ? 'var(--green)' : cp.status === 'occupied' ? '#f0a500' : '#888' }} />
                                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cream-dim)' }}>{cp.status}</span>
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--cream-dim)' }}>{cp.free_charge_emails?.length > 0 ? cp.free_charge_emails.length + ' email' + (cp.free_charge_emails.length > 1 ? 's' : '') : '—'}</td>
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                              <button onClick={() => setQrChargePoint(cp)} style={{ background: 'none', border: 'none', color: 'var(--cream-dim)', fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '0.06em', marginRight: '8px' }}>QR</button>
                              <button onClick={() => editingCpId === cp.id ? setEditingCpId(null) : startEditCp(cp)} style={{ background: 'none', border: 'none', color: 'var(--cream-dim)', fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '0.06em', marginRight: '8px' }}>{editingCpId === cp.id ? 'CANCEL' : 'EDIT'}</button>
                              <button onClick={() => handleDeactivateCp(cp)} style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '0.06em' }}>DEACTIVATE</button>
                            </td>
                          </tr>

                          {/* Inline edit row */}
                          {editingCpId === cp.id && (
                            <tr key={cp.id + '-edit'} style={{ borderBottom: '1px solid var(--grey-dark)' }}>
                              <td colSpan={8} style={{ padding: '16px 14px', background: 'rgba(0,0,0,0.2)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  <div style={rowStyle}>
                                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Label</div><input style={inputStyle} value={cpEdit.label} onChange={e => setCpEdit(p => ({ ...p, label: e.target.value }))} /></div>
                                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Device ID</div><input style={inputStyle} value={cpEdit.deviceId} onChange={e => setCpEdit(p => ({ ...p, deviceId: e.target.value.toUpperCase() }))} /></div>
                                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Device Type</div><select style={selectStyle} value={cpEdit.deviceType} onChange={e => setCpEdit(p => ({ ...p, deviceType: e.target.value }))}><option value="shelly">Shelly</option><option value="ocpp">OCPP</option></select></div>
                                    {cpEdit.deviceType === 'ocpp' && <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>OCPP Identity</div><input style={inputStyle} value={cpEdit.ocppIdentity} onChange={e => setCpEdit(p => ({ ...p, ocppIdentity: e.target.value }))} /></div>}
                                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Max kW</div><input style={inputStyle} type="number" step="0.1" value={cpEdit.maxPowerKw} onChange={e => setCpEdit(p => ({ ...p, maxPowerKw: e.target.value }))} /></div>
                                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Connector</div><select style={selectStyle} value={cpEdit.connectorType} onChange={e => setCpEdit(p => ({ ...p, connectorType: e.target.value }))}>{connectorTypes.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
                                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Circuit</div><select style={selectStyle} value={cpEdit.circuitType} onChange={e => setCpEdit(p => ({ ...p, circuitType: e.target.value }))}>{circuitTypes.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
                                  </div>

                                  {/* Free charge emails */}
                                  <div>
                                    <div style={labelStyle}>Free Charging Emails</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', minHeight: '24px' }}>
                                      {cpEdit.freeChargeEmails.map(email => (
                                        <span key={email} style={{ background: 'var(--grey-dark)', border: '1px solid var(--green)', borderRadius: '20px', padding: '3px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                          {email}
                                          <span onClick={() => removeFreeEmail(email)} style={{ cursor: 'pointer', color: '#ff6b6b', fontWeight: 700, lineHeight: 1 }}>×</span>
                                        </span>
                                      ))}
                                      {cpEdit.freeChargeEmails.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--cream-dim)' }}>No free charging emails</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', maxWidth: '400px' }}>
                                      <input style={{ ...inputStyle, flex: 1 }} value={freeEmailInput} onChange={e => setFreeEmailInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFreeEmail()} placeholder="email@example.com" />
                                      <button onClick={addFreeEmail} style={{ background: 'none', border: '1px solid var(--green)', color: 'var(--green)', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>Add</button>
                                    </div>
                                    {freeEmailError && <div style={{ fontSize: '0.78rem', color: '#ff6b6b', marginTop: '4px' }}>{freeEmailError}</div>}
                                  </div>

                                  {cpEditError && <div style={{ fontSize: '0.8rem', color: '#ff6b6b' }}>{cpEditError}</div>}
                                  <div style={rowStyle}>
                                    <button className="btn-primary" onClick={() => handleSaveCp(cp.id)} disabled={savingCp}>{savingCp ? 'Saving...' : 'Save ›'}</button>
                                    <button className="btn-secondary" onClick={() => setEditingCpId(null)}>Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {chargePoints.length === 0 && !showAddCP && <div style={{ fontSize: '0.85rem', color: 'var(--cream-dim)', marginBottom: '16px' }}>No charge points for this site.</div>}

              {/* Add charge point form */}
              {showAddCP && (
                <div style={{ background: 'var(--grey-card)', borderRadius: '6px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <div style={sectionLabel}>New Charge Point</div>
                  <div style={rowStyle}>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Device Type *</div><select style={selectStyle} value={newCP.deviceType} onChange={e => setNewCP(p => ({ ...p, deviceType: e.target.value, maxPowerKw: e.target.value === 'ocpp' ? '22' : '2.3', connectorType: e.target.value === 'ocpp' ? 'type2_socket' : 'gpo' }))}><option value="shelly">Shelly (Level 1 GPO)</option><option value="ocpp">OCPP (Level 2 AC)</option></select></div>
                    {newCP.deviceType === 'ocpp' && <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>OCPP Identity *</div><input style={inputStyle} value={newCP.ocppIdentity} onChange={e => setNewCP(p => ({ ...p, ocppIdentity: e.target.value }))} placeholder="e.g. SUNGROW-001" /></div>}
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Device ID *</div><input style={inputStyle} value={newCP.deviceId} onChange={e => setNewCP(p => ({ ...p, deviceId: e.target.value.toUpperCase() }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Label</div><input style={inputStyle} value={newCP.label} onChange={e => setNewCP(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Car Park B1" /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Max kW</div><input style={inputStyle} type="number" step="0.1" value={newCP.maxPowerKw} onChange={e => setNewCP(p => ({ ...p, maxPowerKw: e.target.value }))} /></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Connector</div><select style={selectStyle} value={newCP.connectorType} onChange={e => setNewCP(p => ({ ...p, connectorType: e.target.value }))}>{connectorTypes.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
                    <div style={{ ...fieldStyle, flex: 1 }}><div style={labelStyle}>Circuit</div><select style={selectStyle} value={newCP.circuitType} onChange={e => setNewCP(p => ({ ...p, circuitType: e.target.value, maxPowerKw: e.target.value === '32a' ? '22' : e.target.value === '15a' ? '3.5' : '2.3' }))}>{circuitTypes.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
                  </div>
                  {addCpError && <div style={{ fontSize: '0.8rem', color: '#ff6b6b' }}>{addCpError}</div>}
                  <div style={rowStyle}>
                    <button className="btn-primary" onClick={handleCreateCP} disabled={addingCP}>{addingCP ? 'Creating...' : 'Create ›'}</button>
                    <button className="btn-secondary" onClick={() => setShowAddCP(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
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