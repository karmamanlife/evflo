require('dotenv').config();
const mqtt = require('mqtt');
const supabase = require('./db');
const { setMqttClient } = require('./api');
require('./ocpp');

const DEVICE_TOPIC_MAP = { 'EVFLO-01': 'shelly1pmg4-EVFLO-01' };
const TOPIC_DEVICE_MAP = {};
Object.entries(DEVICE_TOPIC_MAP).forEach(([k, v]) => TOPIC_DEVICE_MAP[v] = k);

const deviceState = {};

const client = mqtt.connect('mqtt://localhost:1883', { username: process.env.MQTT_USER, password: process.env.MQTT_PASS });

client.on('connect', () => {
  console.log('[EVFLO] Connected to MQTT');
  Object.values(DEVICE_TOPIC_MAP).forEach(prefix => {
    client.subscribe(prefix + '/#', (err) => {
      if (!err) console.log('[EVFLO] Subscribed to ' + prefix + '/#');
    });
  });
  setMqttClient(client, DEVICE_TOPIC_MAP, deviceState);
  setTimeout(recoverSessions, 5000);
});

client.on('message', (topic, message) => {
  const payload = message.toString();
  console.log('[MQTT] ' + topic + ' -> ' + payload);
  handleShellyMessage(topic, payload);
});

client.on('error', (err) => { console.error('[MQTT] Error:', err.message); });

async function recoverSessions() {
  try {
    console.log('[RECOVERY] Checking for orphaned active sessions...');
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, user_id, start_kwh_reading, stripe_payment_intent_id, charge_points(id, device_id, sites(id))')
      .eq('status', 'active');
    if (error) { console.error('[RECOVERY] Query failed:', error.message); return; }
    if (!sessions || sessions.length === 0) { console.log('[RECOVERY] No orphaned sessions found.'); return; }
    console.log('[RECOVERY] Found ' + sessions.length + ' active session(s) to reconcile.');
    const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;
    let stripe = null;
    if (STRIPE_ENABLED) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    for (const session of sessions) {
      const cp = session.charge_points;
      const deviceId = cp?.device_id;
      console.log('[RECOVERY] Session ' + session.id + ' — device ' + deviceId);
      await supabase.from('sessions').update({
        status: 'cancelled',
        stopped_at: new Date().toISOString(),
        kwh_consumed: 0
      }).eq('id', session.id);
      if (cp?.id) {
        await supabase.from('charge_points').update({ status: 'available' }).eq('id', cp.id);
      }
      if (STRIPE_ENABLED && stripe && session.stripe_payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(session.stripe_payment_intent_id);
          console.log('[RECOVERY] Stripe PI cancelled: ' + session.stripe_payment_intent_id);
        } catch (stripeErr) {
          console.log('[RECOVERY] Stripe cancel skipped: ' + stripeErr.message);
        }
      }
      if (deviceId && DEVICE_TOPIC_MAP[deviceId]) {
        client.publish(DEVICE_TOPIC_MAP[deviceId] + '/command/switch:0', 'off');
        console.log('[RECOVERY] Relay OFF sent to ' + deviceId);
      }
      console.log('[RECOVERY] Session ' + session.id + ' marked cancelled.');
    }
    console.log('[RECOVERY] Done.');
  } catch (err) {
    console.error('[RECOVERY] Unexpected error:', err.message);
  }
}

function handleShellyMessage(topic, payload) {
  const parts = topic.split('/');
  const topicPrefix = parts[0];
  const deviceId = TOPIC_DEVICE_MAP[topicPrefix];
  if (!deviceId) return;
  const property = parts.slice(1).join('/');
  if (property === 'online') { console.log('[DEVICE] ' + deviceId + ' is ' + payload); return; }
  if (property === 'status/switch:0') {
    try {
      const data = JSON.parse(payload);
      const watts = data.apower != null ? data.apower : null;
      const kwh = data.aenergy && data.aenergy.total != null ? data.aenergy.total : null;
      const output = data.output != null ? data.output : null;
      if (output !== null) console.log('[DEVICE] ' + deviceId + ' relay: ' + (output ? 'ON' : 'OFF'));
      if (watts !== null) { console.log('[DEVICE] ' + deviceId + ' power: ' + watts + 'W'); checkForFault(deviceId, watts); }
      if (kwh !== null) {
        console.log('[DEVICE] ' + deviceId + ' energy: ' + kwh + ' kWh');
        if (!deviceState[deviceId]) deviceState[deviceId] = {};
        deviceState[deviceId].kwh = kwh;
        deviceState[deviceId].watts = watts;
        deviceState[deviceId].updatedAt = new Date().toISOString();
        storeTelemetry(deviceId, kwh, watts);
      }
    } catch(e) { console.error('[MQTT] Parse error:', e.message); }
  }
}

