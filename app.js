'use strict';

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbz1l_aMFoI6UyxQDz6i1mP2PuFLLXXbGOdgEoRGGhBOpCU3JcaiNm4oJkTvj9T6M2pjJg/exec';
const HUMAN_MODELS_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/';

const video = document.getElementById('video');
const statusEl = document.getElementById('status');
const aiBadge = document.getElementById('aiBadge');
const gpsBadge = document.getElementById('gpsBadge');
const camOverlay = document.getElementById('camOverlay');
const faceGuide = document.getElementById('faceGuide');
const btnRefreshGps = document.getElementById('btnRefreshGps');

let currentLang = localStorage.getItem('geoattend_lang') === 'id' ? 'id' : 'en';
let appConfig = null;
let human = null;
let registeredUsers = []; // { userId, name, embedding }
let rawUsersCache = [];
let currentCoords = null;
let modelsReady = false;
let modelsFailed = false;
let cameraReady = false;
let gpsState = 'waiting'; // waiting | ready | blocked | unsupported
let gpsWatchId = null;
let lastDistance = null;
let lastInside = true;
let map = null;
let userMarker = null;
let isBusy = false;

// Calibrated anti-spoof & recognition thresholds for mobile/webcam feeds
const MIN_ANTISPOOF_SCORE = 0.50;
const MIN_LIVENESS_SCORE = 0.35;
const MIN_SIMILARITY_SCORE = 0.55;
const USER_ID_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

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
    btnRefreshGps: 'GPS',
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
    statusTimeout: 'Timeout: Server took too long to respond. Please try again.',
    statusHttps: 'Error: Camera & GPS require an HTTPS connection.',
    statusCamDenied: 'Camera Permission Denied: Tap the lock/tune icon in your address bar -> Permissions -> Allow Camera, then reload.',
    statusCamBusy: 'Camera is busy in another tab or app. Close it and tap Retry.',
    statusCamNotFound: 'No camera hardware detected on this device.',
    statusGpsUnsupported: 'Camera active, but GPS is unsupported by this browser.',
    statusScanningReg: 'Scanning face & liveness for registration... Hold still.',
    statusVerifying: 'Verifying live facial identity...',
    missingInfoTitle: 'Complete your details',
    missingInfoMsg: 'Please enter a valid participant ID (letters, numbers, ., _, -) and full name.',
    missingInfoEyebrow: 'MISSING INFORMATION',
    noFaceTitle: 'Face not detected',
    noFaceRegMsg: 'No face was detected. Move into the camera frame, look straight ahead, and ensure bright, even lighting.',
    noFaceRegEyebrow: 'REGISTRATION NOT COMPLETED',
    spoofTitle: 'Liveness check failed',
    spoofMsg: (realPct, livePct) => `Anti-spoofing check failed (Real: ${realPct}%, Live: ${livePct}%). Blink naturally and use a live camera feed directly—not a photo or screen—under good lighting.`,
    spoofEyebrow: 'ANTI-SPOOFING ALERT',
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
    gpsNotReadyMsg: 'Wait until your location is detected, or tap the GPS refresh button beside the map.',
    gpsNotReadyEyebrow: 'LOCATION REQUIRED',
    noUsersTitle: 'No face profile found',
    noUsersMsg: 'Please register your face before checking in or out.',
    noUsersEyebrow: 'REGISTRATION REQUIRED',
    legacyUsersTitle: 'Face re-registration required',
    legacyUsersMsg: 'Stored face profiles use an older AI model format. Please go to "Register Face" and re-register your face once.',
    noFaceAttMsg: (type) => `We could not detect your face, so your ${type === 'CLOCK IN' ? 'check-in' : 'check-out'} was not recorded. Center your face inside the oval and try again.`,
    attNotRecordedEyebrow: (type) => `${type} NOT RECORDED`,
    unrecognizedTitle: 'Face not recognized',
    unrecognizedMsg: (type, scorePct) => `Your face did not match a registered profile${scorePct !== undefined ? ` (best match: ${scorePct}%)` : ''}. Your ${type === 'CLOCK IN' ? 'check-in' : 'check-out'} was not recorded. Please ensure good lighting or re-register your face.`,
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
    btnRefreshGps: 'GPS',
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
    statusTimeout: 'Waktu habis: Server terlalu lama merespons. Silakan coba lagi.',
    statusHttps: 'Kesalahan: Kamera & GPS memerlukan koneksi HTTPS.',
    statusCamDenied: 'Izin Kamera Ditolak: Ketuk ikon gembok/pengaturan di bilah alamat browser -> Izin -> Izinkan Kamera, lalu muat ulang.',
    statusCamBusy: 'Kamera sedang digunakan aplikasi atau tab lain. Tutup lalu coba lagi.',
    statusCamNotFound: 'Perangkat kamera tidak ditemukan.',
    statusGpsUnsupported: 'Kamera aktif, tetapi GPS tidak didukung oleh browser ini.',
    statusScanningReg: 'Memindai wajah & keaslian untuk pendaftaran... Harap hadap kamera.',
    statusVerifying: 'Memverifikasi identitas wajah langsung...',
    missingInfoTitle: 'Lengkapi data Anda',
    missingInfoMsg: 'Harap masukkan ID peserta yang valid (huruf, angka, ., _, -) dan nama lengkap Anda.',
    missingInfoEyebrow: 'DATA BELUM LENGKAP',
    noFaceTitle: 'Wajah tidak terdeteksi',
    noFaceRegMsg: 'Wajah tidak terdeteksi. Posisikan wajah menghadap kamera dengan pencahayaan yang terang dan merata.',
    noFaceRegEyebrow: 'PENDAFTARAN GAGAL',
    spoofTitle: 'Pemeriksaan keaslian wajah gagal',
    spoofMsg: (realPct, livePct) => `Deteksi anti-spoofing gagal (Keaslian: ${realPct}%, Liveness: ${livePct}%). Berkedip secara alami dan gunakan wajah langsung di depan kamera (bukan foto atau layar HP) dengan cahaya terang.`,
    spoofEyebrow: 'PERINGATAN ANTI-SPOOFING',
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
    gpsNotReadyMsg: 'Tunggu hingga lokasi Anda terdeteksi, atau ketuk tombol segarkan GPS di samping peta.',
    gpsNotReadyEyebrow: 'LOKASI DIPERLUKAN',
    noUsersTitle: 'Profil wajah belum ada',
    noUsersMsg: 'Silakan daftarkan wajah Anda terlebih dahulu sebelum melakukan absensi.',
    noUsersEyebrow: 'PENDAFTARAN DIPERLUKAN',
    legacyUsersTitle: 'Pendaftaran ulang wajah diperlukan',
    legacyUsersMsg: 'Data wajah yang tersimpan menggunakan format AI versi lama. Silakan buka tab "Daftar Wajah" dan daftarkan ulang wajah Anda.',
    noFaceAttMsg: (type) => `Wajah tidak terdeteksi sehingga ${type === 'CLOCK IN' ? 'absen masuk' : 'absen pulang'} tidak tercatat. Posisikan wajah di tengah bingkai oval dan coba lagi.`,
    attNotRecordedEyebrow: (type) => `${type === 'CLOCK IN' ? 'ABSEN MASUK' : 'ABSEN PULANG'} TIDAK TERCATAT`,
    unrecognizedTitle: 'Wajah tidak dikenali',
    unrecognizedMsg: (type, scorePct) => `Wajah Anda tidak cocok dengan profil terdaftar${scorePct !== undefined ? ` (kemiripan tertinggi: ${scorePct}%)` : ''} sehingga ${type === 'CLOCK IN' ? 'absen masuk' : 'absen pulang'} tidak tercatat. Pastikan cahaya terang atau daftar ulang wajah Anda.`,
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeText(value, maxLen = 100) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

