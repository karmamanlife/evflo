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

<<<<<<< HEAD
app.use(cors({ origin: 'https://evflo.com.au', methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'x-admin-key', 'Authorization'] }));
app.use(express.json());
=======
export default function AdminDashboard() {
  const navigate = useNavigate();
>>>>>>> 9f725cf (F18/F19: Admin dashboard redesign, circuit rates, PATCH/DELETE endpoints)

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

<<<<<<< HEAD
// ─── Command Router (F17) ──────────────────────────────────────────────────────
async function sendChargeCommand(chargePoint, action, sessionId) {
  const deviceType = chargePoint.device_type || 'shelly';
  const deviceId = chargePoint.device_id;
  if (deviceType === 'shelly') {
    if (mqttClient) {
      const command = action === 'start' ? 'on' : 'off';
      mqttClient.publish('shelly1pmg4-' + deviceId + '/command/switch:0', command);
      console.log('[CMD] MQTT relay ' + command.toUpperCase() + ' → ' + deviceId);
    } else { console.error('[CMD] MQTT client not available for ' + deviceId); }
  } else if (deviceType === 'ocpp') {
    if (!ocppModule) throw new Error('OCPP module not initialised');
    const ocppIdentity = chargePoint.ocpp_identity;
    if (!ocppIdentity) throw new Error('No ocpp_identity configured for charge point ' + deviceId);
    if (!ocppModule.isChargerConnected(ocppIdentity)) throw new Error('OCPP charger ' + ocppIdentity + ' is not connected');
    if (action === 'start') { await ocppModule.sendRemoteStart(ocppIdentity, 'EVFLO'); console.log('[CMD] OCPP RemoteStart → ' + ocppIdentity); }
    else { await ocppModule.sendRemoteStop(ocppIdentity, sessionId); console.log('[CMD] OCPP RemoteStop → ' + ocppIdentity); }
  } else { throw new Error('Unknown device_type: ' + deviceType); }
}
=======
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
>>>>>>> 9f725cf (F18/F19: Admin dashboard redesign, circuit rates, PATCH/DELETE endpoints)

  // ── QR modal ──────────────────────────────────────────────────────────────
  const [qrChargePoint, setQrChargePoint] = useState(null);

<<<<<<< HEAD
app.get('/api/charger/:chargePointId', async (req, res) => {
  try {
    const { data: cp, error } = await supabase.from('charge_points')
      .select('id, device_id, status, device_type, connector_type, max_power_kw, circuit_type, sites(id, name, address, rate_10a_per_kwh, rate_15a_per_kwh, rate_32a_per_kwh, evflo_fee_10a_per_kwh, evflo_fee_15a_per_kwh, evflo_fee_32a_per_kwh, currency)')
      .eq('device_id', req.params.chargePointId).eq('is_active', true).single();
    if (error || !cp) return res.status(404).json({ error: 'Charger not found' });
    if (cp.status !== 'available') return res.status(409).json({ error: 'Charger not available' });
    const site = cp.sites;
    const circuit = cp.circuit_type || '10a';
    const siteRate = parseFloat(site['rate_' + circuit + '_per_kwh'] || site.rate_10a_per_kwh);
    const evfloFee = parseFloat(site['evflo_fee_' + circuit + '_per_kwh'] || site.evflo_fee_10a_per_kwh);
    const ratePerKwh = (siteRate + evfloFee).toFixed(2);
    res.json({ chargePointId: cp.id, deviceId: cp.device_id, siteName: site.name, siteAddress: site.address, siteId: site.id, ratePerKwh, currency: site.currency, connectorType: cp.connector_type || 'gpo', maxPowerKw: parseFloat(cp.max_power_kw || 2.3), circuitType: circuit });
  } catch (err) { console.error('[API] GET /charger error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/sessions/create-payment-intent', async (req, res) => {
  try {
    if (!STRIPE_ENABLED) return res.status(503).json({ error: 'Stripe not configured' });
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const { data: userForPi } = await supabase.from('users').upsert({ email }, { onConflict: 'email' }).select('id, stripe_customer_id').single();
    let customerId = userForPi?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { evflo_user_id: userForPi?.id } });
      customerId = customer.id;
      if (userForPi?.id) await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', userForPi.id);
    }
    const paymentIntent = await stripe.paymentIntents.create({ amount: PRE_AUTH_AMOUNT_CENTS, currency: 'aud', capture_method: 'manual', customer: customerId, setup_future_usage: 'off_session', description: 'EVFLO charging session pre-authorisation', metadata: { email } });
    console.log('[API] PaymentIntent created: ' + paymentIntent.id + ' — $' + (PRE_AUTH_AMOUNT_CENTS / 100).toFixed(2) + ' hold');
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) { console.error('[API] create-payment-intent error:', err.message); res.status(500).json({ error: 'Failed to create payment intent' }); }
});

app.post('/api/sessions/start', async (req, res) => {
  try {
    const { chargePointId, email, paymentIntentId } = req.body;
    const authHeader = req.headers['authorization'];
    let jwtUserId = null;
    let jwtEmail = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        jwtUserId = decoded.userId;
        jwtEmail = decoded.email;
      } catch (e) { return res.status(401).json({ error: 'Invalid or expired token. Please request a new magic link.' }); }
    }
    const effectiveEmail = jwtEmail || email;
    if (!chargePointId || !effectiveEmail) return res.status(400).json({ error: 'chargePointId and email required' });
    if (STRIPE_ENABLED && !jwtUserId && !paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required' });

    const { data: cp, error: cpError } = await supabase.from('charge_points')
      .select('id, device_id, status, device_type, ocpp_identity, free_charge_emails, circuit_type, sites(id, rate_10a_per_kwh, rate_15a_per_kwh, rate_32a_per_kwh, evflo_fee_10a_per_kwh, evflo_fee_15a_per_kwh, evflo_fee_32a_per_kwh, currency)')
      .eq('device_id', chargePointId).eq('is_active', true).single();
    if (cpError || !cp) return res.status(404).json({ error: 'Charger not found' });
    if (cp.status !== 'available') return res.status(409).json({ error: 'Charger not available' });

    const site = cp.sites;
    const circuit = cp.circuit_type || '10a';
    const ratePerKwh = parseFloat(site['rate_' + circuit + '_per_kwh'] || site.rate_10a_per_kwh) + parseFloat(site['evflo_fee_' + circuit + '_per_kwh'] || site.evflo_fee_10a_per_kwh);
    const evfloMargin = parseFloat(site['evflo_fee_' + circuit + '_per_kwh'] || site.evflo_fee_10a_per_kwh);

    const { data: user, error: userError } = await supabase.from('users')
      .upsert({ email: effectiveEmail }, { onConflict: 'email' }).select('id, email, stripe_customer_id, stripe_default_pm, has_saved_card').single();
    if (userError) throw new Error('User upsert failed: ' + userError.message);

    // ── FREE CHARGING CHECK ──
    if (jwtUserId) {
      const freeEmails = (cp.free_charge_emails || []).map(e => e.toLowerCase());
      if (freeEmails.includes(effectiveEmail.toLowerCase())) {
        const startKwh = (cp.device_type === 'shelly' && deviceStateCache[cp.device_id]) ? deviceStateCache[cp.device_id].kwh : 0;
        const { data: freeSession, error: freeSessionError } = await supabase.from('sessions')
          .insert({ charge_point_id: cp.id, user_id: user.id, status: 'active', rate_per_kwh: 0, evflo_margin: 0, started_at: new Date().toISOString(), start_kwh_reading: startKwh, stripe_payment_intent_id: null }).select('id').single();
        if (freeSessionError) throw new Error('Free session create failed: ' + freeSessionError.message);
        await supabase.from('charge_points').update({ status: 'occupied' }).eq('id', cp.id);
        try { await sendChargeCommand(cp, 'start'); } catch (cmdErr) {
          console.error('[API] Free session charge command failed:', cmdErr.message);
          await supabase.from('sessions').update({ status: 'cancelled', stopped_at: new Date().toISOString() }).eq('id', freeSession.id);
          await supabase.from('charge_points').update({ status: 'available' }).eq('id', cp.id);
          return res.status(503).json({ error: 'Charger not responding. Please try again.' });
        }
        console.log('[API] FREE session started: ' + freeSession.id + ' — ' + effectiveEmail);
        return res.json({ sessionId: freeSession.id, status: 'active', startedAt: new Date().toISOString(), ratePerKwh: '0.00', freeCharge: true });
      }
    }

    let effectivePaymentIntentId = paymentIntentId || null;

    if (jwtUserId) {
      if (!STRIPE_ENABLED) return res.status(400).json({ error: 'Stripe not enabled' });
      if (!user.stripe_customer_id || !user.stripe_default_pm) return res.status(402).json({ error: 'No saved card on file. Please start a new session.' });
      const pi = await stripe.paymentIntents.create({ amount: PRE_AUTH_AMOUNT_CENTS, currency: 'aud', capture_method: 'manual', customer: user.stripe_customer_id, payment_method: user.stripe_default_pm, confirm: true, off_session: true, description: 'EVFLO charging session pre-authorisation (returning user)', metadata: { email: effectiveEmail, evflo_user_id: user.id } });
      if (pi.status !== 'requires_capture') return res.status(402).json({ error: 'Card authorisation failed. Please use a different card.' });
      effectivePaymentIntentId = pi.id;
      console.log('[API] Returning user PI created: ' + pi.id);
    } else {
      if (STRIPE_ENABLED && paymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== 'requires_capture') return res.status(402).json({ error: 'Payment not confirmed. Please complete card authorisation.' });
        try {
          const pmId = pi.payment_method;
          if (pmId) {
            let customerId = user.stripe_customer_id;
            if (!customerId) {
              const customer = await stripe.customers.create({ email: effectiveEmail, metadata: { evflo_user_id: user.id } });
              customerId = customer.id;
              await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
            }
            await stripe.paymentMethods.attach(pmId, { customer: customerId });
            await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });
            await supabase.from('users').update({ stripe_default_pm: pmId }).eq('id', user.id);
            console.log('[API] PM attached to customer at session start for user', user.id);
          }
        } catch (attachErr) { console.error('[API] PM attach warning (non-fatal):', attachErr.message); }
      }
    }

    const startKwh = (cp.device_type === 'shelly' && deviceStateCache[cp.device_id]) ? deviceStateCache[cp.device_id].kwh : 0;
    const { data: session, error: sessionError } = await supabase.from('sessions')
      .insert({ charge_point_id: cp.id, user_id: user.id, status: 'active', rate_per_kwh: ratePerKwh, evflo_margin: evfloMargin, started_at: new Date().toISOString(), start_kwh_reading: startKwh, stripe_payment_intent_id: effectivePaymentIntentId })
      .select('id').single();
    if (sessionError) throw new Error('Session create failed: ' + sessionError.message);
    await supabase.from('charge_points').update({ status: 'occupied' }).eq('id', cp.id);

    try { await sendChargeCommand(cp, 'start'); } catch (cmdErr) {
      console.error('[API] Charge command failed:', cmdErr.message);
      await supabase.from('sessions').update({ status: 'cancelled', stopped_at: new Date().toISOString() }).eq('id', session.id);
      await supabase.from('charge_points').update({ status: 'available' }).eq('id', cp.id);
      if (STRIPE_ENABLED && effectivePaymentIntentId) { try { await stripe.paymentIntents.cancel(effectivePaymentIntentId); } catch (e) { /* best effort */ } }
      return res.status(503).json({ error: 'Charger not responding. Please try again.' });
    }

    console.log('[API] Session started: ' + session.id + ' — PI: ' + (effectivePaymentIntentId || 'none'));
    res.json({ sessionId: session.id, status: 'active', startedAt: new Date().toISOString(), ratePerKwh: ratePerKwh.toFixed(2) });
  } catch (err) { console.error('[API] POST /sessions/start error:', err.message); res.status(500).json({ error: 'Failed to start session' }); }
});