async function storeTelemetry(deviceId, kwhReading, powerWatts) {
  try {
    const { data: cp, error: cpErr } = await supabase.from('charge_points').select('id').eq('device_id', deviceId).single();
    if (cpErr || !cp) { console.log('[TELEMETRY] No charge_point found for ' + deviceId); return; }
    const { data: session, error: sErr } = await supabase.from('sessions').select('id').eq('charge_point_id', cp.id).eq('status', 'active').single();
    if (sErr || !session) { console.log('[TELEMETRY] No active session for ' + deviceId); return; }
    const { error: iErr } = await supabase.from('session_telemetry').insert({ session_id: session.id, kwh_total: kwhReading, watts: powerWatts, recorded_at: new Date().toISOString() });
    if (iErr) { console.error('[TELEMETRY] Insert error:', iErr.message); return; }
    console.log('[TELEMETRY] Saved ' + kwhReading + ' kWh, ' + powerWatts + 'W for session ' + session.id);
    // B9: 80% hold monitoring — foundation for future incremental auth
    try {
      const { data: sess } = await supabase.from('sessions').select('start_kwh_reading, rate_per_kwh').eq('id', session.id).single();
      if (sess) {
        const estimatedKwh = Math.max(0, kwhReading - parseFloat(sess.start_kwh_reading || 0));
        const estimatedCents = Math.round(estimatedKwh * parseFloat(sess.rate_per_kwh || 0) * 100);
        const holdThreshold = Math.round(PRE_AUTH_AMOUNT_CENTS * 0.8);
        if (estimatedCents > holdThreshold) {
          console.log('[HOLD-MONITOR] WARNING: Session ' + session.id + ' estimated cost $' + (estimatedCents / 100).toFixed(2) + ' exceeds 80% of $' + (PRE_AUTH_AMOUNT_CENTS / 100).toFixed(2) + ' hold');
        }
      }
    } catch (monErr) { /* non-fatal monitoring */ }
  } catch(err) { console.error('[TELEMETRY] Error:', err.message); }
}

const activeSessions = {};
function checkForFault(deviceId, watts) {
  if (!activeSessions[deviceId]) return;
  const session = activeSessions[deviceId];
  if (watts === 0) {
    if (!session.faultStart) { session.faultStart = Date.now(); console.log('[FAULT] ' + deviceId + ' power 0W - monitoring...'); }
    else {
      const elapsed = (Date.now() - session.faultStart) / 1000;
      if (elapsed > 30 && !session.faultFlagged) { session.faultFlagged = true; console.log('[FAULT] ' + deviceId + ' confirmed fault ' + elapsed.toFixed(0) + 's'); }
    }
  } else {
    if (session.faultFlagged) { console.log('[FAULT] ' + deviceId + ' power restored'); session.faultFlagged = false; }
    session.faultStart = null;
  }
}

function startCharging(deviceId) {
  const prefix = DEVICE_TOPIC_MAP[deviceId];
  if (!prefix) { console.error('[CONTROL] Unknown device: ' + deviceId); return; }
  client.publish(prefix + '/command/switch:0', 'on');
  activeSessions[deviceId] = { startTime: Date.now(), faultStart: null, faultFlagged: false };
  console.log('[CONTROL] Started charging on ' + deviceId);
}

function stopCharging(deviceId) {
  const prefix = DEVICE_TOPIC_MAP[deviceId];
  if (!prefix) { console.error('[CONTROL] Unknown device: ' + deviceId); return; }
  client.publish(prefix + '/command/switch:0', 'off');
  delete activeSessions[deviceId];
  console.log('[CONTROL] Stopped charging on ' + deviceId);
}

module.exports = { startCharging, stopCharging };
console.log('[EVFLO] Middleware starting...');

// ─── Session Timeout (F14 Section 8) ─────────────────────────────────────────
const SESSION_TIMEOUT_HOURS = parseInt(process.env.SESSION_TIMEOUT_HOURS || '12', 10);

