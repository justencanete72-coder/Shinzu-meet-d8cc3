/* ============================================================
   SHINZU MEET – Frontend Logic (Camera Fix Update)
   ============================================================ */

const landingScreen = document.getElementById('landingScreen');
const searchingScreen = document.getElementById('searchingScreen');
const callScreen = document.getElementById('callScreen');

const displayNameInput = document.getElementById('displayName');
const randomMatchBtn = document.getElementById('randomMatchBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const landingError = document.getElementById('landingError');
const cancelSearchBtn = document.getElementById('cancelSearchBtn');

const videoGrid = document.getElementById('videoGrid');
const roomLabel = document.getElementById('roomLabel');
const participantCount = document.getElementById('participantCount');
const chatPanel = document.getElementById('chatPanel');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const toggleChatBtn = document.getElementById('toggleChatBtn');
const closeChatBtn = document.getElementById('closeChatBtn');
const copyRoomLinkBtn = document.getElementById('copyRoomLinkBtn');

const micToggleBtn = document.getElementById('micToggleBtn');
const camToggleBtn = document.getElementById('camToggleBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const leaveBtn = document.getElementById('leaveBtn');

const privacyLink = document.getElementById('privacyLink');
const privacyModal = document.getElementById('privacyModal');
const closePrivacyBtn = document.getElementById('closePrivacyBtn');

let room = null;
let localParticipant = null;
let currentFacingMode = 'user'; 
let micEnabled = true;
let camEnabled = true;

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

function showError(msg) {
  landingError.textContent = msg;
  landingError.classList.remove('hidden');
  setTimeout(() => landingError.classList.add('hidden'), 5000);
}

async function fetchToken(roomName, participantName) {
  const res = await fetch('/.netlify/functions/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, participantName })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get token');
  }
  return res.json(); 
}

async function connectToRoom(roomName, participantName) {
  try {
    showScreen(searchingScreen);
    const { token, url } = await fetchToken(roomName, participantName);

    room = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true, 
    });

    room.on(LivekitClient.RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(LivekitClient.RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(LivekitClient.RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
    room.on(LivekitClient.RoomEvent.Disconnected, cleanupAndReturnHome);
    room.on(LivekitClient.RoomEvent.DataReceived, onDataReceived);

    await room.connect(url, token);
    localParticipant = room.localParticipant;
    
    // Dito natin bubuksan ang camera at mic (mag-trigger ng browser prompt)
    await localParticipant.enableCameraAndMicrophone();

    showScreen(callScreen);
    roomLabel.textContent = roomName;
    
    // I-render agad
    renderAllParticipants();

  } catch (err) {
    console.error('Connection error:', err);
    showScreen(landingScreen);
    showError(err.message || 'Could not connect. Check your camera/mic permissions.');
  }
}

function renderAllParticipants() {
  if (!room) return;
  videoGrid.innerHTML = '';
  addParticipantTile(localParticipant, true);
  room.remoteParticipants.forEach(p => addParticipantTile(p, false));
  updateParticipantCount();
}

function addParticipantTile(participant, isLocal) {
  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.dataset.identity = participant.identity;

  const videoEl = document.createElement('video');
  videoEl.autoplay = true;
  videoEl.playsInline = true; 
  videoEl.muted = isLocal; // I-mute ang sarili para walang echo

  const overlay = document.createElement('div');
  overlay.className = 'tile-overlay';
  const nameEl = document.createElement('span');
  nameEl.className = 'tile-name';
  nameEl.textContent = participant.name || participant.identity;
  const iconsEl = document.createElement('div');
  iconsEl.className = 'tile-icons';
  overlay.appendChild(nameEl);
  overlay.appendChild(iconsEl);

  tile.appendChild(videoEl);
  tile.appendChild(overlay);
  videoGrid.appendChild(tile);

  const videoPub = participant.getTrackPublication(LivekitClient.Track.Source.Camera);
  if (videoPub?.videoTrack) {
    videoPub.videoTrack.attach(videoEl);
    videoEl.play().catch(e => console.log("Auto-play blocked:", e)); // <--- FIX: Pilitin mag-play
  } else {
    showAvatarFallback(tile, participant);
  }

  updateTileMicIcon(tile, participant);

  participant.on('trackPublished', () => {
    const pub = participant.getTrackPublication(LivekitClient.Track.Source.Camera);
    if (pub?.videoTrack) {
      pub.videoTrack.attach(videoEl);
      videoEl.play().catch(e => console.log("Auto-play blocked:", e)); // <--- FIX
      removeAvatarFallback(tile);
    }
  });
  participant.on('trackUnpublished', () => showAvatarFallback(tile, participant));
  participant.on('trackMuted', () => updateTileMicIcon(tile, participant));
  participant.on('trackUnmuted', () => updateTileMicIcon(tile, participant));
}

function showAvatarFallback(tile, participant) {
  if (tile.querySelector('.avatar-fallback')) return;
  const fallback = document.createElement('div');
  fallback.className = 'avatar-fallback';
  fallback.textContent = (participant.name || '?')[0].toUpperCase();
  const video = tile.querySelector('video');
  if (video) video.style.display = 'none';
  tile.appendChild(fallback);
}

function removeAvatarFallback(tile) {
  const fallback = tile.querySelector('.avatar-fallback');
  if (fallback) fallback.remove();
  const video = tile.querySelector('video');
  if (video) video.style.display = 'block';
}

function updateTileMicIcon(tile, participant) {
  const iconsEl = tile.querySelector('.tile-icons');
  if (!iconsEl) return;
  const micPub = participant.getTrackPublication(LivekitClient.Track.Source.Microphone);
  iconsEl.innerHTML = (micPub?.isMuted) ? '<span class="muted-icon">🔇</span>' : '';
}

function updateParticipantCount() {
  if (!room) return;
  const total = 1 + room.remoteParticipants.size;
  participantCount.textContent = `${total} / 10`;
  videoGrid.dataset.count = total;
}

function onParticipantConnected(participant) {
  addParticipantTile(participant, false);
  updateParticipantCount();
}

function onParticipantDisconnected(participant) {
  const tile = videoGrid.querySelector(`[data-identity="${participant.identity}"]`);
  if (tile) tile.remove();
  updateParticipantCount();
}

function onTrackSubscribed(track, pub, participant) {
  const tile = videoGrid.querySelector(`[data-identity="${participant.identity}"]`);
  if (!tile) return;
  if (track.kind === 'video') {
    const videoEl = tile.querySelector('video');
    track.attach(videoEl);
    videoEl.play().catch(e => console.log("Auto-play blocked:", e)); // <--- FIX
    removeAvatarFallback(tile);
  }
  if (track.kind === 'audio') {
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    track.attach(audioEl);
  }
}

function onTrackUnsubscribed(track) {
  track.detach();
}

function onActiveSpeakersChanged(speakers) {
  document.querySelectorAll('.video-tile').forEach(t => t.classList.remove('speaking'));
  speakers.forEach(s => {
    const tile = videoGrid.querySelector(`[data-identity="${s.identity}"]`);
    if (tile) tile.classList.add('speaking');
  });
}

function onDataReceived(payload, participant) {
  const msg = new TextDecoder().decode(payload);
  appendChatMessage(participant?.name || 'Unknown', msg);
}

function appendChatMessage(author, text) {
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  msgEl.innerHTML = `
    <span class="msg-author">${escapeHtml(author)}</span>
    <span class="msg-time">${time}</span>
    <div class="msg-text">${escapeHtml(text)}</div>
  `;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !room) return;
  const encoder = new TextEncoder();
  await room.localParticipant.publishData(encoder.encode(text), { reliable: true });
  appendChatMessage(localParticipant.name || 'You', text);
  chatInput.value = '';
});

