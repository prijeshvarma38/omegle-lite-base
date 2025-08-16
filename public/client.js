const socket = io();

const $btnStart = document.getElementById("btnStart");
const $btnNext  = document.getElementById("btnNext");
const $btnLeave = document.getElementById("btnLeave");
const $status   = document.getElementById("status");
const $messages = document.getElementById("messages");
const $input    = document.getElementById("input");
const $send     = document.getElementById("send");
const $nickname = document.getElementById("nickname");
const $btnSetName = document.getElementById("btnSetName");
const $typingStatus = document.getElementById("typingStatus");
const $btnAddFriend = document.getElementById("btnAddFriend");
const $friendsList = document.getElementById("friendsList");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const btnStartVideo = document.getElementById("btnStartVideo");

let nickname = "Guest";
let paired = false;
let pairedUserID = null;
let localStream;
let pc;

// Buttons
$btnSetName.addEventListener("click", () => { nickname = $nickname.value||"Guest"; socket.emit("setNickname", nickname); });
$btnStart.onclick = () => { $status.textContent="Searching…"; socket.emit("find"); };
$btnNext.onclick  = () => { $status.textContent="Searching…"; socket.emit("next"); };
$btnLeave.onclick = () => { socket.emit("leave"); $status.textContent="Left chat."; paired=false; };

// Send message
function sendMessage() {
  const text = ($input.value||"").trim();
  if (!text || !paired) return;
  socket.emit("message", text);
  addMsg("You", text);
  $input.value = "";
}
$send.onclick = sendMessage;
$input.addEventListener("keydown", e => { if(e.key==="Enter") sendMessage(); });
$input.addEventListener("input", () => { if(paired) socket.emit("typing"); });

// Add message
function addMsg(who, text){
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<span class="who">${who}:</span> ${text}`;
  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
}

// Friends System
$btnAddFriend.addEventListener("click", () => {
  if (!paired || !pairedUserID) return alert("No one to add!");
  socket.emit("addFriend", pairedUserID);
});

function loadFriends(){ socket.emit("getFriends"); }
socket.on("friendAdded", name => alert(`Added ${name} as a friend!`));
socket.on("friendsList", friends => {
  $friendsList.innerHTML="";
  friends.forEach(f=>{
    const li=document.createElement("li");
    li.textContent=f.nickname;
    li.onclick=()=>{ pairedUserID=f.id; paired=true; $status.textContent=`Chatting with ${f.nickname}`; };
    $friendsList.appendChild(li);
  });
});
loadFriends();

// WebRTC Video Chat
const configuration = { iceServers:[{urls:"stun:stun.l.google.com:19302"}] };
btnStartVideo.onclick = async ()=>{
  if(!paired || !pairedUserID) return alert("Connect first!");
  localStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  localVideo.srcObject = localStream;
  pc = new RTCPeerConnection(configuration);
  localStream.getTracks().forEach(track=>pc.addTrack(track, localStream));
  pc.ontrack = e=>{ remoteVideo.srcObject=e.streams[0]; };
  pc.onicecandidate = e=>{ if(e.candidate) socket.emit("ice-candidate",{to:pairedUserID,candidate:e.candidate}); };
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  socket.emit("offer",{to:pairedUserID,sdp:offer});
};

socket.on("offer", async data=>{
  if(!paired || data.from!==pairedUserID) return;
  pc=new RTCPeerConnection(configuration);
  pc.ontrack=e=>{ remoteVideo.srcObject=e.streams[0]; };
  pc.onicecandidate=e=>{ if(e.candidate) socket.emit("ice-candidate",{to:data.from,candidate:e.candidate}); };
  localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
  await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
  socket.emit("answer",{to:data.from,sdp:answer});
});

socket.on("answer", async data=>{ await pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); });
socket.on("ice-candidate", async data=>{ if(pc && data.candidate) await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); });

// Chat events
socket.on("queued", ()=>{ $status.textContent="Waiting…"; });
socket.on("paired", peerID=>{ paired=true; pairedUserID=peerID; $status.textContent="Connected!"; addMsg("System","Connected to a stranger."); });
socket.on("peer_left", ()=>{ paired=false; $status.textContent="Partner left."; addMsg("System","Stranger left."); pairedUserID=null; });
socket.on("message", msg=>{ const sender=msg.from===socket.id?"You":msg.nickname||"Stranger"; addMsg(sender,msg.text); });
socket.on("showTyping", user=>{ $typingStatus.innerText=`${user} is typing...`; setTimeout(()=>{$typingStatus.innerText="";},2000); });
