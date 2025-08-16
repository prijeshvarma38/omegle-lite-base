const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

const waiting = new Set();    // sockets waiting to be paired
const roomOf = new Map();     // socket.id -> roomId

function inRoom(sock) {
  return roomOf.has(sock.id);
}

function leaveRoom(sock, notifyPeer = true) {
  const roomId = roomOf.get(sock.id);
  if (!roomId) return;
  if (notifyPeer) sock.to(roomId).emit("peer_left");
  sock.leave(roomId);
  roomOf.delete(sock.id);
}

function pair(a, b) {
  const roomId = `room-${a.id}-${b.id}`;
  a.join(roomId);
  b.join(roomId);
  roomOf.set(a.id, roomId);
  roomOf.set(b.id, roomId);
  a.emit("paired");
  b.emit("paired");
}

function tryMatch(sock) {
  // if someone is already waiting, pair immediately
  for (const other of waiting) {
    waiting.delete(other);
    if (other.connected && !inRoom(other) && other.id !== sock.id) {
      pair(sock, other);
      return;
    }
  }
  // otherwise, queue this socket
  waiting.add(sock);
  sock.emit("queued");
}

io.on("connection", (socket) => {
  // user clicks "Start" or "Next"
  socket.on("find", () => {
    if (inRoom(socket)) return;
    tryMatch(socket);
  });

  // send a message to current room
  socket.on("message", (text) => {
    const roomId = roomOf.get(socket.id);
    if (!roomId) return;
    const msg = String(text || "").slice(0, 2000);
    io.to(roomId).emit("message", { text: msg, ts: Date.now(), from: socket.id });
  });

  // leave current chat (but stay connected)
  socket.on("leave", () => {
    // remove from queue if queued
    if (waiting.has(socket)) waiting.delete(socket);
    leaveRoom(socket, true);
  });

  // "Next" = leave current chat and search again
  socket.on("next", () => {
    if (waiting.has(socket)) waiting.delete(socket);
    leaveRoom(socket, true);
    tryMatch(socket);
  });

  socket.on("disconnect", () => {
    if (waiting.has(socket)) waiting.delete(socket);
    leaveRoom(socket, true);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
app.get("/", (req, res) => {
  res.send("Omegle Lite server is running!");
});