async function checkSessionTimeouts() {
  try {
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, user_id, start_kwh_reading, rate_per_kwh, evflo_margin, stripe_payment_intent_id, charge_points(id, device_id, sites(id, site_host_rate_per_kwh, evflo_fee_per_kwh, currency))')
      .eq('status', 'active')
      .lt('started_at', cutoff);
    if (error) { console.error('[TIMEOUT] Query failed:', error.message); return; }
    if (!sessions || sessions.length === 0) return;
    console.log('[TIMEOUT] Found ' + sessions.length + ' stale session(s) older than ' + SESSION_TIMEOUT_HOURS + 'h');
    const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;
    let stripe = null;
    if (STRIPE_ENABLED) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    for (const session of sessions) {
      const cp = session.charge_points;
      const site = cp?.sites;
      const deviceId = cp?.device_id;
      console.log('[TIMEOUT] Auto-stopping session ' + session.id + ' — device ' + deviceId);

      // Relay OFF
      if (deviceId && DEVICE_TOPIC_MAP[deviceId]) {
        client.publish(DEVICE_TOPIC_MAP[deviceId] + '/command/switch:0', 'off');
        console.log('[TIMEOUT] Relay OFF sent to ' + deviceId);
      }

      // Get latest telemetry for final kWh
      const { data: finalTelemetry } = await supabase.from('session_telemetry')
        .select('kwh_total').eq('session_id', session.id).order('recorded_at', { ascending: false }).limit(1).single();
      const finalKwh = finalTelemetry?.kwh_total ?? 0;
      const startKwh = parseFloat(session.start_kwh_reading ?? 0);
      const kwhConsumed = parseFloat(Math.max(0, finalKwh - startKwh).toFixed(4));

      // Update session
      await supabase.from('sessions').update({
        status: 'completed',
        kwh_consumed: kwhConsumed,
        final_kwh_reading: finalKwh,
        stopped_at: new Date().toISOString()
      }).eq('id', session.id);

      // Reset charge point
      if (cp?.id) {
        await supabase.from('charge_points').update({ status: 'available' }).eq('id', cp.id);
      }

      // Billing
      const ratePerKwh = parseFloat(session.rate_per_kwh);
      const siteHostRate = parseFloat(site?.site_host_rate_per_kwh ?? 0);
      const evfloFee = parseFloat(site?.evflo_fee_per_kwh ?? 0);
      const totalCents = Math.round(kwhConsumed * ratePerKwh * 100);
      const siteHostCents = Math.round(kwhConsumed * siteHostRate * 100);
      const evfloFeeCents = totalCents - siteHostCents;

      let stripeChargeStatus = 'pending';

      if (kwhConsumed > 0 && site) {
        if (STRIPE_ENABLED && stripe && session.stripe_payment_intent_id) {
          try {
            if (totalCents >= 50) {
              let captureCents = totalCents;
              if (totalCents > PRE_AUTH_AMOUNT_CENTS) {
                console.log('[TIMEOUT] WARNING: Capture amount $' + (totalCents / 100).toFixed(2) + ' exceeds pre-auth $' + (PRE_AUTH_AMOUNT_CENTS / 100).toFixed(2) + ' — capping at pre-auth amount');
                captureCents = PRE_AUTH_AMOUNT_CENTS;
              }
              await stripe.paymentIntents.capture(session.stripe_payment_intent_id, { amount_to_capture: captureCents });
              stripeChargeStatus = 'succeeded';
              console.log('[TIMEOUT] Stripe captured: ' + session.stripe_payment_intent_id + ' — $' + (captureCents / 100).toFixed(2) + (totalCents > PRE_AUTH_AMOUNT_CENTS ? ' (capped from $' + (totalCents / 100).toFixed(2) + ')' : ''));
            } else {
              await stripe.paymentIntents.cancel(session.stripe_payment_intent_id);
              stripeChargeStatus = 'cancelled';
              console.log('[TIMEOUT] Stripe cancelled (< $0.50): ' + session.stripe_payment_intent_id);
            }
          } catch (stripeErr) {
            stripeChargeStatus = 'failed';
            console.error('[TIMEOUT] Stripe error:', stripeErr.message);
          }
        }
        await supabase.from('transactions').insert({
          session_id: session.id, user_id: session.user_id, site_id: site.id,
          type: 'charge', total_amount_cents: totalCents, site_host_amount_cents: siteHostCents,
          evflo_fee_cents: evfloFeeCents, currency: 'AUD', kwh_consumed: kwhConsumed,
          site_host_rate_per_kwh: siteHostRate, evflo_fee_per_kwh: evfloFee,
          stripe_payment_intent_id: session.stripe_payment_intent_id,
          stripe_charge_status: stripeChargeStatus,
          metadata: { kwh_consumed: kwhConsumed, rate_per_kwh: ratePerKwh, total_aud: (totalCents / 100).toFixed(2), stopped_by: 'timeout', capture_capped: totalCents > PRE_AUTH_AMOUNT_CENTS, original_amount_cents: totalCents }
        });
        console.log('[TIMEOUT] Transaction recorded: ' + kwhConsumed + ' kWh — $' + (totalCents / 100).toFixed(2));
      } else {
        // $0 session — cancel PI
        if (STRIPE_ENABLED && stripe && session.stripe_payment_intent_id) {
          try {
            await stripe.paymentIntents.cancel(session.stripe_payment_intent_id);
            console.log('[TIMEOUT] Stripe PI cancelled — 0 kWh: ' + session.stripe_payment_intent_id);
          } catch (stripeErr) { console.log('[TIMEOUT] Stripe cancel skipped: ' + stripeErr.message); }
        }
      }

      // Clean up activeSessions
      if (deviceId) delete activeSessions[deviceId];
      console.log('[TIMEOUT] Session ' + session.id + ' auto-stopped.');
    }
  } catch (err) {
    console.error('[TIMEOUT] Unexpected error:', err.message);
  }
}

// Run every 15 minutes
setInterval(checkSessionTimeouts, 15 * 60 * 1000);
console.log('[EVFLO] Session timeout checker started (' + SESSION_TIMEOUT_HOURS + 'h limit, 15min interval)');
