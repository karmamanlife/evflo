require('dotenv').config();
const mqtt = require('mqtt');

// MQTT connection
const client = mqtt.connect('mqtt://localhost:1883', {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
});

client.on('connect', () => {
  console.log('[EVFLO] Middleware connected to MQTT broker');
  client.subscribe('shellies/#', (err) => {
    if (!err) console.log('[EVFLO] Subscribed to shellies/#');
  });
});

client.on('message', (topic, message) => {
  const payload = message.toString();
  console.log(`[MQTT] ${topic} -> ${payload}`);
  handleShellyMessage(topic, payload);
});

client.on('error', (err) => {
  console.error('[MQTT] Connection error:', err.message);
});

function handleShellyMessage(topic, payload) {
  const parts = topic.split('/');
  const deviceId = parts[1];
  const property = parts.slice(2).join('/');

  switch (property) {
    case 'relay/0':
      console.log(`[DEVICE] ${deviceId} relay is ${payload}`);
      break;
    case 'relay/0/power':
      console.log(`[DEVICE] ${deviceId} power: ${payload}W`);
      checkForFault(deviceId, parseFloat(payload));
      break;
    case 'relay/0/energy':
      const kwh = (parseFloat(payload) / 60000).toFixed(4);
      console.log(`[DEVICE] ${deviceId} energy: ${kwh} kWh`);
      break;
    default:
      break;
  }
}

// Fault detection
const activeSessions = {};

function checkForFault(deviceId, watts) {
  if (!activeSessions[deviceId]) return;
  const session = activeSessions[deviceId];

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