const FLAG_ASSETS = {
  en: 'data:image/webp;base64,UklGRlwEAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSPQAAAABgFtbe9vmA/5OmsChzbHiRvQ84gAOncI0zmGGHCsA/D9H+P/tBSKCgdtGipplOuw8At8IAiy2k8tX1dfLSbsISECNCOzs3bLC7f4OECsSDEeZ7It+SUtP5tEQUskrx2RWVtBMHq9BfuTmhom/knjXfEsRy/fMNJB5u4SIIIOzr2xLZwMJgs6aycQOEtZLUau0lPWAQ3tNZh5i7olql/Jpbpc9HfRsZ1o8Kjq9pnqkvH6jkzf+O/6Of8nUfZD/u/i/q/+/8P9Xgo7JXncQ/3+NiKVbZlu+X0b87qtbm69umorx1o5MvlyBuH39N3GhHlfGlrgCVlA4IEIDAACQEwCdASogACAAAQAcJbACdMoRwN6rwhm23c/JA+gH7N+VX+A7QH2Z+pX5mfqA8wH6N/5brAfir7gH6m9YB6AH6W9ZP+zn7k/AL/Fv7J/6sFF2s/QPxA5CvJcvgPyA9Gv6rUDrTF7m87P9V/Jn+q+/l/W+U38Y/s/+29wb+Tfzn/Wf1X91PiO6if9Szzi+xZUEgyWJrJeUxY/Xpw0kjDJd45+x4ngA/shciOqzsujp7dKQ34IyupV14mdj75wJeOXAUr2uF7KjvtswtM6mAYGwoR00bl/5FMLDFtFNae+MJnos8ycFa52F1QO8Jx83dWmd/OyuP17+p420D2XQhh/tM/eEWI/7Z3COvmjDVeE3h+K6LtM0/I141j9c4q/V4KT9ZTLB5LjcHGBhOHZb1nnRsr4fgc7s7ATV6jcd9+dNnm/7rZP+C/lUDjUakXtgIi65y2S9zwXWt7tw70yfzVa1So9lkF1Y5chuOgB24hxdEw4lTroMNJCWBrITupHsVX8Ugrjsww1wJcUfKz6hcU/w8if8mBeDheeGfSbbar6OWKnTr/racWLHESZg//uevwKQn1BQCX/xEa/rjMOKJO9YmFH80bhwlLhY46HwHE3dZ/8mvYqNRibPyhsW1OplpcP6G2HhQMul/IPa+zlRDyG+dWbUnSn0r+74YR1IjoAe/0V/9IuNbdaAMdfxt/Qa5VufxnTvQRyXnPmYsilJs58NSYNrv7379F/0I1Dwtv7t1d4Sdor1pKvbirS4FvsscaUs3vp26wQBCkn4jbw2modL1d9ph9oT/F4futjDGCtjf/QK4hB0iP9k8wcG2k0MmSxCav3m9BxtQuQKhgIymCw00vrKH7v+lX7J9Y9Egtdkj6iHcAVqoX+Sh8eiv6gd/8U3jd1eJQWnbmHPLvzAQt08vxLtvKxVJG47ULirsW7VneGMZBo0zYE395TFCzv2/Ly2W7QNlvCgCWqI+gkWVWiYdcIJ1rAEPvx0aQwBv2tZZ5w7ggkNFL6Fj6+vV88YcmrOomvfCmIM1M0EMNSgUMjtx+y//jPJl8d0fKnH2HMvQLgqz+dWdzsc/kzcbEevpI2geAQvqseifmK3ZH3kSc9wAAA=',
  id: 'data:image/webp;base64,UklGRuABAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSO8AAAABgF1bm+rkG1nJo+HdQIpBSrg8B8px78KtAIcKMvefD53M10FEMHDbSFGzTIedR+AvEeiMxqd3T093p+NRB4go4jzmmhsWuNmcg3cFeWDjhWRr+QdrSb5sAL6Q+7tkMhawRO4O4P/lpQumzCnkxIulP8n53iUnrGDCq97vhoCD31yX9hEQsPqba9Mqgpv5NKuV2eeMQ8PEahIbdB+z1cvyY3eFmQKZy9tsFbXcOqcpMp4/qJ2HJ1VPz7L0jr5EP0j/Lvp31f8L/b/S/0sE7Ev/teaLy553sq/++3Knypd9eNnXSlxoCnFhSlw5qYgrAABWUDggygAAAHAGAJ0BKiAAIAA+RRqJRCKhoRv0ACgERLUAUf1APwAWoBlAH7O+iAChgGNYrKQ0pmSyrHZ2CFKDWv15UAD+9CX4n0MkeVP+7vtP/i+SrhlndCJldWuv/8ThznP8rhVegHF8Wr84i/MvP+ZVk7pCDRu6zWZAJ9pSO2c79foqveD44pjYLD9StWa0fz//i581/nnFr+zT0wZC+nn/1qlzSbEcwui0t4I8rbYS+Y9YRdXf1VMFjq/SznmwjEXOsew/YoH5lfd6NtYAAAA='
};

