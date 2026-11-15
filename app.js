const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbz1l_aMFoI6UyxQDz6i1mP2PuFLLXXbGOdgEoRGGhBOpCU3JcaiNm4oJkTvj9T6M2pjJg/exec';
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

const video = document.getElementById('video');
const statusEl = document.getElementById('status');
const aiBadge = document.getElementById('aiBadge');
const gpsBadge = document.getElementById('gpsBadge');
const camOverlay = document.getElementById('camOverlay');

let appConfig = null;
let registeredUsers = [];
let currentCoords = null;
let modelsReady = false;
let cameraReady = false;
let map = null;
let userMarker = null;

// Bind UI Events
document.getElementById('btnStartSensors').addEventListener('click', activateSensors);
document.getElementById('btnClockIn').addEventListener('click', () => handleAttendance('CLOCK IN'));
document.getElementById('btnClockOut').addEventListener('click', () => handleAttendance('CLOCK OUT'));
document.getElementById('btnRegister').addEventListener('click', handleRegister);

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const [_, initRes] = await Promise.all([
      Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]),
      fetch(`${GAS_API_URL}?action=init`).then(r => r.json())
    ]);

    modelsReady = true;
    aiBadge.innerText = 'AI Models: Ready';
    aiBadge.classList.add('ok');

    if (initRes.status === 'ok') {
      appConfig = initRes.config;
      document.getElementById('eventTitle').innerText = appConfig.eventName;
      document.getElementById('locationSubtitle').innerText =
        `${appConfig.locationName} • Radius: ${appConfig.allowedRadius}m (${appConfig.restrict ? 'Strict Geofence' : 'Unrestricted'})`;
      document.getElementById('versionInfo').innerText = `GeoAttend • API ${initRes.version}`;

      initMap(appConfig);

      registeredUsers = initRes.users.map(u => ({
        ...u,
        labeledDescriptor: new faceapi.LabeledFaceDescriptors(
          `${u.userId}|${u.name}`,
          [new Float32Array(u.descriptor)]
        )
      }));
    }

    statusEl.innerText = 'Tap "Activate Camera & GPS" above to start.';
    updateActionButtons();
  } catch (err) {
    statusEl.innerText = 'Initialization Error: ' + err.message;
  }
});

function initMap(cfg) {
  map = L.map('map').setView([cfg.latitude, cfg.longitude], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  L.marker([cfg.latitude, cfg.longitude])
    .addTo(map)
    .bindPopup(`<b>${cfg.locationName}</b><br>Allowed Radius: ${cfg.allowedRadius}m`);

  L.circle([cfg.latitude, cfg.longitude], {
    radius: cfg.allowedRadius,
    color: '#1a73e8',
    fillColor: '#1a73e8',
    fillOpacity: 0.15
  }).addTo(map);
}

async function activateSensors() {
  const btn = document.getElementById('btnStartSensors');
  btn.disabled = true;
  btn.innerText = 'Starting...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = stream;
    cameraReady = true;
    camOverlay.classList.add('hidden');
    updateActionButtons();
  } catch (err) {
    btn.disabled = false;
    btn.innerText = 'Retry Camera & GPS';
    statusEl.innerText = `Camera Error (${err.name}): ${err.message}`;
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      currentCoords = pos.coords;
      updateGpsStatus();
      updateActionButtons();
    },
    (err) => {
      gpsBadge.innerText = 'GPS: Denied';
      gpsBadge.classList.add('warn');
      statusEl.innerText = `GPS Error (${err.code}): ${err.message}`;
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function updateGpsStatus() {
  if (!currentCoords || !appConfig) return;

  const { latitude, longitude } = currentCoords;
  const dist = Math.round(
    calculateDistance(appConfig.latitude, appConfig.longitude, latitude, longitude)
  );
  const inside = dist <= appConfig.allowedRadius;

  gpsBadge.innerText = `Distance: ${dist}m (${inside ? 'In Zone' : 'Outside'})`;
  gpsBadge.className = 'badge ' + (inside || !appConfig.restrict ? 'ok' : 'warn');
  statusEl.innerText = 'Ready! Position your face clearly in the camera.';

  if (map) {
    if (!userMarker) {
      userMarker = L.circleMarker([latitude, longitude], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#d93025',
        fillOpacity: 1
      }).addTo(map).bindPopup('Your Position');
    } else {
      userMarker.setLatLng([latitude, longitude]);
    }
  }
}

function updateActionButtons() {
  const ready = modelsReady && cameraReady && currentCoords !== null;
  document.getElementById('btnClockIn').disabled = !ready;
  document.getElementById('btnClockOut').disabled = !ready;
  document.getElementById('btnRegister').disabled = !(modelsReady && cameraReady);
}

async function postToGAS(payload) {
  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function handleRegister() {
  const userId = document.getElementById('regId').value.trim();
  const name = document.getElementById('regName').value.trim();
  if (!userId || !name) return alert('Please enter both ID and Full Name.');

  setButtonsLocked(true);
  statusEl.innerText = 'Scanning face for registration...';

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      statusEl.innerText = 'No face detected. Ensure good lighting.';
      return setButtonsLocked(false);
    }

    const result = await postToGAS({
      action: 'register',
      userId,
      name,
      descriptor: Array.from(detection.descriptor)
    });

    if (result.success) {
      registeredUsers = registeredUsers.filter(u => u.userId !== userId);
      registeredUsers.push({
        userId,
        name,
        labeledDescriptor: new faceapi.LabeledFaceDescriptors(`${userId}|${name}`, [detection.descriptor])
      });
      document.getElementById('regId').value = '';
      document.getElementById('regName').value = '';
    }

    statusEl.innerText = result.message;
    alert(result.message);
  } catch (err) {
    statusEl.innerText = 'Registration Error: ' + err.message;
  } finally {
    setButtonsLocked(false);
  }
}

async function handleAttendance(type) {
  if (!currentCoords) return alert('Waiting for GPS signal...');
  if (registeredUsers.length === 0) return alert('No registered faces found.');

  setButtonsLocked(true);
  statusEl.innerText = 'Verifying facial identity...';

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      statusEl.innerText = 'Face not detected. Look straight at the camera.';
      return setButtonsLocked(false);
    }

    const faceMatcher = new faceapi.FaceMatcher(
      registeredUsers.map(u => u.labeledDescriptor),
      0.5
    );
    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label === 'unknown') {
      statusEl.innerText = 'Face not recognized. Please register first.';
      return setButtonsLocked(false);
    }

    const [userId, name] = bestMatch.label.split('|');
    const confidence = Math.round((1 - bestMatch.distance) * 100) + '%';

    statusEl.innerText = `Matched ${name} (${confidence}). Submitting ${type}...`;

    const result = await postToGAS({
      action: 'attendance',
      userId,
      name,
      type,
      lat: currentCoords.latitude,
      lon: currentCoords.longitude,
      confidence
    });

    statusEl.innerText = result.message;
    alert(result.message);
  } catch (err) {
    statusEl.innerText = 'Submission Error: ' + err.message;
  } finally {
    setButtonsLocked(false);
  }
}

function setButtonsLocked(locked) {
  if (locked) {
    document.getElementById('btnClockIn').disabled = true;
    document.getElementById('btnClockOut').disabled = true;
    document.getElementById('btnRegister').disabled = true;
  } else {
    updateActionButtons();
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}