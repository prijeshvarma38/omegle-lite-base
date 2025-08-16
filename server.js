const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.send("Omegle Lite server is running!"));

// In-memory storage for users and friends
const users = new Map(); // key = socket.id, value = {nickname, friends: []}

const waiting = new Set();    
const roomOf = new Map();     

function inRoom(sock) { return roomOf.has(sock.id); }

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
  a.emit("paired", b.id);
  b.emit("paired", a.id);
}

function tryMatch(sock) {
  for (const other of waiting) {
    waiting.delete(other);
    if (other.connected && !inRoom(other) && other.id !== sock.id) {
      pair(sock, other);
      return;
    }
  }
  waiting.add(sock);
  sock.emit("queued");
}

io.on("connection", (socket) => {
  // Save user in memory
  users.set(socket.id, { nickname: "Guest", friends: [] });

  // Set nickname
  socket.on("setNickname", (name) => {
    const user = users.get(socket.id);
    user.nickname = name || "Guest";
  });

  // Add friend
  socket.on("addFriend", (friendID) => {
    const user = users.get(socket.id);
    const friend = users.get(friendID);
    if (!friend) return;
    if (!user.friends.includes(friendID)) user.friends.push(friendID);
    socket.emit("friendAdded", friend.nickname);
  });

  // Get friends list
  socket.on("getFriends", () => {
    const user = users.get(socket.id);
    const friendList = user.friends.map(id => {
      const f = users.get(id);
      return { id, nickname: f ? f.nickname : "Unknown" };
    });
    socket.emit("friendsList", friendList);
  });

  // WebRTC signaling
  socket.on("offer", (data) => { socket.to(data.to).emit("offer", { sdp: data.sdp, from: socket.id }); });
  socket.on("answer", (data) => { socket.to(data.to).emit("answer", { sdp: data.sdp, from: socket.id }); });
  socket.on("ice-candidate", (data) => { socket.to(data.to).emit("ice-candidate", data); });

  // Chat logic
  socket.on("find", () => { if (!inRoom(socket)) tryMatch(socket); });
  socket.on("message", (text) => {
    const roomId = roomOf.get(socket.id);
    if (!roomId) return;
    const msg = {
      text: String(text || "").slice(0, 2000),
      ts: Date.now(),
      from: socket.id,
      nickname: users.get(socket.id).nickname
    };
    io.to(roomId).emit("message", msg);
  });
  socket.on("typing", () => {
    const roomId = roomOf.get(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit("showTyping", users.get(socket.id).nickname);
  });
  socket.on("leave", () => { if (waiting.has(socket)) waiting.delete(socket); leaveRoom(socket, true); });
  socket.on("next", () => { if (waiting.has(socket)) waiting.delete(socket); leaveRoom(socket, true); tryMatch(socket); });

  socket.on("disconnect", () => { if (waiting.has(socket)) waiting.delete(socket); leaveRoom(socket, true); users.delete(socket.id); });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