micToggleBtn.addEventListener('click', async () => {
  if (!localParticipant) return;
  micEnabled = !micEnabled;
  await localParticipant.setMicrophoneEnabled(micEnabled);
  micToggleBtn.classList.toggle('active', !micEnabled);
  micToggleBtn.textContent = micEnabled ? '🎤' : '🔇';
});

camToggleBtn.addEventListener('click', async () => {
  if (!localParticipant) return;
  camEnabled = !camEnabled;
  await localParticipant.setCameraEnabled(camEnabled);
  camToggleBtn.classList.toggle('active', !camEnabled);
  camToggleBtn.textContent = camEnabled ? '📷' : '📷❌';
});

switchCameraBtn.addEventListener('click', async () => {
  if (!localParticipant) return;
  try {
    const pub = localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera);
    if (!pub?.videoTrack) return;
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await pub.videoTrack.restartTrack({ facingMode: currentFacingMode });
  } catch (err) {
    console.warn('Camera switch not supported:', err);
  }
});

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
});

leaveBtn.addEventListener('click', cleanupAndReturnHome);

function cleanupAndReturnHome() {
  if (room) {
    room.localParticipant?.unpublishAll?.();
    room.disconnect();
    room = null;
  }
  localParticipant = null;
  videoGrid.innerHTML = '';
  chatMessages.innerHTML = '';
  chatPanel.classList.add('hidden');
  showScreen(landingScreen);
}

toggleChatBtn.addEventListener('click', () => chatPanel.classList.toggle('hidden'));
closeChatBtn.addEventListener('click', () => chatPanel.classList.add('hidden'));

copyRoomLinkBtn.addEventListener('click', () => {
  const link = `${location.origin}?room=${roomLabel.textContent}`;
  navigator.clipboard.writeText(link).then(() => {
    copyRoomLinkBtn.textContent = '✅';
    setTimeout(() => copyRoomLinkBtn.textContent = '🔗', 2000);
  }).catch(() => prompt('Copy this link:', link));
});

randomMatchBtn.addEventListener('click', async () => {
  const name = displayNameInput.value.trim();
  if (!name) return showError('Please enter your name first.');

  showScreen(searchingScreen);

  try {
    const res = await fetch('/.netlify/functions/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'randomMatch', participantName: name })
    });
    if (!res.ok) throw new Error('Matching failed');
    const { roomName } = await res.json();
    await connectToRoom(roomName, name);
  } catch (err) {
    showScreen(landingScreen);
    showError('Could not find a match. Try again.');
  }
});

