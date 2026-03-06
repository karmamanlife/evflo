// api.js — EVFLO Express API server
// Lives at: /evflo/middleware/api.js
//
// Endpoints:
//   GET  /api/charger/:chargePointId     — landing page data
//   POST /api/sessions/start             — create session, turn relay on
//   GET  /api/sessions/:sessionId        — live session state (poll)
//   POST /api/sessions/:sessionId/stop   — stop session, capture payment
//   GET  /api/transactions/:id           — receipt data

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./db');

// ─── Stripe setup ─────────────────────────────────────────────────────────────
// Billing is skipped until STRIPE_SECRET_KEY is added to .env.
// Everything else (sessions, relay, Supabase) works without it.
const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;
let stripe = null;
if (STRIPE_ENABLED) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log('[API] Stripe enabled');
} else {
  console.log('[API] Stripe not configured — add STRIPE_SECRET_KEY to .env when ready');
}

const PRE_AUTH_CENTS = parseInt(process.env.PRE_AUTH_AMOUNT_CENTS || '2500');

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// MQTT client reference — set by index.js after MQTT connects
let mqttClient = null;
function setMqttClient(client) {
  mqttClient = client;
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', stripe: STRIPE_ENABLED, timestamp: new Date().toISOString() });
});

// =============================================================================
// GET /api/charger/:chargePointId
// Called on QR scan. Returns site info and combined rate for landing page.
// =============================================================================
app.get('/api/charger/:chargePointId', async (req, res) => {
  try {
    const { chargePointId } = req.params;

    const { data: cp, error } = await supabase
      .from('charge_points')
      .select(`
        id, identifier, status,
        sites (
          id, name, address, site_type,
          site_host_rate_per_kwh, evflo_fee_per_kwh, currency
        )
      `)
      .eq('id', chargePointId)
      .single();

    if (error || !cp) return res.status(404).json({ error: 'Charger not found' });
    if (cp.status !== 'available') return res.status(409).json({ error: 'Charger not available', status: cp.status });

    const site = cp.sites;
    const ratePerKwh = (
      parseFloat(site.site_host_rate_per_kwh) +
      parseFloat(site.evflo_fee_per_kwh)
    ).toFixed(2);

    res.json({
      chargePointId: cp.id,
      identifier:    cp.identifier,
      siteName:      site.name,
      siteAddress:   site.address,
      siteId:        site.id,
      ratePerKwh,
      currency:      site.currency
    });

  } catch (err) {
    console.error('[API] GET /charger error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// =============================================================================
// POST /api/sessions/start
// Body: { chargePointId, email }
// Creates session, pre-auths card if Stripe enabled, turns relay on.
// =============================================================================
app.post('/api/sessions/start', async (req, res) => {
  try {
    const { chargePointId, email } = req.body;
    if (!chargePointId || !email) return res.status(400).json({ error: 'chargePointId and email required' });

    // Get charger + site rates
    const { data: cp, error: cpError } = await supabase
      .from('charge_points')
      .select(`id, identifier, status, sites ( id, site_host_rate_per_kwh, evflo_fee_per_kwh, currency )`)
      .eq('id', chargePointId)
      .single();

    if (cpError || !cp) return res.status(404).json({ error: 'Charger not found' });
    if (cp.status !== 'available') return res.status(409).json({ error: 'Charger not available' });

    // Upsert user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert({ email }, { onConflict: 'email' })
      .select('id, stripe_customer_id')
      .single();

    if (userError) throw new Error(`User upsert failed: ${userError.message}`);

    // Stripe pre-auth (skipped if not configured)
    let stripePaymentIntentId = null;

    if (STRIPE_ENABLED) {
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({ email, metadata: { evflo_user_id: user.id } });
        customerId = customer.id;
        await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
      }

      const paymentMethods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
      if (!paymentMethods.data.length) return res.status(402).json({ error: 'No payment method on file' });

      const pi = await stripe.paymentIntents.create({
        amount: PRE_AUTH_CENTS,
        currency: 'aud',
        customer: customerId,
        payment_method: paymentMethods.data[0].id,
        capture_method: 'manual',
        confirm: true,
        off_session: true,
        metadata: { type: 'pre_auth' }
      });

      if (pi.status !== 'requires_capture') return res.status(402).json({ error: 'Card pre-authorisation failed' });
      stripePaymentIntentId = pi.id;
    }

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        charge_point_id:          chargePointId,
        user_id:                  user.id,
        status:                   'active',
        start_kwh_reading:        0,
        stripe_payment_intent_id: stripePaymentIntentId,
        started_at:               new Date().toISOString()
      })
      .select('id')
      .single();

    if (sessionError) throw new Error(`Session create failed: ${sessionError.message}`);

    // Mark charger occupied
    await supabase.from('charge_points').update({ status: 'occupied' }).eq('id', chargePointId);

    // Relay ON
    if (mqttClient) {
      mqttClient.publish(`shellies/${cp.identifier}/relay/0/command`, 'on');
      console.log(`[API] Relay ON → ${cp.identifier}`);
    }

    const ratePerKwh = (parseFloat(cp.sites.site_host_rate_per_kwh) + parseFloat(cp.sites.evflo_fee_per_kwh)).toFixed(2);

    console.log(`[API] Session started: ${session.id}`);
    res.json({ sessionId: session.id, status: 'active', startedAt: new Date().toISOString(), ratePerKwh });

  } catch (err) {
    console.error('[API] POST /sessions/start error:', err.message);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// =============================================================================
// GET /api/sessions/:sessionId
// Live session state. Frontend polls every 3 seconds during charging.
// =============================================================================
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select(`
        id, status, start_kwh_reading, final_kwh_reading, started_at, ended_at,
        charge_points ( identifier, sites ( name, site_host_rate_per_kwh, evflo_fee_per_kwh, currency ) )
      `)
      .eq('id', req.params.sessionId)
      .single();

    if (error || !session) return res.status(404).json({ error: 'Session not found' });

    const { data: telemetry } = await supabase
      .from('session_telemetry')
      .select('kwh_reading, power_watts')
      .eq('session_id', req.params.sessionId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    const site = session.charge_points.sites;
    const ratePerKwh = parseFloat(site.site_host_rate_per_kwh) + parseFloat(site.evflo_fee_per_kwh);
    const kwhConsumed = Math.max(0, (telemetry?.kwh_reading ?? 0) - (session.start_kwh_reading ?? 0));
    const runningCostCents = Math.round(kwhConsumed * ratePerKwh * 100);

    res.json({
      sessionId:       session.id,
      status:          session.status,
      siteName:        site.name,
      kwhConsumed:     parseFloat(kwhConsumed.toFixed(4)),
      powerWatts:      telemetry?.power_watts ?? 0,
      runningCostCents,
      runningCostAud:  (runningCostCents / 100).toFixed(2),
      ratePerKwh:      ratePerKwh.toFixed(2),
      currency:        site.currency,
      startedAt:       session.started_at,
      endedAt:         session.ended_at ?? null
    });

  } catch (err) {
    console.error('[API] GET /sessions/:id error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// =============================================================================
// POST /api/sessions/:sessionId/stop
// Relay off, final kWh, Stripe capture, immutable transaction record.
// =============================================================================
app.post('/api/sessions/:sessionId/stop', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(`
        id, user_id, status, start_kwh_reading, stripe_payment_intent_id,
        charge_points ( id, identifier, sites ( id, site_host_rate_per_kwh, evflo_fee_per_kwh, currency ) )
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'active') return res.status(409).json({ error: `Session is ${session.status}` });

    const cp = session.charge_points;
    const site = cp.sites;

    // Relay OFF
    if (mqttClient) {
      mqttClient.publish(`shellies/${cp.identifier}/relay/0/command`, 'off');
      console.log(`[API] Relay OFF → ${cp.identifier}`);
    }

    // Final kWh
    const { data: finalTelemetry } = await supabase
      .from('session_telemetry')
      .select('kwh_reading')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    const finalKwh = finalTelemetry?.kwh_reading ?? session.start_kwh_reading ?? 0;
    const kwhConsumed = parseFloat((finalKwh - (session.start_kwh_reading ?? 0)).toFixed(4));

    // Update session
    await supabase.from('sessions').update({
      status: 'completed', final_kwh_reading: finalKwh, ended_at: new Date().toISOString()
    }).eq('id', sessionId);

    // Mark charger available
    await supabase.from('charge_points').update({ status: 'available' }).eq('id', cp.id);

    // Billing calculation
    const siteHostRate  = parseFloat(site.site_host_rate_per_kwh);
    const evfloFee      = parseFloat(site.evflo_fee_per_kwh);
    const totalRate     = siteHostRate + evfloFee;
    const totalCents    = Math.round(kwhConsumed * totalRate * 100);
    const siteHostCents = Math.round(kwhConsumed * siteHostRate * 100);
    const evfloFeeCents = totalCents - siteHostCents; // derived — prevents rounding gap

    let stripeStatus = 'skipped';

    if (STRIPE_ENABLED && session.stripe_payment_intent_id) {
      if (kwhConsumed <= 0) {
        await stripe.paymentIntents.cancel(session.stripe_payment_intent_id);
        stripeStatus = 'cancelled';
      } else {
        const captured = await stripe.paymentIntents.capture(
          session.stripe_payment_intent_id,
          { amount_to_capture: totalCents }
        );
        stripeStatus = captured.status === 'succeeded' ? 'succeeded' : 'failed';
      }
    }

    // Immutable transaction record
    let transactionId = null;
    if (kwhConsumed > 0) {
      const { data: txn, error: txnError } = await supabase
        .from('transactions')
        .insert({
          session_id:               sessionId,
          user_id:                  session.user_id,
          site_id:                  site.id,
          type:                     'charge',
          total_amount_cents:       totalCents,
          site_host_amount_cents:   siteHostCents,
          evflo_fee_cents:          evfloFeeCents,
          currency:                 'AUD',
          kwh_consumed:             kwhConsumed,
          site_host_rate_per_kwh:   siteHostRate,
          evflo_fee_per_kwh:        evfloFee,
          stripe_payment_intent_id: session.stripe_payment_intent_id,
          stripe_charge_status:     stripeStatus,
          metadata: {
            kwh_consumed: kwhConsumed,
            rate_per_kwh: totalRate,
            total_aud:    (totalCents / 100).toFixed(2),
            charged_at:   new Date().toISOString()
          }
        })
        .select('id')
        .single();

      if (txnError) console.error('[API] Transaction insert failed:', txnError.message);
      else transactionId = txn.id;
    }

    console.log(`[API] Session stopped: ${sessionId} — ${kwhConsumed} kWh — $${(totalCents / 100).toFixed(2)}`);

    res.json({
      sessionId,
      status:           'completed',
      kwhConsumed,
      totalAmountCents: totalCents,
      totalAmountAud:   (totalCents / 100).toFixed(2),
      ratePerKwh:       totalRate.toFixed(2),
      transactionId,
      currency:         'AUD'
    });

  } catch (err) {
    console.error('[API] POST /sessions/stop error:', err.message);
    res.status(500).json({ error: 'Failed to stop session' });
  }
});

// =============================================================================
// GET /api/transactions/:transactionId — receipt data
// =============================================================================
app.get('/api/transactions/:transactionId', async (req, res) => {
  try {
    const { data: txn, error } = await supabase
      .from('transactions').select('*').eq('id', req.params.transactionId).single();

    if (error || !txn) return res.status(404).json({ error: 'Transaction not found' });

    res.json({
      transactionId:    txn.id,
      kwhConsumed:      txn.kwh_consumed,
      ratePerKwh:       (parseFloat(txn.site_host_rate_per_kwh) + parseFloat(txn.evflo_fee_per_kwh)).toFixed(2),
      totalAmountCents: txn.total_amount_cents,
      totalAmountAud:   (txn.total_amount_cents / 100).toFixed(2),
      currency:         txn.currency,
      status:           txn.stripe_charge_status,
      createdAt:        txn.created_at,
      metadata:         txn.metadata
    });

  } catch (err) {
    console.error('[API] GET /transactions/:id error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[API] Server listening on port ${PORT}`));

module.exports = { app, setMqttClient };
