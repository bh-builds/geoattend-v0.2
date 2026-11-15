const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbz1l_aMFoI6UyxQDz6i1mP2PuFLLXXbGOdgEoRGGhBOpCU3JcaiNm4oJkTvj9T6M2pjJg/exec';
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

const video = document.getElementById('video');
const statusEl = document.getElementById('status');
const aiBadge = document.getElementById('aiBadge');
const gpsBadge = document.getElementById('gpsBadge');
const camOverlay = document.getElementById('camOverlay');
const faceGuide = document.getElementById('faceGuide');

let currentLang = localStorage.getItem('geoattend_lang') || 'en';
let appConfig = null;
let registeredUsers = [];
let rawUsersCache = [];
let currentCoords = null;
let modelsReady = false;
let modelsFailed = false;
let cameraReady = false;
let gpsState = 'waiting'; // waiting | ready | blocked | unsupported
let lastDistance = null;
let lastInside = true;
let map = null;
let userMarker = null;

const I18N = {
  en: {
    heroBadge: 'SMART ATTENDANCE',
    loadingEvent: 'Loading Event...',
    connectingVenue: 'Connecting to venue rules...',
    strictGeofence: 'Strict Geofence',
    openLocation: 'Open Location',
    radiusTag: (r) => `Radius: ${r}m`,
    aiLoading: 'AI: Loading...',
    aiReady: 'AI: Ready',
    aiFailed: 'AI: Failed',
    gpsWaiting: 'GPS: Waiting...',
    gpsBlocked: 'GPS: Blocked',
    gpsUnsupported: 'GPS: N/A',
    gpsDist: (d, inside) => `${d}m (${inside ? 'In' : 'Out'})`,
    guideHint: 'Align your face inside the frame',
    overlayTitle: 'Camera & GPS Required',
    overlayDesc: 'Enable sensors to verify your face and location at the venue.',
    btnActivate: 'Activate Camera & GPS',
    btnRequesting: 'Requesting Access...',
    btnRetry: 'Retry Camera & GPS',
    tabAttendance: 'Check In / Out',
    tabRegister: 'Register Face',
    btnClockInTitle: 'Clock In',
    btnClockInSub: 'Arrival',
    btnClockOutTitle: 'Clock Out',
    btnClockOutSub: 'Departure',
    labelId: 'NIP / Participant ID',
    placeholderId: 'e.g. 198109042009121001',
    labelName: 'Full Name',
    placeholderName: 'Enter your full name',
    btnSaveProfile: 'Capture & Save Face Profile',
    btnContinue: 'Continue',
    statusInit: 'Initializing system...',
    statusFetching: 'Fetching event configuration from Google Sheets...',
    statusConfigLoaded: 'Config loaded. Tap "Activate Camera & GPS" above.',
    statusReqSensors: 'Requesting camera & GPS permissions...',
    statusReady: 'Ready! Align your face inside the oval frame.',
    statusConnFailed: 'Connection Failed',
    statusConnFailedSub: 'Could not reach Google Apps Script',
    statusTimeout: 'Timeout: Google Apps Script took too long to respond.',
    statusHttps: 'Error: Camera & GPS require an HTTPS connection.',
    statusCamDenied: 'Camera Permission Denied: Tap the lock/tune icon in your address bar -> Permissions -> Allow Camera, then reload.',
    statusCamBusy: 'Camera is busy in another tab or app. Close it and tap Retry.',
    statusCamNotFound: 'No camera hardware detected on this device.',
    statusGpsUnsupported: 'Camera active, but GPS is unsupported by this browser.',
    statusScanningReg: 'Scanning face for registration... Hold still.',
    statusVerifying: 'Verifying facial identity...',
    missingInfoTitle: 'Complete your details',
    missingInfoMsg: 'Please enter both your participant ID and full name.',
    missingInfoEyebrow: 'MISSING INFORMATION',
    noFaceTitle: 'Face not detected',
    noFaceRegMsg: 'No face was detected. Move into the camera frame, face the camera, and make sure the lighting is bright and even.',
    noFaceRegEyebrow: 'REGISTRATION NOT COMPLETED',
    regUpdatedTitle: 'Face profile updated!',
    regCreatedTitle: 'Face registered!',
    regUpdatedMsg: (name) => `${name}'s facial profile has been updated successfully.`,
    regCreatedMsg: (name) => `${name} is now registered and can use facial recognition for attendance.`,
    regUpdatedEyebrow: 'PROFILE UPDATED',
    regCreatedEyebrow: 'REGISTRATION COMPLETE',
    regMeta: (id) => `Participant ID: ${id}`,
    regFailedTitle: 'Registration not completed',
    regSaveFailedTitle: 'Face registration failed',
    gpsNotReadyTitle: 'GPS is not ready',
    gpsNotReadyMsg: 'Wait until your location is detected, then try again.',
    gpsNotReadyEyebrow: 'LOCATION REQUIRED',
    noUsersTitle: 'No face profile found',
    noUsersMsg: 'Please register your face before checking in or out.',
    noUsersEyebrow: 'REGISTRATION REQUIRED',
    noFaceAttMsg: (type) => `We could not detect your face, so your ${type === 'CLOCK IN' ? 'check-in' : 'check-out'} was not recorded. Center your face inside the oval and try again.`,
    attNotRecordedEyebrow: (type) => `${type} NOT RECORDED`,
    unrecognizedTitle: 'Face not recognized',
    unrecognizedMsg: (type) => `Your face does not match a registered profile. Your ${type === 'CLOCK IN' ? 'check-in' : 'check-out'} was not recorded. Please register or update your face profile, then try again.`,
    attSuccessTitle: (isIn) => isIn ? 'Check-in successful!' : 'Check-out successful!',
    attSuccessDefault: (isIn) => isIn ? 'Your arrival has been recorded successfully.' : 'Your departure has been recorded successfully.',
    attSuccessEyebrow: (isIn) => isIn ? 'ATTENDANCE RECORDED' : 'DEPARTURE RECORDED',
    attFailTitle: (isIn) => isIn ? 'Check-in unsuccessful' : 'Check-out unsuccessful',
    attFailEyebrow: 'ATTENDANCE NOT RECORDED',
    subFailEyebrow: 'SUBMISSION FAILED'
  },
  id: {
    heroBadge: 'ABSENSI PINTAR',
    loadingEvent: 'Memuat Acara...',
    connectingVenue: 'Menghubungkan aturan lokasi...',
    strictGeofence: 'Geofence Ketat',
    openLocation: 'Lokasi Bebas',
    radiusTag: (r) => `Radius: ${r}m`,
    aiLoading: 'AI: Memuat...',
    aiReady: 'AI: Siap',
    aiFailed: 'AI: Gagal',
    gpsWaiting: 'GPS: Menunggu...',
    gpsBlocked: 'GPS: Diblokir',
    gpsUnsupported: 'GPS: N/A',
    gpsDist: (d, inside) => `${d}m (${inside ? 'Dalam' : 'Luar'})`,
    guideHint: 'Posisikan wajah di dalam bingkai oval',
    overlayTitle: 'Kamera & GPS Diperlukan',
    overlayDesc: 'Aktifkan sensor untuk memverifikasi wajah dan lokasi Anda di tempat acara.',
    btnActivate: 'Aktifkan Kamera & GPS',
    btnRequesting: 'Meminta Akses...',
    btnRetry: 'Coba Lagi Kamera & GPS',
    tabAttendance: 'Absen Masuk / Pulang',
    tabRegister: 'Daftar Wajah',
    btnClockInTitle: 'Absen Masuk',
    btnClockInSub: 'Datang',
    btnClockOutTitle: 'Absen Pulang',
    btnClockOutSub: 'Pulang',
    labelId: 'NIP / ID Peserta',
    placeholderId: 'contoh: 198109042009121001',
    labelName: 'Nama Lengkap',
    placeholderName: 'Masukkan nama lengkap Anda',
    btnSaveProfile: 'Ambil & Simpan Profil Wajah',
    btnContinue: 'Lanjutkan',
    statusInit: 'Menginisialisasi sistem...',
    statusFetching: 'Mengambil konfigurasi acara dari Google Sheets...',
    statusConfigLoaded: 'Konfigurasi dimuat. Ketuk "Aktifkan Kamera & GPS" di atas.',
    statusReqSensors: 'Meminta izin kamera & GPS...',
    statusReady: 'Siap! Posisikan wajah Anda di dalam bingkai oval.',
    statusConnFailed: 'Koneksi Gagal',
    statusConnFailedSub: 'Tidak dapat terhubung ke Google Apps Script',
    statusTimeout: 'Waktu habis: Google Apps Script terlalu lama merespons.',
    statusHttps: 'Kesalahan: Kamera & GPS memerlukan koneksi HTTPS.',
    statusCamDenied: 'Izin Kamera Ditolak: Ketuk ikon gembok/pengaturan di bilah alamat browser -> Izin -> Izinkan Kamera, lalu muat ulang.',
    statusCamBusy: 'Kamera sedang digunakan aplikasi atau tab lain. Tutup lalu coba lagi.',
    statusCamNotFound: 'Perangkat kamera tidak ditemukan.',
    statusGpsUnsupported: 'Kamera aktif, tetapi GPS tidak didukung oleh browser ini.',
    statusScanningReg: 'Memindai wajah untuk pendaftaran... Harap diam sejenak.',
    statusVerifying: 'Memverifikasi identitas wajah...',
    missingInfoTitle: 'Lengkapi data Anda',
    missingInfoMsg: 'Harap masukkan ID peserta dan nama lengkap Anda.',
    missingInfoEyebrow: 'DATA BELUM LENGKAP',
    noFaceTitle: 'Wajah tidak terdeteksi',
    noFaceRegMsg: 'Wajah tidak terdeteksi. Posisikan wajah menghadap kamera dengan pencahayaan yang terang dan merata.',
    noFaceRegEyebrow: 'PENDAFTARAN GAGAL',
    regUpdatedTitle: 'Profil wajah diperbarui!',
    regCreatedTitle: 'Wajah berhasil didaftarkan!',
    regUpdatedMsg: (name) => `Profil wajah ${name} berhasil diperbarui.`,
    regCreatedMsg: (name) => `${name} telah terdaftar dan dapat menggunakan pengenalan wajah untuk absensi.`,
    regUpdatedEyebrow: 'PROFIL DIPERBARUI',
    regCreatedEyebrow: 'PENDAFTARAN BERHASIL',
    regMeta: (id) => `ID Peserta: ${id}`,
    regFailedTitle: 'Pendaftaran belum berhasil',
    regSaveFailedTitle: 'Gagal menyimpan profil wajah',
    gpsNotReadyTitle: 'GPS belum siap',
    gpsNotReadyMsg: 'Tunggu hingga lokasi Anda terdeteksi, lalu coba lagi.',
    gpsNotReadyEyebrow: 'LOKASI DIPERLUKAN',
    noUsersTitle: 'Profil wajah belum ada',
    noUsersMsg: 'Silakan daftarkan wajah Anda terlebih dahulu sebelum melakukan absensi.',
    noUsersEyebrow: 'PENDAFTARAN DIPERLUKAN',
    noFaceAttMsg: (type) => `Wajah tidak terdeteksi sehingga ${type === 'CLOCK IN' ? 'absen masuk' : 'absen pulang'} tidak tercatat. Posisikan wajah di tengah bingkai oval dan coba lagi.`,
    attNotRecordedEyebrow: (type) => `${type === 'CLOCK IN' ? 'ABSEN MASUK' : 'ABSEN PULANG'} TIDAK TERCATAT`,
    unrecognizedTitle: 'Wajah tidak dikenali',
    unrecognizedMsg: (type) => `Wajah Anda tidak cocok dengan profil terdaftar sehingga ${type === 'CLOCK IN' ? 'absen masuk' : 'absen pulang'} tidak tercatat. Silakan daftar wajah terlebih dahulu.`,
    attSuccessTitle: (isIn) => isIn ? 'Absen masuk berhasil!' : 'Absen pulang berhasil!',
    attSuccessDefault: (isIn) => isIn ? 'Kehadiran Anda telah berhasil dicatat.' : 'Kepulangan Anda telah berhasil dicatat.',
    attSuccessEyebrow: (isIn) => isIn ? 'KEHADIRAN TERCATAT' : 'KEPULANGAN TERCATAT',
    attFailTitle: (isIn) => isIn ? 'Absen masuk gagal' : 'Absen pulang gagal',
    attFailEyebrow: 'ABSENSI TIDAK TERCATAT',
    subFailEyebrow: 'PENGIRIMAN GAGAL'
  }
};

