const WebSocket = require('ws');
const supabase = require('./db');

const OCPP_PORT = parseInt(process.env.OCPP_PORT || '9000');

// ─── Connection tracking ───────────────────────────────────────────────────────
// Map: ocpp_identity → { ws, chargePointDbId, deviceId, connectorStatus, lastSeen }
const connectedChargers = new Map();

// Map: OCPP transactionId (integer) → EVFLO session_id (uuid)
const ocppTransactionMap = new Map();

// Reverse map: EVFLO session_id → OCPP transactionId
const sessionTransactionMap = new Map();

// Pending call tracking for CS→CP messages
// Map: uniqueId → { resolve, reject, timeout }
const pendingCalls = new Map();
let callCounter = 0;

// ─── OCPP WebSocket Server ─────────────────────────────────────────────────────
const wss = new WebSocket.Server({ port: OCPP_PORT });
console.log('[OCPP] WebSocket server listening on ws://localhost:' + OCPP_PORT);

wss.on('connection', async (ws, req) => {
  // Extract identity from URL: /ocpp/{identity} or /{identity}
  const urlPath = req.url.replace(/^\/ocpp\/?/, '').replace(/^\/+/, '');
  const identity = decodeURIComponent(urlPath);

  if (!identity) {
    console.error('[OCPP] Connection rejected — no identity in URL');
    ws.close(4001, 'No charger identity provided');
    return;
  }

  console.log('[OCPP] Connection attempt from: ' + identity);

  // Validate identity against charge_points table
  const { data: cp, error: cpError } = await supabase
    .from('charge_points')
    .select('id, device_id, ocpp_identity, device_type, status')
    .eq('ocpp_identity', identity)
    .eq('device_type', 'ocpp')
    .single();

  if (cpError || !cp) {
    console.error('[OCPP] Connection rejected — unknown identity: ' + identity);
    ws.close(4002, 'Unknown charger identity');
    return;
  }

  console.log('[OCPP] Charger validated: ' + identity + ' (DB id: ' + cp.id + ')');

  connectedChargers.set(identity, {
    ws,
    chargePointDbId: cp.id,
    deviceId: cp.device_id,
    connectorStatus: 'Unknown',
    lastSeen: new Date().toISOString()
  });

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (e) {
      console.error('[OCPP] Invalid JSON from ' + identity);
      return;
    }

    const messageTypeId = message[0];

    if (messageTypeId === 2) {
      handleCall(identity, message, ws, cp);
    } else if (messageTypeId === 3) {
      handleCallResult(identity, message);
    } else if (messageTypeId === 4) {
      handleCallError(identity, message);
    }
  });

  ws.on('close', () => {
    console.log('[OCPP] Charger disconnected: ' + identity);
    connectedChargers.delete(identity);
  });

  ws.on('error', (err) => {
    console.error('[OCPP] Error on ' + identity + ':', err.message);
  });
});

// ─── Inbound CALL handlers (Charger → EVFLO) ────────────────────────────────

async function handleCall(identity, message, ws, cp) {
  const [, uniqueId, action, payload] = message;
  const conn = connectedChargers.get(identity);
  if (conn) conn.lastSeen = new Date().toISOString();

  console.log('[OCPP] ' + identity + ' → ' + action);

  switch (action) {
    case 'BootNotification':
      await handleBootNotification(identity, uniqueId, payload, ws);
      break;
    case 'Heartbeat':
      handleHeartbeat(identity, uniqueId, ws);
      break;
    case 'StatusNotification':
      await handleStatusNotification(identity, uniqueId, payload, ws, cp);
      break;
    case 'MeterValues':
      await handleMeterValues(identity, uniqueId, payload, ws);
      break;
    case 'StartTransaction':
      await handleStartTransaction(identity, uniqueId, payload, ws, cp);
      break;
    case 'StopTransaction':
      await handleStopTransaction(identity, uniqueId, payload, ws);
      break;
    default:
      console.log('[OCPP] Unhandled action from ' + identity + ': ' + action);
      ws.send(JSON.stringify([4, uniqueId, 'NotImplemented', 'Action ' + action + ' not implemented', {}]));
  }
}

