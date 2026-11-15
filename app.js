const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbz1l_aMFoI6UyxQDz6i1mP2PuFLLXXbGOdgEoRGGhBOpCU3JcaiNm4oJkTvj9T6M2pjJg/exec';
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

const video = document.getElementById('video');
const statusEl = document.getElementById('status');
const aiBadge = document.getElementById('aiBadge');
const gpsBadge = document.getElementById('gpsBadge');
const camOverlay = document.getElementById('camOverlay');
const faceGuide = document.getElementById('faceGuide');

let appConfig = null;
let registeredUsers = [];
let rawUsersCache = [];
let currentCoords = null;
let modelsReady = false;
let cameraReady = false;
let map = null;
let userMarker = null;

// Accessible, branded HTML result popup (replaces browser alert dialogs).
function showResultPopup({ title, message, eyebrow = 'SUCCESS', meta = '', kind = 'success' }) {
  const modal = document.getElementById('resultModal');
  const icon = document.getElementById('resultIcon');
  document.getElementById('resultTitle').textContent = title;
  document.getElementById('resultMessage').textContent = message || '';
  document.getElementById('resultEyebrow').textContent = eyebrow;
  document.getElementById('resultMeta').textContent = meta;
  icon.className = `result-icon ${kind}`;
  icon.innerHTML = kind === 'success' ? '<span>✓</span>' : '<span>!</span>';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('resultOk').focus();
}

function closeResultPopup() {
  const modal = document.getElementById('resultModal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

document.getElementById('resultClose').addEventListener('click', closeResultPopup);
document.getElementById('resultOk').addEventListener('click', closeResultPopup);
document.querySelector('[data-close-modal]').addEventListener('click', closeResultPopup);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeResultPopup();
});

// 1. Tab Switching Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// 2. Bind Action Buttons
document.getElementById('btnStartSensors').addEventListener('click', activateSensors);
document.getElementById('btnClockIn').addEventListener('click', () => handleAttendance('CLOCK IN'));
document.getElementById('btnClockOut').addEventListener('click', () => handleAttendance('CLOCK OUT'));
document.getElementById('btnRegister').addEventListener('click', handleRegister);

// 3. Initialize Backend Config & AI Models after all deferred scripts load
window.addEventListener('load', () => {
  loadBackendConfig();
  loadFaceModels();
});

async function loadBackendConfig() {
  statusEl.innerText = 'Fetching event configuration from Google Sheets...';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${GAS_API_URL}?action=init`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${response.statusText})`);
    }

    const initRes = await response.json();
    if (initRes.status !== 'ok') {
      throw new Error(initRes.message || 'Invalid response from Apps Script');
    }

    appConfig = initRes.config;
    document.getElementById('eventTitle').innerText = appConfig.eventName;
    document.getElementById('locationSubtitle').innerText =
      `${appConfig.locationName} • ${appConfig.restrict ? 'Strict Geofence' : 'Open Location'}`;
    document.getElementById('radiusTag').innerText = `Geofence Radius: ${appConfig.allowedRadius}m`;
    document.getElementById('versionInfo').innerText = `GeoAttend • API ${initRes.version || 'v2'}`;

    initMap(appConfig);

    rawUsersCache = initRes.users || [];
    buildUserDescriptors();

    statusEl.innerText = 'Config loaded. Tap "Activate Camera & GPS" above.';
  } catch (err) {
    clearTimeout(timeoutId);
    document.getElementById('eventTitle').innerText = 'Connection Failed';
    document.getElementById('locationSubtitle').innerText = 'Could not reach Google Apps Script';
    statusEl.innerText = err.name === 'AbortError'
      ? 'Timeout: Google Apps Script took too long to respond.'
      : `API Error: ${err.message}. Verify Web App is deployed as "Anyone" (New Version).`;
  }
}

async function loadFaceModels() {
  try {
    if (typeof faceapi === 'undefined') {
      throw new Error('face-api.js failed to load from CDN');
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);

    modelsReady = true;
    aiBadge.querySelector('.pill-text').innerText = 'AI: Ready';
    aiBadge.classList.add('ok');
    buildUserDescriptors();
    updateActionButtons();
  } catch (err) {
    aiBadge.querySelector('.pill-text').innerText = 'AI: Failed';
    aiBadge.classList.add('warn');
    statusEl.innerText = `AI Model Error: ${err.message}`;
  }
}

function buildUserDescriptors() {
  if (!modelsReady || !rawUsersCache.length) return;
  registeredUsers = rawUsersCache.map(u => ({
    ...u,
    labeledDescriptor: new faceapi.LabeledFaceDescriptors(
      `${u.userId}|${u.name}`,
      [new Float32Array(u.descriptor)]
    )
  }));
}