app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { data: session, error } = await supabase.from('sessions')
      .select('id, status, kwh_consumed, rate_per_kwh, start_kwh_reading, started_at, stopped_at, charge_points(device_id, sites(name, currency))')
      .eq('id', req.params.sessionId).single();
    if (error || !session) return res.status(404).json({ error: 'Session not found' });
    const { data: telemetry } = await supabase.from('session_telemetry')
      .select('kwh_total, watts').eq('session_id', req.params.sessionId)
      .order('recorded_at', { ascending: false }).limit(1).single();
    const site = session.charge_points?.sites;
    const ratePerKwh = parseFloat(session.rate_per_kwh) || 0;
    const startKwh = parseFloat(session.start_kwh_reading ?? 0);
    const rawKwh = telemetry?.kwh_total ?? startKwh;
    const kwhConsumed = session.status === 'completed' ? parseFloat(session.kwh_consumed ?? 0) : parseFloat(Math.max(0, rawKwh - startKwh).toFixed(4));
    const runningCostCents = Math.round(kwhConsumed * ratePerKwh * 100);
    res.json({ sessionId: session.id, status: session.status, siteName: site?.name || '', kwhConsumed: parseFloat(kwhConsumed.toFixed(4)), powerWatts: telemetry?.watts ?? 0, runningCostCents, runningCostAud: (runningCostCents / 100).toFixed(2), ratePerKwh: ratePerKwh.toFixed(2), currency: site?.currency || 'AUD', startedAt: session.started_at, endedAt: session.stopped_at ?? null });
  } catch (err) { console.error('[API] GET /sessions/:id error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

async function reattachPmAfterCancel(userId, paymentIntentId) {
  try {
    const { data: user } = await supabase.from('users').select('stripe_customer_id, stripe_default_pm').eq('id', userId).single();
    if (!user || !user.stripe_customer_id || !user.stripe_default_pm) return;
    try {
      await stripe.paymentMethods.attach(user.stripe_default_pm, { customer: user.stripe_customer_id });
      console.log('[API] PM re-attached after cancel for user', userId);
    } catch (e) {
      if (e.code === 'payment_method_already_attached') { console.log('[API] PM already attached — no action needed'); }
      else { console.error('[API] PM re-attach failed:', e.message); }
    }
  } catch (e) { console.error('[API] reattachPmAfterCancel error:', e.message); }
}

app.post('/api/sessions/:sessionId/stop', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data: session, error: sessionError } = await supabase.from('sessions')
      .select('id, user_id, status, rate_per_kwh, evflo_margin, start_kwh_reading, stripe_payment_intent_id, charge_points(id, device_id, device_type, ocpp_identity, circuit_type, sites(id, rate_10a_per_kwh, rate_15a_per_kwh, rate_32a_per_kwh, evflo_fee_10a_per_kwh, evflo_fee_15a_per_kwh, evflo_fee_32a_per_kwh, currency))')
      .eq('id', sessionId).single();
    if (sessionError || !session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'active') return res.status(409).json({ error: 'Session is ' + session.status });
    const cp = session.charge_points;
    const site = cp.sites;

    try { await sendChargeCommand(cp, 'stop', sessionId); } catch (cmdErr) { console.error('[API] Stop command warning (non-fatal):', cmdErr.message); }

    const { data: finalTelemetry } = await supabase.from('session_telemetry')
      .select('kwh_total').eq('session_id', sessionId).order('recorded_at', { ascending: false }).limit(1).single();
    const finalKwh = finalTelemetry?.kwh_total ?? 0;
    const startKwh = parseFloat(session.start_kwh_reading ?? 0);
    const kwhConsumed = parseFloat(Math.max(0, finalKwh - startKwh).toFixed(4));
    await supabase.from('sessions').update({ status: 'completed', kwh_consumed: kwhConsumed, final_kwh_reading: finalKwh, stopped_at: new Date().toISOString() }).eq('id', sessionId);
    await supabase.from('charge_points').update({ status: 'available' }).eq('id', cp.id);
    const ratePerKwh = parseFloat(session.rate_per_kwh);
    const circuit = cp.circuit_type || '10a';
    const siteHostRate = parseFloat(site['rate_' + circuit + '_per_kwh'] || site.rate_10a_per_kwh);
    const evfloFee = parseFloat(site['evflo_fee_' + circuit + '_per_kwh'] || site.evflo_fee_10a_per_kwh);
    const totalCents = Math.round(kwhConsumed * ratePerKwh * 100);
    const siteHostCents = Math.round(kwhConsumed * siteHostRate * 100);
    const evfloFeeCents = totalCents - siteHostCents;
    let stripeChargeStatus = 'pending';
    let transactionId = null;

    // Free session: no Stripe, always create $0 transaction for audit trail
    if (!session.stripe_payment_intent_id) {
      stripeChargeStatus = 'succeeded';
      const { data: txn, error: txnError } = await supabase.from('transactions')
        .insert({ session_id: sessionId, user_id: session.user_id, site_id: site.id, type: 'charge', total_amount_cents: 0, site_host_amount_cents: 0, evflo_fee_cents: 0, currency: 'AUD', kwh_consumed: kwhConsumed, site_host_rate_per_kwh: parseFloat(site.site_host_rate_per_kwh), evflo_fee_per_kwh: parseFloat(site.evflo_fee_per_kwh), stripe_payment_intent_id: null, stripe_charge_status: 'succeeded', metadata: { billing_type: 'free', kwh_consumed: kwhConsumed } })
        .select('id').single();
      if (txnError) console.error('[API] Free transaction insert failed:', txnError.message);
      else transactionId = txn.id;
      console.log('[API] FREE session stopped: ' + sessionId + ' — ' + kwhConsumed + ' kWh — $0.00');
      return res.json({ sessionId, status: 'completed', kwhConsumed, totalAmountCents: 0, totalAmountAud: '0.00', ratePerKwh: '0.00', transactionId, currency: 'AUD', stripeStatus: 'succeeded', freeCharge: true });
    }

    if (kwhConsumed > 0) {
      if (STRIPE_ENABLED && session.stripe_payment_intent_id) {
        try {
          if (totalCents >= 50) {
            let captureCents = totalCents;
            if (totalCents > PRE_AUTH_AMOUNT_CENTS) { console.log('[API] WARNING: capping capture at pre-auth'); captureCents = PRE_AUTH_AMOUNT_CENTS; }
            await stripe.paymentIntents.capture(session.stripe_payment_intent_id, { amount_to_capture: captureCents });
            stripeChargeStatus = 'succeeded';
            console.log('[API] Stripe captured: ' + session.stripe_payment_intent_id + ' — $' + (captureCents / 100).toFixed(2));
          } else {
            await stripe.paymentIntents.cancel(session.stripe_payment_intent_id);
            stripeChargeStatus = 'cancelled';
            console.log('[API] Stripe cancelled (amount < $0.50): ' + session.stripe_payment_intent_id);
            await reattachPmAfterCancel(session.user_id, session.stripe_payment_intent_id);
          }
        } catch (stripeErr) { stripeChargeStatus = 'failed'; console.error('[API] Stripe capture failed:', stripeErr.message); }
      }
      const { data: txn, error: txnError } = await supabase.from('transactions')
        .insert({ session_id: sessionId, user_id: session.user_id, site_id: site.id, type: 'charge', total_amount_cents: totalCents, site_host_amount_cents: siteHostCents, evflo_fee_cents: evfloFeeCents, currency: 'AUD', kwh_consumed: kwhConsumed, site_host_rate_per_kwh: siteHostRate, evflo_fee_per_kwh: evfloFee, stripe_payment_intent_id: session.stripe_payment_intent_id, stripe_charge_status: stripeChargeStatus, metadata: { kwh_consumed: kwhConsumed, rate_per_kwh: ratePerKwh, total_aud: (totalCents / 100).toFixed(2), capture_capped: totalCents > PRE_AUTH_AMOUNT_CENTS, original_amount_cents: totalCents } })
        .select('id').single();
      if (txnError) console.error('[API] Transaction insert failed:', txnError.message);
      else transactionId = txn.id;
    } else {
      if (STRIPE_ENABLED && session.stripe_payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(session.stripe_payment_intent_id);
          console.log('[API] Stripe cancelled — 0 kWh session: ' + session.stripe_payment_intent_id);
          await reattachPmAfterCancel(session.user_id, session.stripe_payment_intent_id);
        } catch (stripeErr) { console.error('[API] Stripe cancel failed:', stripeErr.message); }
      }
    }
    console.log('[API] Session stopped: ' + sessionId + ' — ' + kwhConsumed + ' kWh — $' + (totalCents / 100).toFixed(2) + ' — Stripe: ' + stripeChargeStatus);
    res.json({ sessionId, status: 'completed', kwhConsumed, totalAmountCents: totalCents, totalAmountAud: (totalCents / 100).toFixed(2), ratePerKwh: ratePerKwh.toFixed(2), transactionId, currency: 'AUD', stripeStatus: stripeChargeStatus });
  } catch (err) { console.error('[API] POST /sessions/stop error:', err.message); res.status(500).json({ error: 'Failed to stop session' }); }
});

