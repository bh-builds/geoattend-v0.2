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
let currentCoords = null;
let modelsReady = false;
let cameraReady = false;
let map = null;
let userMarker = null;

// Tab Switching Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Bind Action Buttons
document.getElementById('btnStartSensors').addEventListener('click', activateSensors);
document.getElementById('btn
