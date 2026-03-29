/**
 * WebSocket للدردشة الجماعية — بث فوري لرسائل الغرفة (مثل تطبيقات الدردشة الحديثة).
 * المسار: /group-chat-ws?token=JWT
 */
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

let wss = null;

function initGroupChatWebSocket(server) {
  wss = new WebSocket.Server({ server, path: "/group-chat-ws" });

  wss.on("connection", (ws, req) => {
    let token = null;
    try {
      const host = req.headers.host || "localhost";
      const url = new URL(req.url || "/", `http://${host}`);
      token = url.searchParams.get("token");
    } catch {
      ws.close(4400, "bad request");
      return;
    }
    if (!token) {
      ws.close(4401, "no token");
      return;
    }
    try {
      jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(4401, "invalid token");
      return;
    }

    ws.send(JSON.stringify({ type: "ready" }));
    ws.on("error", () => {});
  });
}

/**
 * @param {object} payload — { type: 'new_message', message } | { type: 'new_messages', messages } | { type: 'message_deleted', id }
 */
function broadcastGroupChat(payload) {
  if (!wss) return;
  const raw = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(raw);
      } catch (_) {}
    }
  });
}

module.exports = { initGroupChatWebSocket, broadcastGroupChat };
