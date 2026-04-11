
const WebSocket = require("ws");
const CHARGER_ID = "SIM-001";
const WS_URL = "ws://localhost:9000/" + CHARGER_ID;
console.log("[SIM] Connecting to", WS_URL);
const ws = new WebSocket(WS_URL, ["ocpp1.6"]);
let msgId = 1;
function send(action, payload) {
  const msg = JSON.stringify([2, String(msgId++), action, payload]);
  console.log("[SIM] >>>", msg);
  ws.send(msg);
}
ws.on("open", () => {
  console.log("[SIM] Connected");
  setTimeout(() => send("BootNotification", { chargePointVendor: "EVFLO", chargePointModel: "Simulator", chargePointSerialNumber: "SIM-001" }), 500);
});
ws.on("message", (data) => {
  console.log("[SIM] <<<", data.toString());
  const msg = JSON.parse(data);
  if (msg[0] === 3) {
    if (msg[2] && msg[2].status === "Accepted") {
      console.log("[SIM] Boot accepted - sending StatusNotification");
      send("StatusNotification", { connectorId: 1, status: "Available", errorCode: "NoError" });
      setInterval(() => send("Heartbeat", {}), 30000);
    }
  }
});
ws.on("error", (err) => console.error("[SIM] Error:", err.message));
ws.on("close", () => console.log("[SIM] Disconnected"));
process.on("SIGINT", () => { ws.close(); process.exit(); });