app.get('/api/transactions/:transactionId', async (req, res) => {
  try {
    const { data: txn, error } = await supabase.from('transactions').select('*').eq('id', req.params.transactionId).single();
    if (error || !txn) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ transactionId: txn.id, kwhConsumed: txn.kwh_consumed, ratePerKwh: (parseFloat(txn.site_host_rate_per_kwh) + parseFloat(txn.evflo_fee_per_kwh)).toFixed(2), totalAmountCents: txn.total_amount_cents, totalAmountAud: (txn.total_amount_cents / 100).toFixed(2), currency: txn.currency, status: txn.stripe_charge_status, createdAt: txn.created_at, metadata: txn.metadata });
  } catch (err) { console.error('[API] GET /transactions/:id error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

// ─── F14 Auth endpoints ────────────────────────────────────────────────────────

app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { data: user } = await supabase.from('users').select('has_saved_card').eq('email', email.toLowerCase()).single();
    const returning = !!(user && user.has_saved_card === true);
    res.json({ returning });
  } catch (err) { console.error('[API] check-email error:', err.message); res.json({ returning: false }); }
});

app.post('/api/auth/send-magic-link', async (req, res) => {
  try {
    const { email, chargePointId } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { data: user } = await supabase.from('users').select('id, has_saved_card').eq('email', email.toLowerCase()).single();
    if (!user || !user.has_saved_card) return res.status(400).json({ error: 'No saved card for this email' });
    const { data: recentTokens } = await supabase.from('auth_tokens').select('id').eq('user_id', user.id).gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if (recentTokens && recentTokens.length >= 3) return res.status(429).json({ error: 'Too many magic links requested. Please wait before trying again.' });
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await supabase.from('auth_tokens').insert({ user_id: user.id, token, charge_point_id: chargePointId || null, expires_at: expiresAt });
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const magicLink = 'https://evflo.com.au/auth/verify?token=' + token;
    const { data: emailData, error: emailError } = await resend.emails.send({ from: 'EVFLO <noreply@evflo.com.au>', to: email, subject: 'EVFLO — Tap to start charging', html: '<p>Hi,</p><p>Tap the link below to start your charging session. This link expires in 15 minutes.</p><p><a href="' + magicLink + '" style="background:#22c55e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Start Charging</a></p><p>If you did not request this, ignore this email.</p>' });
    if (emailError) { console.error('[API] Resend error:', JSON.stringify(emailError)); return res.status(500).json({ error: 'Failed to send magic link email' }); }
    console.log('[API] Magic link sent to', email, '— Resend ID:', emailData?.id);
    res.json({ sent: true });
  } catch (err) { console.error('[API] send-magic-link error:', err.message); res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const { data: authToken, error } = await supabase.from('auth_tokens').select('*, user:users(id, email, stripe_default_pm)').eq('token', token).single();
    if (error || !authToken) return res.status(401).json({ error: 'Invalid token' });
    if (authToken.used) return res.status(401).json({ error: 'Token already used' });
    if (new Date(authToken.expires_at) < new Date()) return res.status(401).json({ error: 'Token expired' });
    await supabase.from('auth_tokens').update({ used: true }).eq('id', authToken.id);
    const jwt = require('jsonwebtoken');
    const jwtToken = jwt.sign({ userId: authToken.user.id, email: authToken.user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
    const pmId = authToken.user.stripe_default_pm;
    let last4 = null;
    if (pmId && STRIPE_ENABLED) {
      try { const pm = await stripe.paymentMethods.retrieve(pmId); last4 = pm.card ? pm.card.last4 : null; }
      catch (e) { console.error('[API] Could not retrieve PM last4:', e.message); }
    }
    const chargePointId = authToken.charge_point_id;
    const redirectUrl = 'https://evflo.com.au/start/' + (chargePointId || 'EVFLO-01') + '?jwt=' + jwtToken + (last4 ? '&last4=' + last4 : '');
    res.redirect(redirectUrl);
  } catch (err) { console.error('[API] verify error:', err.message); res.status(500).json({ error: err.message }); }
});

app.post('/api/user/save-card', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const { data: session } = await supabase.from('sessions').select('user_id').eq('id', sessionId).single();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const { data: user } = await supabase.from('users').select('id, email, stripe_customer_id, stripe_default_pm').eq('id', session.user_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.stripe_default_pm) return res.status(400).json({ error: 'No payment method on file. Please start a new session.' });
    await supabase.from('users').update({ has_saved_card: true }).eq('id', user.id);
    let last4 = null;
    if (STRIPE_ENABLED && user.stripe_default_pm) {
      try { const pm = await stripe.paymentMethods.retrieve(user.stripe_default_pm); last4 = pm.card ? pm.card.last4 : null; }
      catch (e) { console.error('[API] Could not retrieve PM last4:', e.message); }
    }
    const jwt = require('jsonwebtoken');
    const jwtToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
    console.log('[API] Card saved (flag set) for user', user.id);
    res.json({ saved: true, jwt: jwtToken, last4 });
  } catch (err) { console.error('[API] save-card error:', err.message); res.status(500).json({ error: err.message }); }
});
=======
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
>>>>>>> 9f725cf (F18/F19: Admin dashboard redesign, circuit rates, PATCH/DELETE endpoints)

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