function applyLanguage() {
  document.documentElement.lang = currentLang;
  document.getElementById('langLabel').textContent = currentLang === 'en' ? 'EN' : 'ID';
  const flagImg = document.getElementById('langFlag');
  if (flagImg) {
    flagImg.src = FLAG_ASSETS[currentLang] || FLAG_ASSETS.en;
    flagImg.alt = currentLang === 'en' ? 'English' : 'Bahasa Indonesia';
  }

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
    if (isBusy) return;
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
btnRefreshGps.addEventListener('click', refreshGpsLocation);

// Cleanup sensor watches on unload
window.addEventListener('pagehide', () => {
  if (gpsWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
});

// 3. Initialize Backend Config & @vladmandic/human AI Models
window.addEventListener('load', () => {
  applyLanguage();
  loadBackendConfig();
  loadHumanModels();
});

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadBackendConfig() {
  statusEl.textContent = t('statusFetching');

  try {
    const response = await fetchWithTimeout(`${GAS_API_URL}?action=init`, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store'
    }, 15000);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${response.statusText})`);
    }

    const initRes = await response.json();
    if (!initRes || initRes.status !== 'ok' || !initRes.config) {
      throw new Error(initRes?.message || 'Invalid response from Apps Script');
    }

    const lat = Number(initRes.config.latitude);
    const lon = Number(initRes.config.longitude);
    const radius = Number(initRes.config.allowedRadius);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius) || radius <= 0) {
      throw new Error('Invalid venue coordinates or radius in configuration.');
    }

    appConfig = {
      eventName: sanitizeText(initRes.config.eventName, 120) || 'Smart Attendance',
      locationName: sanitizeText(initRes.config.locationName, 120) || 'Venue',
      latitude: lat,
      longitude: lon,
      allowedRadius: radius,
      restrict: Boolean(initRes.config.restrict)
    };

    document.getElementById('eventTitle').textContent = appConfig.eventName;
    document.getElementById('locationSubtitle').textContent =
      `${appConfig.locationName} • ${appConfig.restrict ? 'Strict Geofence' : 'Open Location'}`;
    document.getElementById('radiusTag').textContent = t('radiusTag', appConfig.allowedRadius);
    document.getElementById('versionInfo').textContent =
      `GeoAttend • Human AI ${sanitizeText(initRes.version || 'v2', 24)}`;

    initMap(appConfig);

    rawUsersCache = Array.isArray(initRes.users) ? initRes.users : [];
    buildUserDescriptors();

    statusEl.textContent = t('statusConfigLoaded');
  } catch (err) {
    document.getElementById('eventTitle').textContent = t('statusConnFailed');
    document.getElementById('locationSubtitle').textContent = t('statusConnFailedSub');
    statusEl.textContent = err.name === 'AbortError'
      ? t('statusTimeout')
      : `API Error: ${err.message}`;
  }
}

async function loadHumanModels() {
  try {
    const HumanCtor = window.Human?.Human || window.Human;
    if (!HumanCtor) {
      throw new Error('@vladmandic/human failed to load from CDN');
    }

    const baseConfig = {
      modelBasePath: HUMAN_MODELS_BASE,
      async: true,
      warmup: 'none',
      cacheSensitivity: 0,
      filter: { enabled: true, equalization: true },
      face: {
        enabled: true,
        detector: { enabled: true, rotation: true, maxDetected: 1, minConfidence: 0.45 },
        mesh: { enabled: true },
        iris: { enabled: false },
        description: { enabled: true },
        emotion: { enabled: false },
        antispoof: { enabled: true },
        liveness: { enabled: true }
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false }
    };

    try {
      human = new HumanCtor({ ...baseConfig, backend: 'webgl' });
      await human.load();
    } catch (webglErr) {
      console.warn('WebGL backend failed, falling back to CPU:', webglErr);
      human = new HumanCtor({ ...baseConfig, backend: 'cpu' });
      await human.load();
    }

    modelsReady = true;
    aiBadge.querySelector('.pill-text').textContent = t('aiReady');
    aiBadge.classList.remove('warn');
    aiBadge.classList.add('ok');
    buildUserDescriptors();
    updateActionButtons();
  } catch (err) {
    modelsFailed = true;
    aiBadge.querySelector('.pill-text').textContent = t('aiFailed');
    aiBadge.classList.add('warn');
    statusEl.textContent = `AI Model Error: ${err.message}`;
    console.error('Human AI Init Error:', err);
  }
}

function buildUserDescriptors() {
  if (!rawUsersCache.length) {
    registeredUsers = [];
    return;
  }
  registeredUsers = rawUsersCache
    .filter(u =>
      u &&
      Array.isArray(u.descriptor) &&
      u.descriptor.length > 0 &&
      u.descriptor.every(v => Number.isFinite(Number(v)))
    )
    .map(u => ({
      userId: sanitizeText(u.userId, 40),
      name: sanitizeText(u.name, 100),
      embedding: u.descriptor.map(Number)
    }));
}

// Multi-frame Human detection + anti-spoofing + temporal liveness check
async function analyzeLiveFace() {
  if (!human || !video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return { ok: false, reason: 'no_face' };
  }

  let bestFace = null;
  let maxLive = 0;
  let maxReal = 0;

  // Sample 5 consecutive frames (~80ms apart) so temporal liveness & anti-spoofing stabilize
  for (let i = 0; i < 5; i++) {
    const result = await human.detect(video);
    const face = result?.face?.[0];
    if (face && face.embedding && face.embedding.length > 0) {
      bestFace = face;
      if (typeof face.live === 'number') maxLive = Math.max(maxLive, face.live);
      if (typeof face.real === 'number') maxReal = Math.max(maxReal, face.real);
    }
    if (i < 4) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  }

  if (!bestFace) {
    return { ok: false, reason: 'no_face' };
  }

  if (maxReal < MIN_ANTISPOOF_SCORE || maxLive < MIN_LIVENESS_SCORE) {
    return {
      ok: false,
      reason: 'spoof',
      realPct: Math.round(maxReal * 100),
      livePct: Math.round(maxLive * 100)
    };
  }

  const embedding = Array.from(bestFace.embedding).map(Number);
  if (!embedding.length || !embedding.every(Number.isFinite)) {
    return { ok: false, reason: 'no_face' };
  }

  return {
    ok: true,
    embedding,
    realPct: Math.round(maxReal * 100),
    livePct: Math.round(maxLive * 100)
  };
}

// Fallback cosine similarity if human.match.find signature differs across CDN builds
function findBestMatch(queryEmbedding, candidates) {
  if (human?.match?.find) {
    try {
      const res = human.match.find(queryEmbedding, candidates.map(c => c.embedding));
      if (res && typeof res.index === 'number' && res.index >= 0 && typeof res.similarity === 'number') {
        return { index: res.index, similarity: res.similarity };
      }
    } catch (_) {
      // Fall through to direct cosine similarity calculation
    }
  }

  let bestIndex = -1;
  let bestSimilarity = -1;

  for (let i = 0; i < candidates.length; i++) {
    const target = candidates[i].embedding;
    if (!target || target.length !== queryEmbedding.length) continue;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let j = 0; j < queryEmbedding.length; j++) {
      dot += queryEmbedding[j] * target[j];
      normA += queryEmbedding[j] * queryEmbedding[j];
      normB += target[j] * target[j];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    const sim = denom > 0 ? (dot / denom + 1) / 2 : 0;
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestIndex = i;
    }
  }

  return bestIndex >= 0 ? { index: bestIndex, similarity: bestSimilarity } : null;
}

function initMap(cfg) {
  const mapElement = document.getElementById('map');
  if (typeof L === 'undefined') {
    mapElement.innerHTML = '<div class="map-load-message" role="status">Map library could not be loaded.</div>';
    return;
  }

  if (map) {
    map.remove();
    map = null;
    userMarker = null;
  }

  map = L.map('map', { zoomControl: false, attributionControl: true }).setView([cfg.latitude, cfg.longitude], 16);
  map.attributionControl.setPrefix(false);

  const tileNotice = document.createElement('div');
  tileNotice.className = 'map-load-message';
  tileNotice.setAttribute('role', 'status');
  tileNotice.textContent = 'Map tiles unavailable.';
  tileNotice.hidden = true;
  mapElement.appendChild(tileNotice);

  let errorCount = 0;
  let usingFallback = false;

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  osmLayer.on('tileload', () => {
    errorCount = 0;
    tileNotice.hidden = true;
  });

  osmLayer.on('tileerror', () => {
    errorCount++;
    if (errorCount >= 3 && !usingFallback) {
      usingFallback = true;
      map.removeLayer(osmLayer);
      const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO'
      }).addTo(map);
      cartoLayer.on('tileload', () => { tileNotice.hidden = true; });
      cartoLayer.on('tileerror', () => { tileNotice.hidden = false; });
    }
  });

  L.marker([cfg.latitude, cfg.longitude])
    .addTo(map)
    .bindPopup(`<b>${escapeHtml(cfg.locationName)}</b><br>Radius: ${escapeHtml(cfg.allowedRadius)}m`);

  L.circle([cfg.latitude, cfg.longitude], {
    radius: cfg.allowedRadius,
    color: '#0d9488',
    fillColor: '#14b8a6',
    fillOpacity: 0.18,
    weight: 2
  }).addTo(map);

  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 150);
}

// 4. Resilient Camera & GPS Activation
async function activateSensors() {
  const btn = document.getElementById('btnStartSensors');
  btn.disabled = true;
  btn.textContent = t('btnRequesting');
  statusEl.textContent = t('statusReqSensors');

  if (!window.isSecureContext) {
    statusEl.textContent = t('statusHttps');
    btn.disabled = false;
    btn.textContent = t('btnRetry');
    return;
  }

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Browser does not support the Camera API.');
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
    } catch (_) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }

    video.srcObject = stream;
    await new Promise(resolve => {
      if (video.readyState >= 1) return resolve();
      video.onloadedmetadata = () => resolve();
    });
    await video.play();

    cameraReady = true;
    camOverlay.classList.add('hidden');
    faceGuide.classList.remove('hidden');
    updateActionButtons();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = t('btnRetry');

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      statusEl.textContent = t('statusCamDenied');
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      statusEl.textContent = t('statusCamBusy');
    } else if (err.name === 'NotFoundError') {
      statusEl.textContent = t('statusCamNotFound');
    } else {
      statusEl.textContent = `Camera Error (${err.name}): ${err.message}`;
    }
    return;
  }

  startGpsWatcher();
}

function startGpsWatcher() {
  if (!('geolocation' in navigator)) {
    gpsState = 'unsupported';
    gpsBadge.querySelector('.pill-text').textContent = t('gpsUnsupported');
    gpsBadge.classList.add('warn');
    statusEl.textContent = t('statusGpsUnsupported');
    return;
  }

  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (isValidCoords(pos.coords)) {
        currentCoords = pos.coords;
        updateGpsStatus();
        updateActionButtons();
      }
    },
    (err) => {
      gpsState = 'blocked';
      gpsBadge.querySelector('.pill-text').textContent = t('gpsBlocked');
      gpsBadge.classList.add('warn');
      statusEl.textContent = `GPS Error (${err.code}): ${err.message}`;
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function refreshGpsLocation() {
  if (!('geolocation' in navigator)) {
    gpsState = 'unsupported';
    gpsBadge.querySelector('.pill-text').textContent = t('gpsUnsupported');
    gpsBadge.classList.add('warn');
    return;
  }

  btnRefreshGps.classList.add('spinning');
  btnRefreshGps.disabled = true;
  gpsBadge.querySelector('.pill-text').textContent = t('gpsWaiting');
  gpsBadge.className = 'pill pill-neutral';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (isValidCoords(pos.coords)) {
        currentCoords = pos.coords;
        updateGpsStatus();
        updateActionButtons();
        if (map) {
          map.setView([pos.coords.latitude, pos.coords.longitude], 17);
        }
      }
      if (gpsWatchId === null) {
        startGpsWatcher();
      }
      btnRefreshGps.classList.remove('spinning');
      btnRefreshGps.disabled = false;
    },
    (err) => {
      gpsState = 'blocked';
      gpsBadge.querySelector('.pill-text').textContent = t('gpsBlocked');
      gpsBadge.className = 'pill warn';
      statusEl.textContent = `GPS Error (${err.code}): ${err.message}`;
      btnRefreshGps.classList.remove('spinning');
      btnRefreshGps.disabled = false;
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
}

function isValidCoords(coords) {
  return Boolean(
    coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Math.abs(coords.longitude) <= 180
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

  gpsBadge.querySelector('.pill-text').textContent = t('gpsDist', dist, inside);
  gpsBadge.className = 'pill ' + (inside || !appConfig.restrict ? 'ok' : 'warn');
  statusEl.textContent = t('statusReady');

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
  const ready = !isBusy && modelsReady && cameraReady && currentCoords !== null;
  document.getElementById('btnClockIn').disabled = !ready;
  document.getElementById('btnClockOut').disabled = !ready;
  document.getElementById('btnRegister').disabled = !(!isBusy && modelsReady && cameraReady);
}

// 5. CORS-Safe POST Helper with Timeout for Google Apps Script
async function postToGAS(payload) {
  const res = await fetchWithTimeout(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }, 20000);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} (${res.statusText})`);
  }
  return res.json();
}