function t(key, ...args) {
  const dict = I18N[currentLang] || I18N.en;
  const val = dict[key];
  return typeof val === 'function' ? val(...args) : val;
}

function applyLanguage() {
  document.documentElement.lang = currentLang;
  document.getElementById('langLabel').textContent = currentLang === 'en' ? 'EN' : 'ID';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (I18N[currentLang][key]) {
      el.textContent = t(key);
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (I18N[currentLang][key]) {
      el.setAttribute('placeholder', t(key));
    }
  });

  // Update dynamic badges & headers
  if (modelsReady) {
    aiBadge.querySelector('.pill-text').textContent = t('aiReady');
  } else if (modelsFailed) {
    aiBadge.querySelector('.pill-text').textContent = t('aiFailed');
  } else {
    aiBadge.querySelector('.pill-text').textContent = t('aiLoading');
  }

  if (gpsState === 'ready' && lastDistance !== null) {
    gpsBadge.querySelector('.pill-text').textContent = t('gpsDist', lastDistance, lastInside);
  } else if (gpsState === 'blocked') {
    gpsBadge.querySelector('.pill-text').textContent = t('gpsBlocked');
  } else if (gpsState === 'unsupported') {
    gpsBadge.querySelector('.pill-text').textContent = t('gpsUnsupported');
  } else {
    gpsBadge.querySelector('.pill-text').textContent = t('gpsWaiting');
  }

  if (appConfig) {
    document.getElementById('eventTitle').textContent = appConfig.eventName;
    document.getElementById('locationSubtitle').textContent =
      `${appConfig.locationName} • ${appConfig.restrict ? t('strictGeofence') : t('openLocation')}`;
    document.getElementById('radiusTag').textContent = t('radiusTag', appConfig.allowedRadius);
  }

  if (cameraReady && currentCoords) {
    statusEl.textContent = t('statusReady');
  } else if (appConfig && !cameraReady) {
    statusEl.textContent = t('statusConfigLoaded');
  }
}

