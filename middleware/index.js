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
});

client.on('message', (topic, message) => {
  const payload = message.toString();
  console.log('[MQTT] ' + topic + ' -> ' + payload);
  handleShellyMessage(topic, payload);
});

client.on('error', (err) => { console.error('[MQTT] Error:', err.message); });

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