function initMap(cfg) {
  if (typeof L === 'undefined') return;
  map = L.map('map', { zoomControl: false }).setView([cfg.latitude, cfg.longitude], 16);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  L.marker([cfg.latitude, cfg.longitude])
    .addTo(map)
    .bindPopup(`<b>${cfg.locationName}</b><br>Radius: ${cfg.allowedRadius}m`);

  L.circle([cfg.latitude, cfg.longitude], {
    radius: cfg.allowedRadius,
    color: '#0d9488',
    fillColor: '#14b8a6',
    fillOpacity: 0.18,
    weight: 2
  }).addTo(map);
}

// 4. Resilient Camera & GPS Activation
async function activateSensors() {
  const btn = document.getElementById('btnStartSensors');
  btn.disabled = true;
  btn.innerText = 'Requesting Access...';
  statusEl.innerText = 'Requesting camera & GPS permissions...';

  if (!window.isSecureContext) {
    statusEl.innerText = 'Error: Camera & GPS require an HTTPS connection.';
    btn.disabled = false;
    btn.innerText = 'Retry Camera & GPS';
    return;
  }

  // Request Camera with automatic fallback for desktop/older webcams
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Browser does not support the Camera API.');
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
    } catch (constraintErr) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }

    video.srcObject = stream;
    await video.play();
    cameraReady = true;
    camOverlay.classList.add('hidden');
    faceGuide.classList.remove('hidden');
    updateActionButtons();
  } catch (err) {
    btn.disabled = false;
    btn.innerText = 'Retry Camera & GPS';

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      statusEl.innerText = 'Camera Permission Denied: Tap the lock/tune icon in your address bar -> Permissions -> Allow Camera, then reload.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      statusEl.innerText = 'Camera is busy in another tab or app. Close it and tap Retry.';
    } else if (err.name === 'NotFoundError') {
      statusEl.innerText = 'No camera hardware detected on this device.';
    } else {
      statusEl.innerText = `Camera Error (${err.name}): ${err.message}`;
    }
    return;
  }

  // Request Geolocation independently
  if (!('geolocation' in navigator)) {
    gpsBadge.querySelector('.pill-text').innerText = 'GPS: Unsupported';
    gpsBadge.classList.add('warn');
    statusEl.innerText = 'Camera active, but GPS is unsupported by this browser.';
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      currentCoords = pos.coords;
      updateGpsStatus();
      updateActionButtons();
    },
    (err) => {
      gpsBadge.querySelector('.pill-text').innerText = 'GPS: Blocked';
      gpsBadge.classList.add('warn');
      statusEl.innerText = `GPS Error (${err.code}): ${err.message}. Enable Location permissions and retry.`;
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function updateGpsStatus() {
  if (!currentCoords || !appConfig) return;

  const { latitude, longitude } = currentCoords;
  const dist = Math.round(
    calculateDistance(appConfig.latitude, appConfig.longitude, latitude, longitude)
  );
  const inside = dist <= appConfig.allowedRadius;

  gpsBadge.querySelector('.pill-text').innerText = `${dist}m (${inside ? 'In Zone' : 'Outside'})`;
  gpsBadge.className = 'pill ' + (inside || !appConfig.restrict ? 'ok' : 'warn');
  statusEl.innerText = 'Ready! Align your face inside the oval frame.';

  if (map) {
    if (!userMarker) {
      userMarker = L.circleMarker([latitude, longitude], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#e11d48',
        fillOpacity: 1
      }).addTo(map).bindPopup('Your Location');
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

// 5. CORS-Safe POST Helper for Google Apps Script
async function postToGAS(payload) {
  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

// 6. Register New Face Profile
async function handleRegister() {
  const userId = document.getElementById('regId').value.trim();
  const name = document.getElementById('regName').value.trim();
  if (!userId || !name) return showResultPopup({ title: 'Complete your details', message: 'Please enter both your participant ID and full name.', eyebrow: 'MISSING INFORMATION', kind: 'error' });

  const wasRegistered = rawUsersCache.some(u => String(u.userId) === userId);
  setButtonsLocked(true);
  statusEl.innerText = 'Scanning face for registration... Hold still.';

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      const message = 'No face was detected. Move into the camera frame, face the camera, and make sure the lighting is bright and even.';
      statusEl.innerText = message;
      showResultPopup({ title: 'Face not detected', message, eyebrow: 'REGISTRATION NOT COMPLETED', kind: 'error' });
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
      rawUsersCache = rawUsersCache.filter(u => String(u.userId) !== userId);
      rawUsersCache.push({ userId, name, descriptor: Array.from(detection.descriptor) });
      document.getElementById('regId').value = '';
      document.getElementById('regName').value = '';
      document.querySelector('[data-tab="panel-attendance"]').click();
      const actionWord = wasRegistered ? 'updated' : 'registered';
      statusEl.innerText = `Face profile ${actionWord} successfully for ${name}.`;
      showResultPopup({
        title: wasRegistered ? 'Face profile updated!' : 'Face registered!',
        message: wasRegistered ? `${name}'s facial profile has been updated successfully.` : `${name} is now registered and can use facial recognition for attendance.`,
        eyebrow: wasRegistered ? 'PROFILE UPDATED' : 'REGISTRATION COMPLETE',
        meta: `Participant ID: ${userId}`
      });
    } else {
      statusEl.innerText = result.message || 'Face registration could not be completed.';
      showResultPopup({ title: 'Registration not completed', message: result.message || 'The server did not confirm the registration.', eyebrow: 'PLEASE TRY AGAIN', kind: 'error' });
    }
  } catch (err) {
    const message = `We could not save the face profile. ${err.message || 'Please check your connection and try again.'}`;
    statusEl.innerText = 'Registration Error: ' + err.message;
    showResultPopup({ title: 'Face registration failed', message, eyebrow: 'SAVE FAILED', kind: 'error' });
  } finally {
    setButtonsLocked(false);
  }
}

// 7. Verify Face & Record Attendance
async function handleAttendance(type) {
  if (!currentCoords) return showResultPopup({ title: 'GPS is not ready', message: 'Wait until your location is detected, then try again.', eyebrow: 'LOCATION REQUIRED', kind: 'error' });
  if (registeredUsers.length === 0) return showResultPopup({ title: 'No face profile found', message: 'Please register your face before checking in or out.', eyebrow: 'REGISTRATION REQUIRED', kind: 'error' });

  setButtonsLocked(true);
  statusEl.innerText = 'Verifying facial identity...';

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      const actionName = type === 'CLOCK IN' ? 'check-in' : 'check-out';
      const message = `We could not detect your face, so your ${actionName} was not recorded. Center your face inside the oval and try again.`;
      statusEl.innerText = message;
      showResultPopup({ title: 'Face not detected', message, eyebrow: `${type} NOT RECORDED`, kind: 'error' });
      return setButtonsLocked(false);
    }

    const faceMatcher = new faceapi.FaceMatcher(
      registeredUsers.map(u => u.labeledDescriptor),
      0.5
    );
    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label === 'unknown') {
      const message = `Your face does not match a registered profile. Your ${type === 'CLOCK IN' ? 'check-in' : 'check-out'} was not recorded. Please register or update your face profile, then try again.`;
      statusEl.innerText = message;
      showResultPopup({ title: 'Face not recognized', message, eyebrow: `${type} NOT RECORDED`, kind: 'error' });
      return setButtonsLocked(false);
    }

    const [userId, name] = bestMatch.label.split('|');
    const confidence = Math.round((1 - bestMatch.distance) * 100) + '%';

    statusEl.innerText = `Verified ${name} (${confidence}). Recording ${type}...`;

    const result = await postToGAS({
      action: 'attendance',
      userId,
      name,
      type,
      lat: currentCoords.latitude,
      lon: currentCoords.longitude,
      confidence
    });

    statusEl.innerText = result.message || `${type} submitted.`;
    if (result.success) {
      const isIn = type === 'CLOCK IN';
      showResultPopup({
        title: isIn ? 'Check-in successful!' : 'Check-out successful!',
        message: result.message || (isIn ? 'Your arrival has been recorded successfully.' : 'Your departure has been recorded successfully.'),
        eyebrow: isIn ? 'ATTENDANCE RECORDED' : 'DEPARTURE RECORDED',
        meta: `${name} • ${userId}`
      });
    } else {
      showResultPopup({
        title: type === 'CLOCK IN' ? 'Check-in unsuccessful' : 'Check-out unsuccessful',
        message: result.message || 'The server did not confirm this attendance submission. No attendance record was confirmed.',
        eyebrow: 'ATTENDANCE NOT RECORDED',
        meta: `${name} • ${userId}`,
        kind: 'error'
      });
    }
  } catch (err) {
    const message = `Your ${type === 'CLOCK IN' ? 'check-in' : 'check-out'} could not be submitted. ${err.message || 'Please check your internet connection and try again.'}`;
    statusEl.innerText = 'Submission Error: ' + err.message;
    showResultPopup({
      title: type === 'CLOCK IN' ? 'Check-in unsuccessful' : 'Check-out unsuccessful',
      message,
      eyebrow: 'SUBMISSION FAILED',
      kind: 'error'
    });
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

// 8. Haversine Formula (Distance in Meters)
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