// ── BootNotification ──
async function handleBootNotification(identity, uniqueId, payload, ws) {
  console.log('[OCPP] BootNotification from ' + identity + ': ' + (payload.chargePointVendor || '') + ' ' + (payload.chargePointModel || ''));

  ws.send(JSON.stringify([3, uniqueId, {
    status: 'Accepted',
    currentTime: new Date().toISOString(),
    interval: 60
  }]));

  // Set meter value sample interval
  sendCall(identity, 'ChangeConfiguration', {
    key: 'MeterValueSampleInterval',
    value: '60'
  }).catch(err => console.error('[OCPP] ChangeConfiguration failed:', err.message));

  console.log('[OCPP] BootNotification accepted for ' + identity);
}

// ── Heartbeat ──
function handleHeartbeat(identity, uniqueId, ws) {
  ws.send(JSON.stringify([3, uniqueId, { currentTime: new Date().toISOString() }]));
}

// ── StatusNotification ──
async function handleStatusNotification(identity, uniqueId, payload, ws, cp) {
  const ocppStatus = payload.status;
  const conn = connectedChargers.get(identity);
  if (conn) conn.connectorStatus = ocppStatus;

  const statusMap = {
    'Available': 'available',
    'Preparing': 'occupied',
    'Charging': 'occupied',
    'SuspendedEV': 'occupied',
    'SuspendedEVSE': 'occupied',
    'Finishing': 'occupied',
    'Faulted': 'faulted',
    'Unavailable': 'offline'
  };
  const evfloStatus = statusMap[ocppStatus] || 'offline';

  // Only update DB status when no active session is managing it
  if (ocppStatus === 'Available' || ocppStatus === 'Faulted' || ocppStatus === 'Unavailable') {
    await supabase.from('charge_points').update({ status: evfloStatus }).eq('id', cp.id);
    console.log('[OCPP] ' + identity + ' status → ' + evfloStatus);
  }

  ws.send(JSON.stringify([3, uniqueId, {}]));
}

// ── MeterValues ──
async function handleMeterValues(identity, uniqueId, payload, ws) {
  let kwhTotal = null;
  let watts = null;

  if (payload.meterValue && Array.isArray(payload.meterValue)) {
    for (const mv of payload.meterValue) {
      if (mv.sampledValue && Array.isArray(mv.sampledValue)) {
        for (const sv of mv.sampledValue) {
          const measurand = sv.measurand || 'Energy.Active.Import.Register';
          const value = parseFloat(sv.value);
          if (measurand === 'Energy.Active.Import.Register') {
            const unit = (sv.unit || 'Wh').toLowerCase();
            kwhTotal = unit === 'kwh' ? value : value / 1000;
          } else if (measurand === 'Power.Active.Import') {
            watts = value;
          }
        }
      }
    }
  }

  // Find session by OCPP transactionId or by charge point
  const ocppTxnId = payload.transactionId;
  let sessionId = null;

  if (ocppTxnId != null) {
    sessionId = ocppTransactionMap.get(ocppTxnId) || null;
  }

  if (!sessionId) {
    const conn = connectedChargers.get(identity);
    if (conn) {
      const { data: session } = await supabase.from('sessions')
        .select('id').eq('charge_point_id', conn.chargePointDbId).eq('status', 'active').single();
      if (session) sessionId = session.id;
    }
  }

  if (sessionId && kwhTotal !== null) {
    const { error: iErr } = await supabase.from('session_telemetry').insert({
      session_id: sessionId,
      kwh_total: kwhTotal,
      watts: watts || 0,
      recorded_at: new Date().toISOString()
    });
    if (iErr) console.error('[OCPP] Telemetry insert error:', iErr.message);
    else console.log('[OCPP] Telemetry: ' + kwhTotal.toFixed(4) + ' kWh, ' + (watts || 0) + 'W — session ' + sessionId);
  }

  ws.send(JSON.stringify([3, uniqueId, {}]));
}

// ── StartTransaction ──
async function handleStartTransaction(identity, uniqueId, payload, ws, cp) {
  const meterStartWh = payload.meterStart || 0;
  const meterStartKwh = meterStartWh / 1000;

  const { data: session } = await supabase.from('sessions')
    .select('id').eq('charge_point_id', cp.id).eq('status', 'active').single();

  const ocppTxnId = Date.now();

  if (session) {
    ocppTransactionMap.set(ocppTxnId, session.id);
    sessionTransactionMap.set(session.id, ocppTxnId);
    await supabase.from('sessions').update({ start_kwh_reading: meterStartKwh }).eq('id', session.id);
    console.log('[OCPP] StartTransaction confirmed — session ' + session.id + ' — meterStart: ' + meterStartKwh.toFixed(4) + ' kWh — txnId: ' + ocppTxnId);
  } else {
    console.log('[OCPP] StartTransaction from ' + identity + ' but no active session found');
  }

  ws.send(JSON.stringify([3, uniqueId, {
    transactionId: ocppTxnId,
    idTagInfo: { status: 'Accepted' }
  }]));
}