// 6. Register New Face Profile (with Liveness & Anti-Spoofing)
async function handleRegister() {
  if (isBusy) return;

  const userId = sanitizeText(document.getElementById('regId').value, 40);
  const name = sanitizeText(document.getElementById('regName').value, 100);
  if (!userId || !name || !USER_ID_PATTERN.test(userId)) {
    return showResultPopup({
      title: t('missingInfoTitle'),
      message: t('missingInfoMsg'),
      eyebrow: t('missingInfoEyebrow'),
      kind: 'error'
    });
  }

  const wasRegistered = rawUsersCache.some(u => String(u.userId) === userId);
  setButtonsLocked(true);
  statusEl.textContent = t('statusScanningReg');

  try {
    const scan = await analyzeLiveFace();

    if (!scan.ok) {
      if (scan.reason === 'spoof') {
        const message = t('spoofMsg', scan.realPct, scan.livePct);
        statusEl.textContent = message;
        showResultPopup({
          title: t('spoofTitle'),
          message,
          eyebrow: t('spoofEyebrow'),
          kind: 'error'
        });
      } else {
        const message = t('noFaceRegMsg');
        statusEl.textContent = message;
        showResultPopup({
          title: t('noFaceTitle'),
          message,
          eyebrow: t('noFaceRegEyebrow'),
          kind: 'error'
        });
      }
      return;
    }

    const result = await postToGAS({
      action: 'register',
      userId,
      name,
      descriptor: scan.embedding
    });

    if (result && result.success) {
      registeredUsers = registeredUsers.filter(u => u.userId !== userId);
      registeredUsers.push({
        userId,
        name,
        embedding: scan.embedding
      });
      rawUsersCache = rawUsersCache.filter(u => String(u.userId) !== userId);
      rawUsersCache.push({ userId, name, descriptor: scan.embedding });
      document.getElementById('regId').value = '';
      document.getElementById('regName').value = '';

      setButtonsLocked(false);
      document.querySelector('[data-tab="panel-attendance"]').click();

      const msg = wasRegistered ? t('regUpdatedMsg', name) : t('regCreatedMsg', name);
      statusEl.textContent = msg;
      showResultPopup({
        title: wasRegistered ? t('regUpdatedTitle') : t('regCreatedTitle'),
        message: msg,
        eyebrow: wasRegistered ? t('regUpdatedEyebrow') : t('regCreatedEyebrow'),
        meta: `${t('regMeta', userId)} • Real ${scan.realPct}% • Live ${scan.livePct}%`
      });
    } else {
      const errMsg = sanitizeText(result?.message, 240) || t('regFailedTitle');
      statusEl.textContent = errMsg;
      showResultPopup({
        title: t('regFailedTitle'),
        message: errMsg,
        eyebrow: t('noFaceRegEyebrow'),
        kind: 'error'
      });
    }
  } catch (err) {
    const errMsg = err.name === 'AbortError' ? t('statusTimeout') : err.message;
    statusEl.textContent = 'Registration Error: ' + errMsg;
    showResultPopup({
      title: t('regSaveFailedTitle'),
      message: errMsg,
      eyebrow: t('subFailEyebrow'),
      kind: 'error'
    });
  } finally {
    setButtonsLocked(false);
  }
}

