const socket = io();

const $btnStart = document.getElementById("btnStart");
const $btnNext  = document.getElementById("btnNext");
const $btnLeave = document.getElementById("btnLeave");
const $status   = document.getElementById("status");

const $messages = document.getElementById("messages");
const $input    = document.getElementById("input");
const $send     = document.getElementById("send");

let paired = false;

function addMsg(who, text) {
  const div = document.createElement("div");
  div.className = "msg";
  const w = document.createElement("span");
  w.className = "who";
  w.textContent = who + ":";
  const t = document.createElement("span");
  t.textContent = " " + text;
  div.appendChild(w);
  div.appendChild(t);
  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
}

function setStatus(text) {
  $status.textContent = text || "";
}

$btnStart.onclick = () => {
  setStatus("Searching for a partner…");
  socket.emit("find");
};

$btnNext.onclick = () => {
  setStatus("Searching for a partner…");
  socket.emit("next");
};

$btnLeave.onclick = () => {
  socket.emit("leave");
  setStatus("Left chat.");
  paired = false;
};

$send.onclick = sendMessage;
$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = ($input.value || "").trim();
  if (!text) return;
  if (!paired) {
    addMsg("System", "You are not connected. Press Start.");
    return;
  }
  socket.emit("message", text);
  addMsg("You", text);
  $input.value = "";
}

socket.on("queued", () => {
  setStatus("Waiting for someone to join…");
});

socket.on("paired", () => {
  paired = true;
  setStatus("Connected! Say hi 👋");
  addMsg("System", "Connected to a stranger.");
});

socket.on("peer_left", () => {
  paired = false;
  setStatus("Partner left. Press Next or Start.");
  addMsg("System", "Stranger left the chat.");
});

socket.on("message", (msg) => {
  // If it's our own echo, we already printed "You". Only show messages from the peer.
  // The simplest check is: if we’re paired, treat incoming as “Stranger”.
  addMsg("Stranger", msg.text);
});