document.getElementById('btnLangToggle').addEventListener('click', () => {
  currentLang = currentLang === 'en' ? 'id' : 'en';
  localStorage.setItem('geoattend_lang', currentLang);
  applyLanguage();
});

// Accessible, branded HTML result popup
function showResultPopup({ title, message, eyebrow = 'SUCCESS', meta = '', kind = 'success' }) {
  const modal = document.getElementById('resultModal');
  const icon = document.getElementById('resultIcon');
  const eyebrowEl = document.getElementById('resultEyebrow');
  const okBtn = document.getElementById('resultOk');

  document.getElementById('resultTitle').textContent = title;
  document.getElementById('resultMessage').textContent = message || '';
  eyebrowEl.textContent = eyebrow;
  document.getElementById('resultMeta').textContent = meta;

  icon.className = `result-icon ${kind}`;
  eyebrowEl.className = `result-eyebrow ${kind}`;
  okBtn.className = `result-button ${kind}`;
  icon.innerHTML = kind === 'success' ? '<span>✓</span>' : '<span>!</span>';

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  okBtn.focus();
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
  applyLanguage();
  loadBackendConfig();
  loadFaceModels();
});

async function loadBackendConfig() {
  statusEl.innerText = t('statusFetching');
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
      `${appConfig.locationName} • ${appConfig.restrict ? t('strictGeofence') : t('openLocation')}`;
    document.getElementById('radiusTag').innerText = t('radiusTag', appConfig.allowedRadius);
    document.getElementById('versionInfo').innerText = `GeoAttend • API ${initRes.version || 'v2'}`;

    initMap(appConfig);

    rawUsersCache = initRes.users || [];
    buildUserDescriptors();

    statusEl.innerText = t('statusConfigLoaded');
  } catch (err) {
    clearTimeout(timeoutId);
    document.getElementById('eventTitle').innerText = t('statusConnFailed');
    document.getElementById('locationSubtitle').innerText = t('statusConnFailedSub');
    statusEl.innerText = err.name === 'AbortError'
      ? t('statusTimeout')
      : `API Error: ${err.message}`;
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
    aiBadge.querySelector('.pill-text').innerText = t('aiReady');
    aiBadge.classList.add('ok');
    buildUserDescriptors();
    updateActionButtons();
  } catch (err) {
    modelsFailed = true;
    aiBadge.querySelector('.pill-text').innerText = t('aiFailed');
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
  const mapElement = document.getElementById('map');
  if (typeof L === 'undefined') {
    mapElement.innerHTML = '<div class="map-load-message" role="status">Map library could not be loaded.</div>';
    return;
  }

  map = L.map('map', { zoomControl: false, attributionControl: false }).setView([cfg.latitude, cfg.longitude], 16);

  const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  const tileNotice = document.createElement('div');
  tileNotice.className = 'map-load-message';
  tileNotice.setAttribute('role', 'status');
  tileNotice.textContent = 'Map tiles unavailable.';
  tileNotice.hidden = true;
  mapElement.appendChild(tileNotice);

  tileLayer.on('tileerror', () => { tileNotice.hidden = false; });
  tileLayer.on('tileload', () => { tileNotice.hidden = true; });

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
  btn.innerText = t('btnRequesting');
  statusEl.innerText = t('statusReqSensors');

  if (!window.isSecureContext) {
    statusEl.innerText = t('statusHttps');
    btn.disabled = false;
    btn.innerText = t('btnRetry');
    return;
  }

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
    btn.innerText = t('btnRetry');

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      statusEl.innerText = t('statusCamDenied');
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      statusEl.innerText = t('statusCamBusy');
    } else if (err.name === 'NotFoundError') {
      statusEl.innerText = t('statusCamNotFound');
    } else {
      statusEl.innerText = `Camera Error (${err.name}): ${err.message}`;
    }
    return;
  }

  if (!('geolocation' in navigator)) {
    gpsState = 'unsupported';
    gpsBadge.querySelector('.pill-text').innerText = t('gpsUnsupported');
    gpsBadge.classList.add('warn');
    statusEl.innerText = t('statusGpsUnsupported');
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      currentCoords = pos.coords;
      updateGpsStatus();
      updateActionButtons();
    },
    (err) => {
      gpsState = 'blocked';
      gpsBadge.querySelector('.pill-text').innerText = t('gpsBlocked');
      gpsBadge.classList.add('warn');
      statusEl.innerText = `GPS Error (${err.code}): ${err.message}`;
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

  gpsState = 'ready';
  lastDistance = dist;
  lastInside = inside;

  gpsBadge.querySelector('.pill-text').innerText = t('gpsDist', dist, inside);
  gpsBadge.className = 'pill ' + (inside || !appConfig.restrict ? 'ok' : 'warn');
  statusEl.innerText = t('statusReady');

  if (map) {
    if (!userMarker) {
      userMarker = L.circleMarker([latitude, longitude], {
        radius: 6,
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
  if (!userId || !name) {
    return showResultPopup({
      title: t('missingInfoTitle'),
      message: t('missingInfoMsg'),
      eyebrow: t('missingInfoEyebrow'),
      kind: 'error'
    });
  }

  const wasRegistered = rawUsersCache.some(u => String(u.userId) === userId);
  setButtonsLocked(true);
  statusEl.innerText = t('statusScanningReg');

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      const message = t('noFaceRegMsg');
      statusEl.innerText = message;
      showResultPopup({
        title: t('noFaceTitle'),
        message,
        eyebrow: t('noFaceRegEyebrow'),
        kind: 'error'
      });
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

      const msg = wasRegistered ? t('regUpdatedMsg', name) : t('regCreatedMsg', name);
      statusEl.innerText = msg;
      showResultPopup({
        title: wasRegistered ? t('regUpdatedTitle') : t('regCreatedTitle'),
        message: msg,
        eyebrow: wasRegistered ? t('regUpdatedEyebrow') : t('regCreatedEyebrow'),
        meta: t('regMeta', userId)
      });
    } else {
      statusEl.innerText = result.message || t('regFailedTitle');
      showResultPopup({
        title: t('regFailedTitle'),
        message: result.message || t('regFailedTitle'),
        eyebrow: t('noFaceRegEyebrow'),
        kind: 'error'
      });
    }
  } catch (err) {
    statusEl.innerText = 'Registration Error: ' + err.message;
    showResultPopup({
      title: t('regSaveFailedTitle'),
      message: err.message,
      eyebrow: t('subFailEyebrow'),
      kind: 'error'
    });
  } finally {
    setButtonsLocked(false);
  }
}

// 7. Verify Face & Record Attendance
async function handleAttendance(type) {
  if (!currentCoords) {
    return showResultPopup({
      title: t('gpsNotReadyTitle'),
      message: t('gpsNotReadyMsg'),
      eyebrow: t('gpsNotReadyEyebrow'),
      kind: 'error'
    });
  }
  if (registeredUsers.length === 0) {
    return showResultPopup({
      title: t('noUsersTitle'),
      message: t('noUsersMsg'),
      eyebrow: t('noUsersEyebrow'),
      kind: 'error'
    });
  }

  setButtonsLocked(true);
  statusEl.innerText = t('statusVerifying');

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      const message = t('noFaceAttMsg', type);
      statusEl.innerText = message;
      showResultPopup({
        title: t('noFaceTitle'),
        message,
        eyebrow: t('attNotRecordedEyebrow', type),
        kind: 'error'
      });
      return setButtonsLocked(false);
    }

    const faceMatcher = new faceapi.FaceMatcher(
      registeredUsers.map(u => u.labeledDescriptor),
      0.5
    );
    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label === 'unknown') {
      const message = t('unrecognizedMsg', type);
      statusEl.innerText = message;
      showResultPopup({
        title: t('unrecognizedTitle'),
        message,
        eyebrow: t('attNotRecordedEyebrow', type),
        kind: 'error'
      });
      return setButtonsLocked(false);
    }

    const [userId, name] = bestMatch.label.split('|');
    const confidence = Math.round((1 - bestMatch.distance) * 100) + '%';

    statusEl.innerText = `Verified ${name} (${confidence})...`;

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
    const isIn = type === 'CLOCK IN';
    if (result.success) {
      showResultPopup({
        title: t('attSuccessTitle', isIn),
        message: result.message || t('attSuccessDefault', isIn),
        eyebrow: t('attSuccessEyebrow', isIn),
        meta: `${name} • ${userId}`
      });
    } else {
      showResultPopup({
        title: t('attFailTitle', isIn),
        message: result.message || t('attFailTitle', isIn),
        eyebrow: t('attFailEyebrow'),
        meta: `${name} • ${userId}`,
        kind: 'error'
      });
    }
  } catch (err) {
    const isIn = type === 'CLOCK IN';
    statusEl.innerText = 'Submission Error: ' + err.message;
    showResultPopup({
      title: t('attFailTitle', isIn),
      message: err.message,
      eyebrow: t('subFailEyebrow'),
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
