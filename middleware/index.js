// index.js — EVFLO Middleware entry point
// Lives at: /evflo/middleware/index.js
//
// Starts three things:
//   1. MQTT client — subscribes to Shelly device messages
//   2. OCPP WebSocket server — handles device registration and heartbeats
//   3. Express API server — endpoints for the React frontend

require('dotenv').config();
const mqtt = require('mqtt');
const supabase = require('./db');
const { setMqttClient } = require('./api');

// ocpp.js starts its WebSocket server on require
require('./ocpp');

// ─── MQTT connection ──────────────────────────────────────────────────────────
const client = mqtt.connect('mqtt://localhost:1883', {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
});

client.on('connect', () => {
  console.log('[EVFLO] Middleware connected to MQTT broker');
  client.subscribe('shellies/#', (err) => {
    if (!err) console.log('[EVFLO] Subscribed to shellies/#');
  });
  // Pass MQTT client to API layer so it can send relay commands
  setMqttClient(client);
});

client.on('message', (topic, message) => {
  const payload = message.toString();
  console.log(`[MQTT] ${topic} -> ${payload}`);
  handleShellyMessage(topic, payload);
});

client.on('error', (err) => {
  console.error('[MQTT] Connection error:', err.message);
});

// ─── Shelly message handler ───────────────────────────────────────────────────
function handleShellyMessage(topic, payload) {
  const parts = topic.split('/');
  const deviceId = parts[1];
  const property = parts.slice(2).join('/');

  switch (property) {
    case 'relay/0':
      console.log(`[DEVICE] ${deviceId} relay is ${payload}`);
      break;

    case 'relay/0/power':
      const watts = parseFloat(payload);
      console.log(`[DEVICE] ${deviceId} power: ${watts}W`);
      checkForFault(deviceId, watts);
      break;

    case 'relay/0/energy':
      const kwh = (parseFloat(payload) / 60000).toFixed(4);
      console.log(`[DEVICE] ${deviceId} energy: ${kwh} kWh`);
      storeTelemetry(deviceId, parseFloat(kwh), null);
      break;

    default:
      break;
  }
}

// ─── Telemetry storage ────────────────────────────────────────────────────────
// Writes kWh and power readings to session_telemetry table in Supabase.
async function storeTelemetry(deviceId, kwhReading, powerWatts) {
  try {
    // Find active session for this device
    const { data: cp } = await supabase
      .from('charge_points')
      .select('id')
      .eq('identifier', deviceId)
      .single();

    if (!cp) return;

    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('charge_point_id', cp.id)
      .eq('status', 'active')
      .single();

    if (!session) return;

    await supabase.from('session_telemetry').insert({
      session_id:  session.id,
      kwh_reading: kwhReading,
      power_watts: powerWatts,
      timestamp:   new Date().toISOString()
    });

  } catch (err) {
    // Non-fatal — log and continue
    console.error('[TELEMETRY] Store error:', err.message);
  }
}

// ─── Fault detection ──────────────────────────────────────────────────────────
const activeSessions = {};

function checkForFault(deviceId, watts) {
  if (!activeSessions[deviceId]) return;
  const session = activeSessions[deviceId];

  // Store power reading in telemetry
  storeTelemetry(deviceId, null, watts);

  if (watts === 0) {
    if (!session.faultStart) {
      session.faultStart = Date.now();
      console.log(`[FAULT] ${deviceId} power dropped to 0W - monitoring...`);
    } else {
      const elapsed = (Date.now() - session.faultStart) / 1000;
      if (elapsed > 30 && !session.faultFlagged) {
        session.faultFlagged = true;
        console.log(`[FAULT] ${deviceId} confirmed fault - power out for ${elapsed.toFixed(0)}s`);
      }
    }
  } else {
    if (session.faultFlagged) {
      console.log(`[FAULT] ${deviceId} power restored - resuming session`);
      session.faultFlagged = false;
    }
    session.faultStart = null;
  }
}

// ─── Direct relay control (used internally / for testing) ─────────────────────
function startCharging(deviceId) {
  client.publish(`shellies/${deviceId}/relay/0/command`, 'on');
  activeSessions[deviceId] = { startTime: Date.now(), faultStart: null, faultFlagged: false };
  console.log(`[CONTROL] Started charging on ${deviceId}`);
}

function stopCharging(deviceId) {
  client.publish(`shellies/${deviceId}/relay/0/command`, 'off');
  delete activeSessions[deviceId];
  console.log(`[CONTROL] Stopped charging on ${deviceId}`);
}

module.exports = { startCharging, stopCharging };

console.log('[EVFLO] Middleware starting...');
