const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 9000 });
console.log('[OCPP] WebSocket server listening on ws://localhost:9000');

wss.on('connection', (ws, req) => {
  const chargePointId = req.url.replace('/', '');
  console.log(`[OCPP] Charge point connected: ${chargePointId}`);

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (e) {
      console.error('[OCPP] Invalid JSON received');
      return;
    }

    const [messageTypeId, uniqueId, action, payload] = message;

    // Only handle CALL messages (type 2)
    if (messageTypeId !== 2) return;

    console.log(`[OCPP] ${chargePointId} -> ${action}`, payload);

    switch (action) {
      case 'BootNotification':
        ws.send(JSON.stringify([
          3, // CALLRESULT
          uniqueId,
          {
            status: 'Accepted',
            currentTime: new Date().toISOString(),
            interval: 30
          }
        ]));
        console.log(`[OCPP] BootNotification accepted for ${chargePointId}`);
        break;

      case 'Heartbeat':
        ws.send(JSON.stringify([
          3,
          uniqueId,
          { currentTime: new Date().toISOString() }
        ]));
        console.log(`[OCPP] Heartbeat responded for ${chargePointId}`);
        break;

      default:
        console.log(`[OCPP] Unhandled action: ${action}`);
        // Send a generic error response so the client doesn't hang
        ws.send(JSON.stringify([
          4, // CALLERROR
          uniqueId,
          'NotImplemented',
          `Action ${action} not implemented`,
          {}
        ]));
    }
  });

  ws.on('close', () => {
    console.log(`[OCPP] Charge point disconnected: ${chargePointId}`);
  });

  ws.on('error', (err) => {
    console.error(`[OCPP] Error on ${chargePointId}:`, err.message);
  });
});

module.exports = wss;