// ── StopTransaction ──
async function handleStopTransaction(identity, uniqueId, payload, ws) {
  const ocppTxnId = payload.transactionId;
  const meterStopWh = payload.meterStop || 0;
  const meterStopKwh = meterStopWh / 1000;
  const reason = payload.reason || 'Local';

  const sessionId = ocppTransactionMap.get(ocppTxnId) || null;

  if (sessionId) {
    await supabase.from('session_telemetry').insert({
      session_id: sessionId,
      kwh_total: meterStopKwh,
      watts: 0,
      recorded_at: new Date().toISOString()
    });
    console.log('[OCPP] StopTransaction — session ' + sessionId + ' — meterStop: ' + meterStopKwh.toFixed(4) + ' kWh — reason: ' + reason);
    ocppTransactionMap.delete(ocppTxnId);
    sessionTransactionMap.delete(sessionId);
  } else {
    console.log('[OCPP] StopTransaction for unknown txnId: ' + ocppTxnId);
  }

  ws.send(JSON.stringify([3, uniqueId, {
    idTagInfo: { status: 'Accepted' }
  }]));
}

// ─── Outbound CALL helpers (EVFLO → Charger) ────────────────────────────────

function sendCall(identity, action, payload) {
  return new Promise((resolve, reject) => {
    const conn = connectedChargers.get(identity);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      return reject(new Error('Charger ' + identity + ' not connected'));
    }

    callCounter++;
    const uniqueId = 'evflo-' + callCounter + '-' + Date.now();

    const timeoutHandle = setTimeout(() => {
      pendingCalls.delete(uniqueId);
      reject(new Error('OCPP call timeout: ' + action + ' to ' + identity));
    }, 30000);

    pendingCalls.set(uniqueId, { resolve, reject, timeout: timeoutHandle });

    const message = [2, uniqueId, action, payload];
    conn.ws.send(JSON.stringify(message));
    console.log('[OCPP] ' + identity + ' ← ' + action);
  });
}

function handleCallResult(identity, message) {
  const [, uniqueId, payload] = message;
  const pending = pendingCalls.get(uniqueId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingCalls.delete(uniqueId);
    pending.resolve(payload);
  }
}

function handleCallError(identity, message) {
  const [, uniqueId, errorCode, errorDescription] = message;
  const pending = pendingCalls.get(uniqueId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingCalls.delete(uniqueId);
    pending.reject(new Error('OCPP error ' + errorCode + ': ' + errorDescription));
  }
}

// ─── Exported functions for command router ───────────────────────────────────

async function sendRemoteStart(ocppIdentity, idTag) {
  const result = await sendCall(ocppIdentity, 'RemoteStartTransaction', {
    connectorId: 1,
    idTag: idTag || 'EVFLO'
  });
  console.log('[OCPP] RemoteStartTransaction result:', JSON.stringify(result));
  if (result.status !== 'Accepted') {
    throw new Error('Charger rejected RemoteStartTransaction: ' + result.status);
  }
  return result;
}

async function sendRemoteStop(ocppIdentity, sessionId) {
  const ocppTxnId = sessionTransactionMap.get(sessionId);
  if (!ocppTxnId) {
    throw new Error('No OCPP transactionId found for session ' + sessionId);
  }
  const result = await sendCall(ocppIdentity, 'RemoteStopTransaction', {
    transactionId: ocppTxnId
  });
  console.log('[OCPP] RemoteStopTransaction result:', JSON.stringify(result));
  if (result.status !== 'Accepted') {
    throw new Error('Charger rejected RemoteStopTransaction: ' + result.status);
  }
  return result;
}

function isChargerConnected(ocppIdentity) {
  const conn = connectedChargers.get(ocppIdentity);
  return !!(conn && conn.ws.readyState === WebSocket.OPEN);
}

function getConnectedChargers() {
  const result = {};
  connectedChargers.forEach((conn, identity) => {
    result[identity] = {
      chargePointDbId: conn.chargePointDbId,
      deviceId: conn.deviceId,
      connectorStatus: conn.connectorStatus,
      lastSeen: conn.lastSeen
    };
  });
  return result;
}

module.exports = {
  wss,
  sendRemoteStart,
  sendRemoteStop,
  isChargerConnected,
  getConnectedChargers
};
