
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./db');

const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;
let stripe = null;
if (STRIPE_ENABLED) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log('[API] Stripe enabled');
} else {
  console.log('[API] Stripe not configured — add STRIPE_SECRET_KEY to .env when ready');
}

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

let mqttClient = null;
let deviceStateCache = {};
function setMqttClient(client, deviceMap, deviceState) { mqttClient = client; deviceStateCache = deviceState || {}; }

app.get('/health', (req, res) => res.json({ status: 'ok', stripe: STRIPE_ENABLED }));

app.get('/api/charger/:chargePointId', async (req, res) => {
  try {
    const { data: cp, error } = await supabase.from('charge_points')
      .select('id, device_id, status, sites(id, name, address, site_host_rate_per_kwh, evflo_fee_per_kwh, currency)')
      .eq('device_id', req.params.chargePointId).single();
    if (error || !cp) return res.status(404).json({ error: 'Charger not found' });
    if (cp.status !== 'available') return res.status(409).json({ error: 'Charger not available' });
    const site = cp.sites;
    const ratePerKwh = (parseFloat(site.site_host_rate_per_kwh) + parseFloat(site.evflo_fee_per_kwh)).toFixed(2);
    res.json({ chargePointId: cp.id, deviceId: cp.device_id, siteName: site.name, siteAddress: site.address, siteId: site.id, ratePerKwh, currency: site.currency });
  } catch (err) { console.error('[API] GET /charger error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/sessions/start', async (req, res) => {
  try {
    const { chargePointId, email } = req.body;
    if (!chargePointId || !email) return res.status(400).json({ error: 'chargePointId and email required' });
    const { data: cp, error: cpError } = await supabase.from('charge_points')
      .select('id, device_id, status, sites(id, site_host_rate_per_kwh, evflo_fee_per_kwh, currency)')
      .eq('device_id', chargePointId).single();
    if (cpError || !cp) return res.status(404).json({ error: 'Charger not found' });
    if (cp.status !== 'available') return res.status(409).json({ error: 'Charger not available' });
    const site = cp.sites;
    const ratePerKwh = parseFloat(site.site_host_rate_per_kwh) + parseFloat(site.evflo_fee_per_kwh);
    const evfloMargin = parseFloat(site.evflo_fee_per_kwh);
    const { data: user, error: userError } = await supabase.from('users')
      .upsert({ email }, { onConflict: 'email' }).select('id, stripe_customer_id').single();
    if (userError) throw new Error('User upsert failed: ' + userError.message);
    const { data: session, error: sessionError } = await supabase.from('sessions')
      .insert({ charge_point_id: cp.id, user_id: user.id, status: 'active', rate_per_kwh: ratePerKwh, evflo_margin: evfloMargin, started_at: new Date().toISOString(), start_kwh_reading: deviceStateCache[cp.device_id] ? deviceStateCache[cp.device_id].kwh : 0 })
      .select('id').single();
    if (sessionError) throw new Error('Session create failed: ' + sessionError.message);
    await supabase.from('charge_points').update({ status: 'occupied' }).eq('id', cp.id);
    if (mqttClient) { mqttClient.publish('shelly1pmg4-' + cp.device_id + '/command/switch:0', 'on'); console.log('[API] Relay ON → ' + cp.device_id); }
    console.log('[API] Session started: ' + session.id);
    res.json({ sessionId: session.id, status: 'active', startedAt: new Date().toISOString(), ratePerKwh: ratePerKwh.toFixed(2) });
  } catch (err) { console.error('[API] POST /sessions/start error:', err.message); res.status(500).json({ error: 'Failed to start session' }); }
});

app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { data: session, error } = await supabase.from('sessions')
      .select('id, status, kwh_consumed, rate_per_kwh, started_at, stopped_at, charge_points(device_id, sites(name, currency))')
      .eq('id', req.params.sessionId).single();
    if (error || !session) return res.status(404).json({ error: 'Session not found' });
    const { data: telemetry } = await supabase.from('session_telemetry')
      .select('kwh_total, watts').eq('session_id', req.params.sessionId)
      .order('recorded_at', { ascending: false }).limit(1).single();
    const site = session.charge_points?.sites;
    const ratePerKwh = parseFloat(session.rate_per_kwh) || 0;
    const kwhConsumed = telemetry?.kwh_total ?? parseFloat(session.kwh_consumed) ?? 0;
    const runningCostCents = Math.round(kwhConsumed * ratePerKwh * 100);
    res.json({ sessionId: session.id, status: session.status, siteName: site?.name || '', kwhConsumed: parseFloat(kwhConsumed.toFixed(4)), powerWatts: telemetry?.watts ?? 0, runningCostCents, runningCostAud: (runningCostCents / 100).toFixed(2), ratePerKwh: ratePerKwh.toFixed(2), currency: site?.currency || 'AUD', startedAt: session.started_at, endedAt: session.stopped_at ?? null });
  } catch (err) { console.error('[API] GET /sessions/:id error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/sessions/:sessionId/stop', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data: session, error: sessionError } = await supabase.from('sessions')
      .select('id, user_id, status, rate_per_kwh, evflo_margin, start_kwh_reading, stripe_payment_intent_id, charge_points(id, device_id, sites(id, site_host_rate_per_kwh, evflo_fee_per_kwh, currency))')
      .eq('id', sessionId).single();
    if (sessionError || !session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'active') return res.status(409).json({ error: 'Session is ' + session.status });
    const cp = session.charge_points;
    const site = cp.sites;
    if (mqttClient) { mqttClient.publish('shelly1pmg4-' + cp.device_id + '/command/switch:0', 'off'); console.log('[API] Relay OFF → ' + cp.device_id); }
    const { data: finalTelemetry } = await supabase.from('session_telemetry')
      .select('kwh_total').eq('session_id', sessionId).order('recorded_at', { ascending: false }).limit(1).single();
    const finalKwh = finalTelemetry?.kwh_total ?? 0;
    const startKwh = parseFloat(session.start_kwh_reading ?? 0);
    const kwhConsumed = parseFloat(Math.max(0, finalKwh - startKwh).toFixed(4));
    await supabase.from('sessions').update({ status: 'completed', kwh_consumed: kwhConsumed, final_kwh_reading: finalKwh, stopped_at: new Date().toISOString() }).eq('id', sessionId);
    await supabase.from('charge_points').update({ status: 'available' }).eq('id', cp.id);
    const ratePerKwh = parseFloat(session.rate_per_kwh);
    const siteHostRate = parseFloat(site.site_host_rate_per_kwh);
    const evfloFee = parseFloat(site.evflo_fee_per_kwh);
    const totalCents = Math.round(kwhConsumed * ratePerKwh * 100);
    const siteHostCents = Math.round(kwhConsumed * siteHostRate * 100);
    const evfloFeeCents = totalCents - siteHostCents;
    let transactionId = null;
    if (kwhConsumed > 0) {
      const { data: txn, error: txnError } = await supabase.from('transactions')
        .insert({ session_id: sessionId, user_id: session.user_id, site_id: site.id, type: 'charge', total_amount_cents: totalCents, site_host_amount_cents: siteHostCents, evflo_fee_cents: evfloFeeCents, currency: 'AUD', kwh_consumed: kwhConsumed, site_host_rate_per_kwh: siteHostRate, evflo_fee_per_kwh: evfloFee, stripe_charge_status: 'pending', metadata: { kwh_consumed: kwhConsumed, rate_per_kwh: ratePerKwh, total_aud: (totalCents / 100).toFixed(2) } })
        .select('id').single();
      if (txnError) console.error('[API] Transaction insert failed:', txnError.message);
      else transactionId = txn.id;
    }
    console.log('[API] Session stopped: ' + sessionId + ' — ' + kwhConsumed + ' kWh — $' + (totalCents / 100).toFixed(2));
    res.json({ sessionId, status: 'completed', kwhConsumed, totalAmountCents: totalCents, totalAmountAud: (totalCents / 100).toFixed(2), ratePerKwh: ratePerKwh.toFixed(2), transactionId, currency: 'AUD' });
  } catch (err) { console.error('[API] POST /sessions/stop error:', err.message); res.status(500).json({ error: 'Failed to stop session' }); }
});

app.get('/api/transactions/:transactionId', async (req, res) => {
  try {
    const { data: txn, error } = await supabase.from('transactions').select('*').eq('id', req.params.transactionId).single();
    if (error || !txn) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ transactionId: txn.id, kwhConsumed: txn.kwh_consumed, ratePerKwh: (parseFloat(txn.site_host_rate_per_kwh) + parseFloat(txn.evflo_fee_per_kwh)).toFixed(2), totalAmountCents: txn.total_amount_cents, totalAmountAud: (txn.total_amount_cents / 100).toFixed(2), currency: txn.currency, status: txn.stripe_charge_status, createdAt: txn.created_at, metadata: txn.metadata });
  } catch (err) { console.error('[API] GET /transactions/:id error:', err.message); res.status(500).json({ error: 'Server error' }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('[API] Server listening on port ' + PORT));
module.exports = { app, setMqttClient };
