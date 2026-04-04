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

app.use(cors({ origin: 'https://evflo.com.au', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'x-admin-key', 'Authorization'] }));
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
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PRE_AUTH_AMOUNT_CENTS,
      currency: 'aud',
      capture_method: 'manual',
      customer: customerId,
      setup_future_usage: 'off_session',
      description: 'EVFLO charging session pre-authorisation',
      metadata: { email }
    });
    console.log('[API] PaymentIntent created: ' + paymentIntent.id + ' — $' + (PRE_AUTH_AMOUNT_CENTS / 100).toFixed(2) + ' hold');
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) { console.error('[API] create-payment-intent error:', err.message); res.status(500).json({ error: 'Failed to create payment intent' }); }
});

app.post('/api/sessions/start', async (req, res) => {
  try {
    const { chargePointId, email, paymentIntentId } = req.body;

    // F14: check for JWT auth (returning user with saved card)
    const authHeader = req.headers['authorization'];
    let jwtUserId = null;
    let jwtEmail = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        jwtUserId = decoded.userId;
        jwtEmail = decoded.email;
      } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired token. Please request a new magic link.' });
      }
    }

    const effectiveEmail = jwtEmail || email;
    if (!chargePointId || !effectiveEmail) return res.status(400).json({ error: 'chargePointId and email required' });

    // Guest flow requires paymentIntentId; JWT flow does not
    if (STRIPE_ENABLED && !jwtUserId && !paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required' });

    const { data: cp, error: cpError } = await supabase.from('charge_points')
      .select('id, device_id, status, sites(id, site_host_rate_per_kwh, evflo_fee_per_kwh, currency)')
      .eq('device_id', chargePointId).single();
    if (cpError || !cp) return res.status(404).json({ error: 'Charger not found' });
    if (cp.status !== 'available') return res.status(409).json({ error: 'Charger not available' });

    const site = cp.sites;
    const ratePerKwh = parseFloat(site.site_host_rate_per_kwh) + parseFloat(site.evflo_fee_per_kwh);
    const evfloMargin = parseFloat(site.evflo_fee_per_kwh);

    // Upsert user
    const { data: user, error: userError } = await supabase.from('users')
      .upsert({ email: effectiveEmail }, { onConflict: 'email' }).select('id, email, stripe_customer_id, stripe_default_pm, has_saved_card').single();
    if (userError) throw new Error('User upsert failed: ' + userError.message);

    let effectivePaymentIntentId = paymentIntentId || null;

    if (jwtUserId) {
      // ── RETURNING USER: use saved card to create a new PaymentIntent ──
      if (!STRIPE_ENABLED) return res.status(400).json({ error: 'Stripe not enabled' });
      if (!user.stripe_customer_id || !user.stripe_default_pm) {
        return res.status(402).json({ error: 'No saved card on file. Please start a new session.' });
      }
      const pi = await stripe.paymentIntents.create({
        amount: PRE_AUTH_AMOUNT_CENTS,
        currency: 'aud',
        capture_method: 'manual',
        customer: user.stripe_customer_id,
        payment_method: user.stripe_default_pm,
        confirm: true,
        off_session: true,
        description: 'EVFLO charging session pre-authorisation (returning user)',
        metadata: { email: effectiveEmail, evflo_user_id: user.id }
      });
      if (pi.status !== 'requires_capture') {
        return res.status(402).json({ error: 'Card authorisation failed. Please use a different card.' });
      }
      effectivePaymentIntentId = pi.id;
      console.log('[API] Returning user PI created: ' + pi.id);
    } else {
      // ── GUEST FLOW: verify the PI they confirmed on the frontend ──
      if (STRIPE_ENABLED && paymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== 'requires_capture') {
          return res.status(402).json({ error: 'Payment not confirmed. Please complete card authorisation.' });
        }

        // Option A: attach PM to Customer NOW before capture, so save-card works later
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
            // Store PM id on user so it's ready if they save card later
            await supabase.from('users').update({ stripe_default_pm: pmId }).eq('id', user.id);
            console.log('[API] PM attached to customer at session start for user', user.id);
          }
        } catch (attachErr) {
          // Non-fatal — log but don't block session start
          console.error('[API] PM attach warning (non-fatal):', attachErr.message);
        }
      }
    }

    const { data: session, error: sessionError } = await supabase.from('sessions')
      .insert({
        charge_point_id: cp.id,
        user_id: user.id,
        status: 'active',
        rate_per_kwh: ratePerKwh,
        evflo_margin: evfloMargin,
        started_at: new Date().toISOString(),
        start_kwh_reading: deviceStateCache[cp.device_id] ? deviceStateCache[cp.device_id].kwh : 0,
        stripe_payment_intent_id: effectivePaymentIntentId
      })
      .select('id').single();
    if (sessionError) throw new Error('Session create failed: ' + sessionError.message);

    await supabase.from('charge_points').update({ status: 'occupied' }).eq('id', cp.id);
    if (mqttClient) { mqttClient.publish('shelly1pmg4-' + cp.device_id + '/command/switch:0', 'on'); console.log('[API] Relay ON → ' + cp.device_id); }
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