<<<<<<< HEAD
app.get('/api/admin/sites', adminAuth, async (req, res) => {
  const { data, error } = await supabase.from('sites').select('*').eq('is_active', true).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/admin/sites/:siteId/charge-points', adminAuth, async (req, res) => {
  const { data, error } = await supabase.from('charge_points').select('*').eq('site_id', req.params.siteId).eq('is_active', true).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/admin/charge-points', adminAuth, async (req, res) => {
  const { siteId, deviceId, label, deviceType, ocppIdentity, maxPowerKw, connectorType, circuitType } = req.body;
  if (!siteId || !deviceId) return res.status(400).json({ error: 'siteId and deviceId are required' });
  const type = deviceType || 'shelly';
  if (type === 'ocpp' && !ocppIdentity) return res.status(400).json({ error: 'ocppIdentity required for OCPP devices' });
  const { data, error } = await supabase.from('charge_points').insert({ site_id: siteId, device_id: deviceId, label: label || null, status: 'available', device_type: type, ocpp_identity: type === 'ocpp' ? ocppIdentity : null, max_power_kw: maxPowerKw || (type === 'ocpp' ? 7.4 : 2.3), connector_type: connectorType || (type === 'ocpp' ? 'type2_socket' : 'gpo'), circuit_type: circuitType || (type === 'ocpp' ? '32a' : '10a') }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/admin/sites', adminAuth, async (req, res) => {
  const { name, street, suburb, postcode, state, type, siteHostRatePerKwh, evfloFeePerKwh } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  const addressParts = [street, suburb, postcode, state].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(', ') : null;
  const { data, error } = await supabase.from('sites').insert({ name, address, street: street || null, suburb: suburb || null, postcode: postcode || null, state: state || null, type, site_host_rate_per_kwh: siteHostRatePerKwh || 0.35, evflo_fee_per_kwh: evfloFeePerKwh || 0.10, currency: 'AUD' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── PATCH /api/admin/sites/:siteId ───────────────────────────────────────────
app.patch('/api/admin/sites/:siteId', adminAuth, async (req, res) => {
  try {
    const { name, street, suburb, postcode, state, type, siteHostRatePerKwh, evfloFeePerKwh, rate10a, rate15a, rate32a, evfloFee10a, evfloFee15a, evfloFee32a } = req.body;
    const updateObj = {};
    if (name !== undefined) updateObj.name = name;
    if (type !== undefined) updateObj.type = type;
    if (siteHostRatePerKwh !== undefined) updateObj.site_host_rate_per_kwh = siteHostRatePerKwh;
    if (evfloFeePerKwh !== undefined) updateObj.evflo_fee_per_kwh = evfloFeePerKwh;
    if (rate10a !== undefined) updateObj.rate_10a_per_kwh = rate10a;
    if (rate15a !== undefined) updateObj.rate_15a_per_kwh = rate15a;
    if (rate32a !== undefined) updateObj.rate_32a_per_kwh = rate32a;
    if (evfloFee10a !== undefined) updateObj.evflo_fee_10a_per_kwh = evfloFee10a;
    if (evfloFee15a !== undefined) updateObj.evflo_fee_15a_per_kwh = evfloFee15a;
    if (evfloFee32a !== undefined) updateObj.evflo_fee_32a_per_kwh = evfloFee32a;
    if (street !== undefined) updateObj.street = street;
    if (suburb !== undefined) updateObj.suburb = suburb;
    if (postcode !== undefined) updateObj.postcode = postcode;
    if (state !== undefined) updateObj.state = state;
    if (street !== undefined || suburb !== undefined || postcode !== undefined || state !== undefined) {
      const { data: existing } = await supabase.from('sites').select('street, suburb, postcode, state').eq('id', req.params.siteId).single();
      const mergedStreet = street !== undefined ? street : existing?.street;
      const mergedSuburb = suburb !== undefined ? suburb : existing?.suburb;
      const mergedState = state !== undefined ? state : existing?.state;
      const mergedPostcode = postcode !== undefined ? postcode : existing?.postcode;
      updateObj.address = [mergedStreet, mergedSuburb, mergedState, mergedPostcode].filter(Boolean).join(', ') || null;
    }
    if (Object.keys(updateObj).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await supabase.from('sites').update(updateObj).eq('id', req.params.siteId).eq('is_active', true).select().single();
    if (error || !data) return res.status(404).json({ error: 'Site not found' });
    res.json(data);
  } catch (err) { console.error('[API] PATCH /admin/sites error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

// ─── PATCH /api/admin/charge-points/:chargePointId ────────────────────────────
app.patch('/api/admin/charge-points/:chargePointId', adminAuth, async (req, res) => {
  try {
    const { label, deviceId, deviceType, ocppIdentity, maxPowerKw, connectorType, freeChargeEmails, circuitType } = req.body;
    const updateObj = {};
    if (label !== undefined) updateObj.label = label;
    if (deviceId !== undefined) updateObj.device_id = deviceId;
    if (deviceType !== undefined) updateObj.device_type = deviceType;
    if (ocppIdentity !== undefined) updateObj.ocpp_identity = ocppIdentity;
    if (maxPowerKw !== undefined) updateObj.max_power_kw = maxPowerKw;
    if (connectorType !== undefined) updateObj.connector_type = connectorType;
    if (freeChargeEmails !== undefined) updateObj.free_charge_emails = freeChargeEmails;
    if (circuitType !== undefined) updateObj.circuit_type = circuitType;
    if (Object.keys(updateObj).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await supabase.from('charge_points').update(updateObj).eq('id', req.params.chargePointId).eq('is_active', true).select().single();
    if (error || !data) return res.status(404).json({ error: 'Charge point not found' });
    res.json(data);
  } catch (err) { console.error('[API] PATCH /admin/charge-points error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

// ─── DELETE (soft) /api/admin/sites/:siteId ───────────────────────────────────
app.delete('/api/admin/sites/:siteId', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('sites').update({ is_active: false }).eq('id', req.params.siteId).eq('is_active', true).select('id').single();
    if (error || !data) return res.status(404).json({ error: 'Site not found' });
    console.log('[API] Site soft-deleted:', req.params.siteId);
    res.json({ deleted: true, id: data.id });
  } catch (err) { console.error('[API] DELETE /admin/sites error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

// ─── DELETE (soft) /api/admin/charge-points/:chargePointId ───────────────────
app.delete('/api/admin/charge-points/:chargePointId', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('charge_points').update({ is_active: false }).eq('id', req.params.chargePointId).eq('is_active', true).select('id').single();
    if (error || !data) return res.status(404).json({ error: 'Charge point not found' });
    console.log('[API] Charge point soft-deleted:', req.params.chargePointId);
    res.json({ deleted: true, id: data.id });
  } catch (err) { console.error('[API] DELETE /admin/charge-points error:', err.message); res.status(500).json({ error: 'Server error' }); }
});
=======
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
>>>>>>> 9f725cf (F18/F19: Admin dashboard redesign, circuit rates, PATCH/DELETE endpoints)
