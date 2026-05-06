const express = require('express');
const cors = require('cors');
const supabase = require('./db');

const app = express();

const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;
let stripe = null;
if (STRIPE_ENABLED) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log('[API] Stripe enabled');
} else {
  console.log('[API] Stripe not configured — add STRIPE_SECRET_KEY to .env when ready');
}

const PRE_AUTH_AMOUNT_CENTS = parseInt(process.env.PRE_AUTH_AMOUNT_CENTS || '2500');

app.use(cors({ origin: 'https://evflo.com.au', methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'x-admin-key', 'Authorization'] }));
app.use(express.json());

let mqttClient = null;
let deviceStateCache = {};
let ocppModule = null;

function setMqttClient(client, deviceMap, deviceState) { mqttClient = client; deviceStateCache = deviceState || {}; }
function setOcppModule(ocpp) { ocppModule = ocpp; }

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

app.get('/health', (req, res) => res.json({ status: 'ok', stripe: STRIPE_ENABLED }));

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
    // Resolve chargePointId — frontend may send device_id string instead of UUID
    let resolvedCpId = chargePointId || null;
    if (resolvedCpId && !resolvedCpId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data: cpLookup } = await supabase.from('charge_points').select('id').eq('device_id', resolvedCpId).single();
      resolvedCpId = cpLookup ? cpLookup.id : null;
    }
    const { error: insertError } = await supabase.from('auth_tokens').insert({ user_id: user.id, token, charge_point_id: resolvedCpId, expires_at: expiresAt });
    if (insertError) console.error('[API] auth_tokens insert error:', JSON.stringify(insertError));
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
  // GET only validates — does NOT consume token (prevents email prefetch bug)
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const { data: authToken, error } = await supabase.from('auth_tokens').select('id, used, expires_at').eq('token', token).single();
    if (error || !authToken) return res.status(401).json({ error: 'Invalid token' });
    if (authToken.used) return res.status(401).json({ error: 'Token already used' });
    if (new Date(authToken.expires_at) < new Date()) return res.status(401).json({ error: 'Token expired' });
    return res.json({ valid: true });
  } catch (err) { console.error('[API] verify-check error:', err.message); res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/verify', async (req, res) => {
  // POST consumes token — triggered by user tap only
  try {
    const { token } = req.body;
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('[API] Server listening on port ' + PORT));
module.exports = { app, setMqttClient, setOcppModule };

// ─── Admin endpoints ───────────────────────────────────────────────────────────
const adminAuth = (req, res, next) => {
  if (req.headers['x-admin-key'] !== (process.env.ADMIN_KEY || 'EVFLO#2026')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
};

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