// Helper: re-attach PM to customer after a PI is cancelled (Stripe detaches on cancel)
async function reattachPmAfterCancel(userId, paymentIntentId) {
  try {
    const { data: user } = await supabase.from('users').select('stripe_customer_id, stripe_default_pm').eq('id', userId).single();
    if (!user || !user.stripe_customer_id || !user.stripe_default_pm) return;
    // Re-attach — ignore if already attached
    try {
      await stripe.paymentMethods.attach(user.stripe_default_pm, { customer: user.stripe_customer_id });
      console.log('[API] PM re-attached after cancel for user', userId);
    } catch (e) {
      if (e.code === 'payment_method_already_attached') {
        console.log('[API] PM already attached — no action needed');
      } else {
        console.error('[API] PM re-attach failed:', e.message);
      }
    }
  } catch (e) {
    console.error('[API] reattachPmAfterCancel error:', e.message);
  }
}

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
    let stripeChargeStatus = 'pending';
    let transactionId = null;
    if (kwhConsumed > 0) {
      if (STRIPE_ENABLED && session.stripe_payment_intent_id) {
        try {
          if (totalCents >= 50) {
            let captureCents = totalCents;
            if (totalCents > PRE_AUTH_AMOUNT_CENTS) {
              console.log('[API] WARNING: Capture amount $' + (totalCents / 100).toFixed(2) + ' exceeds pre-auth $' + (PRE_AUTH_AMOUNT_CENTS / 100).toFixed(2) + ' — capping at pre-auth amount');
              captureCents = PRE_AUTH_AMOUNT_CENTS;
            }
            await stripe.paymentIntents.capture(session.stripe_payment_intent_id, { amount_to_capture: captureCents });
            stripeChargeStatus = 'succeeded';
            console.log('[API] Stripe captured: ' + session.stripe_payment_intent_id + ' — $' + (captureCents / 100).toFixed(2) + (totalCents > PRE_AUTH_AMOUNT_CENTS ? ' (capped from $' + (totalCents / 100).toFixed(2) + ')' : ''));
          } else {
            await stripe.paymentIntents.cancel(session.stripe_payment_intent_id);
            stripeChargeStatus = 'cancelled';
            console.log('[API] Stripe cancelled (amount < $0.50): ' + session.stripe_payment_intent_id);
            // Re-attach PM to customer after cancel — Stripe detaches on cancel
            await reattachPmAfterCancel(session.user_id, session.stripe_payment_intent_id);
          }
        } catch (stripeErr) {
          stripeChargeStatus = 'failed';
          console.error('[API] Stripe capture failed:', stripeErr.message);
        }
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
          // Re-attach PM to customer after cancel — Stripe detaches on cancel
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
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'EVFLO <noreply@evflo.com.au>',
      to: email,
      subject: 'EVFLO — Tap to start charging',
      html: '<p>Hi,</p><p>Tap the link below to start your charging session. This link expires in 15 minutes.</p><p><a href="' + magicLink + '" style="background:#22c55e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Start Charging</a></p><p>If you did not request this, ignore this email.</p>'
    });
    if (emailError) {
      console.error('[API] Resend error:', JSON.stringify(emailError));
      return res.status(500).json({ error: 'Failed to send magic link email' });
    }
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
      try {
        const pm = await stripe.paymentMethods.retrieve(pmId);
        last4 = pm.card ? pm.card.last4 : null;
      } catch (e) { console.error('[API] Could not retrieve PM last4:', e.message); }
    }
    const chargePointId = authToken.charge_point_id;
    const redirectUrl = 'https://evflo.com.au/start/' + (chargePointId || 'EVFLO-01') + '?jwt=' + jwtToken + (last4 ? '&last4=' + last4 : '');
    res.redirect(redirectUrl);
  } catch (err) { console.error('[API] verify error:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/user/save-card
// Option A: PM already attached to Customer at session start.
// This endpoint now just flips has_saved_card = true and issues a JWT.
app.post('/api/user/save-card', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const { data: session } = await supabase.from('sessions').select('user_id').eq('id', sessionId).single();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const { data: user } = await supabase.from('users').select('id, email, stripe_customer_id, stripe_default_pm').eq('id', session.user_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.stripe_default_pm) return res.status(400).json({ error: 'No payment method on file. Please start a new session.' });

    // Flip the flag — PM is already attached (done at session start)
    await supabase.from('users').update({ has_saved_card: true }).eq('id', user.id);

    // Get last4 for display
    let last4 = null;
    if (STRIPE_ENABLED && user.stripe_default_pm) {
      try {
        const pm = await stripe.paymentMethods.retrieve(user.stripe_default_pm);
        last4 = pm.card ? pm.card.last4 : null;
      } catch (e) { console.error('[API] Could not retrieve PM last4:', e.message); }
    }

    // Issue JWT so they're recognised next session immediately
    const jwt = require('jsonwebtoken');
    const jwtToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

    console.log('[API] Card saved (flag set) for user', user.id);
    res.json({ saved: true, jwt: jwtToken, last4 });
  } catch (err) { console.error('[API] save-card error:', err.message); res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('[API] Server listening on port ' + PORT));
module.exports = { app, setMqttClient };

// ─── Admin endpoints ───────────────────────────────────────────────────────────
const adminAuth = (req, res, next) => {
  if (req.headers['x-admin-key'] !== (process.env.ADMIN_KEY || 'EVFLO#2026')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
};

app.get('/api/admin/sites', adminAuth, async (req, res) => {
  const { data, error } = await supabase.from('sites').select('*').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/admin/sites/:siteId/charge-points', adminAuth, async (req, res) => {
  const { data, error } = await supabase.from('charge_points').select('*').eq('site_id', req.params.siteId).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/admin/charge-points', adminAuth, async (req, res) => {
  const { siteId, deviceId, label } = req.body;
  if (!siteId || !deviceId) return res.status(400).json({ error: 'siteId and deviceId are required' });
  const { data, error } = await supabase.from('charge_points').insert({ site_id: siteId, device_id: deviceId, label: label || null, status: 'available' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/admin/sites', adminAuth, async (req, res) => {
  const { name, street, suburb, postcode, state, type, siteHostRatePerKwh, evfloFeePerKwh } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  const addressParts = [street, suburb, postcode, state].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(', ') : null;
  const { data, error } = await supabase.from('sites').insert({
    name,
    address,
    street: street || null,
    suburb: suburb || null,
    postcode: postcode || null,
    state: state || null,
    type,
    site_host_rate_per_kwh: siteHostRatePerKwh || 0.35,
    evflo_fee_per_kwh: evfloFeePerKwh || 0.10,
    currency: 'AUD'
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});