createRoomBtn.addEventListener('click', () => {
  const name = displayNameInput.value.trim();
  if (!name) return showError('Please enter your name first.');
  const roomCode = crypto.randomUUID().slice(0, 8).toUpperCase();
  roomCodeInput.value = roomCode;
  connectToRoom(roomCode, name);
});

joinRoomBtn.addEventListener('click', () => {
  const name = displayNameInput.value.trim();
  const code = roomCodeInput.value.trim();
  if (!name) return showError('Please enter your name first.');
  if (!code) return showError('Please enter a room code.');
  connectToRoom(code, name);
});

cancelSearchBtn.addEventListener('click', () => showScreen(landingScreen));

privacyLink.addEventListener('click', (e) => {
  e.preventDefault();
  privacyModal.classList.remove('hidden');
});
closePrivacyBtn.addEventListener('click', () => privacyModal.classList.add('hidden'));

window.addEventListener('beforeunload', () => {
  if (room) {
    room.localParticipant?.unpublishAll?.();
    room.disconnect();
  }
}); = new TextEncoder();
  await room.localParticipant.publishData(encoder.encode(text), { reliable: true });
  appendChatMessage(localParticipant.name || 'You', text);
  chatInput.value = '';
});

// ============================================================
// 7. CONTROLS
// ============================================================
micToggleBtn.addEventListener('click', async () => {
  if (!localParticipant) return;
  micEnabled = !micEnabled;
  await localParticipant.setMicrophoneEnabled(micEnabled);
  micToggleBtn.classList.toggle('active', !micEnabled);
  micToggleBtn.textContent = micEnabled ? '🎤' : '🔇';
});

camToggleBtn.addEventListener('click', async () => {
  if (!localParticipant) return;
  camEnabled = !camEnabled;
  await localParticipant.setCameraEnabled(camEnabled);
  camToggleBtn.classList.toggle('active', !camEnabled);
  camToggleBtn.textContent = camEnabled ? '📷' : '📷❌';
});

switchCameraBtn.addEventListener('click', async () => {
  if (!localParticipant) return;
  try {
    const pub = localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera);
    if (!pub?.videoTrack) return;
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await pub.videoTrack.restartTrack({ facingMode: currentFacingMode });
  } catch (err) {
    console.warn('Camera switch not supported:', err);
  }
});

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
});

leaveBtn.addEventListener('click', cleanupAndReturnHome);

function cleanupAndReturnHome() {
  if (room) {
    room.localParticipant?.unpublishAll?.();
    room.disconnect();
    room = null;
  }
  localParticipant = null;
  videoGrid.innerHTML = '';
  chatMessages.innerHTML = '';
  chatPanel.classList.add('hidden');
  showScreen(landingScreen);
}

// ============================================================
// 8. UI TOGGLES
// ============================================================
toggleChatBtn.addEventListener('click', () => chatPanel.classList.toggle('hidden'));
closeChatBtn.addEventListener('click', () => chatPanel.classList.add('hidden'));

copyRoomLinkBtn.addEventListener('click', () => {
  const link = `${location.origin}?room=${roomLabel.textContent}`;
  navigator.clipboard.writeText(link).then(() => {
    copyRoomLinkBtn.textContent = '✅';
    setTimeout(() => copyRoomLinkBtn.textContent = '🔗', 2000);
  }).catch(() => prompt('Copy this link:', link));
});

// ============================================================
// 9. LANDING ACTIONS
// ============================================================
randomMatchBtn.addEventListener('click', async () => {
  const name = displayNameInput.value.trim();
  if (!name) return showError('Please enter your name first.');

  showScreen(searchingScreen);

  try {
    const res = await fetch('/.netlify/functions/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'randomMatch', participantName: name })
    });
    if (!res.ok) throw new Error('Matching failed');
    const { roomName } = await res.json();
    await connectToRoom(roomName, name);
  } catch (err) {
    showScreen(landingScreen);
    showError('Could not find a match. Try again.');
  }
});

createRoomBtn.addEventListener('click', () => {
  const name = displayNameInput.value.trim();
  if (!name) return showError('Please enter your name first.');
  const roomCode = crypto.randomUUID().slice(0, 8).toUpperCase();
  roomCodeInput.value = roomCode;
  connectToRoom(roomCode, name);
});

joinRoomBtn.addEventListener('click', () => {
  const name = displayNameInput.value.trim();
  const code = roomCodeInput.value.trim();
  if (!name) return showError('Please enter your name first.');
  if (!code) return showError('Please enter a room code.');
  connectToRoom(code, name);
});

cancelSearchBtn.addEventListener('click', () => showScreen(landingScreen));

// ============================================================
// 10. MODALS & UNLOAD
// ============================================================
privacyLink.addEventListener('click', (e) => {
  e.preventDefault();
  privacyModal.classList.remove('hidden');
});
closePrivacyBtn.addEventListener('click', () => privacyModal.classList.add('hidden'));

window.addEventListener('beforeunload', () => {
  if (room) {
    room.localParticipant?.unpublishAll?.();
    room.disconnect();
  }
});