// 7. Verify Live Face & Record Attendance
async function handleAttendance(type) {
  if (isBusy) return;
  if (type !== 'CLOCK IN' && type !== 'CLOCK OUT') return;

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
  statusEl.textContent = t('statusVerifying');

  try {
    const scan = await analyzeLiveFace();

    if (!scan.ok) {
      if (scan.reason === 'spoof') {
        const message = t('spoofMsg', scan.realPct, scan.livePct);
        statusEl.textContent = message;
        showResultPopup({
          title: t('spoofTitle'),
          message,
          eyebrow: t('spoofEyebrow'),
          kind: 'error'
        });
      } else {
        const message = t('noFaceAttMsg', type);
        statusEl.textContent = message;
        showResultPopup({
          title: t('noFaceTitle'),
          message,
          eyebrow: t('attNotRecordedEyebrow', type),
          kind: 'error'
        });
      }
      return;
    }

    // Filter stored embeddings matching current vector length (1024-D for Human FaceRes)
    const compatibleUsers = registeredUsers.filter(
      u => u.embedding.length === scan.embedding.length
    );

    if (compatibleUsers.length === 0) {
      const message = t('legacyUsersMsg');
      statusEl.textContent = message;
      showResultPopup({
        title: t('legacyUsersTitle'),
        message,
        eyebrow: t('attNotRecordedEyebrow', type),
        kind: 'error'
      });
      return;
    }

    const best = findBestMatch(scan.embedding, compatibleUsers);
    const bestPct = best ? Math.round(best.similarity * 100) : 0;

    if (!best || best.similarity < MIN_SIMILARITY_SCORE) {
      const message = t('unrecognizedMsg', type, bestPct);
      statusEl.textContent = message;
      showResultPopup({
        title: t('unrecognizedTitle'),
        message,
        eyebrow: t('attNotRecordedEyebrow', type),
        kind: 'error'
      });
      return;
    }

    const matchedUser = compatibleUsers[best.index];
    const confidence = `${bestPct}% (Real ${scan.realPct}%, Live ${scan.livePct}%)`;

    statusEl.textContent = `Verified ${matchedUser.name} (${bestPct}%)...`;

    const result = await postToGAS({
      action: 'attendance',
      userId: matchedUser.userId,
      name: matchedUser.name,
      type,
      lat: currentCoords.latitude,
      lon: currentCoords.longitude,
      confidence
    });

    const serverMsg = sanitizeText(result?.message, 240);
    statusEl.textContent = serverMsg || `${type} submitted.`;
    const isIn = type === 'CLOCK IN';

    if (result && result.success) {
      showResultPopup({
        title: t('attSuccessTitle', isIn),
        message: serverMsg || t('attSuccessDefault', isIn),
        eyebrow: t('attSuccessEyebrow', isIn),
        meta: `${matchedUser.name} • ${matchedUser.userId}`
      });
    } else {
      showResultPopup({
        title: t('attFailTitle', isIn),
        message: serverMsg || t('attFailTitle', isIn),
        eyebrow: t('attFailEyebrow'),
        meta: `${matchedUser.name} • ${matchedUser.userId}`,
        kind: 'error'
      });
    }
  } catch (err) {
    const isIn = type === 'CLOCK IN';
    const errMsg = err.name === 'AbortError' ? t('statusTimeout') : err.message;
    statusEl.textContent = 'Submission Error: ' + errMsg;
    showResultPopup({
      title: t('attFailTitle', isIn),
      message: errMsg,
      eyebrow: t('subFailEyebrow'),
      kind: 'error'
    });
  } finally {
    setButtonsLocked(false);
  }
}

function setButtonsLocked(locked) {
  isBusy = Boolean(locked);
  if (isBusy) {
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
