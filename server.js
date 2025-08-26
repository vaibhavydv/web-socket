const fs = require("fs");
const https = require("https");
const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const app = express();

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(__dirname, "key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "cert.pem")),
  },
  app
);

const wss = new WebSocket.Server({ server });

let items = [];

// Utility: send JSON safely
const sendJSON = (ws, obj) => {
  try {
    ws.send(JSON.stringify(obj));
  } catch (err) {
    console.error("❌ Failed to send:", err.message);
  }
};

wss.on("connection", (ws, req) => {
  console.log(`✅ Client connected from ${req.socket.remoteAddress}`);

  // 📡 Start periodic messages every 5 seconds
  const interval = setInterval(() => {
    sendJSON(ws, {
      status: "info",
      message: "Heartbeat / periodic update",
      timestamp: new Date().toISOString(),
      items,
    });
  }, 5000);

  ws.on("message", (message) => {
    console.log("📩 Received:", message.toString());

    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return sendJSON(ws, { status: "error", message: "Invalid JSON" });
    }

    let response;

    switch (data.action) {
      case "CREATE":
        if (!data.payload?.id) {
          response = { status: "error", message: "Payload must include id" };
        } else {
          items.push(data.payload);
          response = { status: "success", message: "Item created", items };
        }
        break;

      case "READ":
        response = { status: "success", items };
        break;

      case "UPDATE":
        if (!data.payload?.id) {
          response = { status: "error", message: "Payload must include id" };
        } else {
          let updated = false;
          items = items.map((item) => {
            if (item.id === data.payload.id) {
              updated = true;
              return { ...item, ...data.payload };
            }
            return item;
          });
          response = updated
            ? { status: "success", message: "Item updated", items }
            : { status: "error", message: "Item not found" };
        }
        break;

      case "DELETE":
        if (!data.payload?.id) {
          response = { status: "error", message: "Payload must include id" };
        } else {
          const prevLength = items.length;
          items = items.filter((item) => item.id !== data.payload.id);
          response =
            items.length < prevLength
              ? { status: "success", message: "Item deleted", items }
              : { status: "error", message: "Item not found" };
        }
        break;

      default:
        response = { status: "error", message: `Unknown action: ${data.action}` };
    }

    sendJSON(ws, response);
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
    clearInterval(interval); // 🔥 stop sending updates when client disconnects
  });
});

// ✅ Start server
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`🚀 WSS CRUD API running at wss://localhost:${PORT}`);
});
