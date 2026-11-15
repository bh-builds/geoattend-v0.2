import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = path.join(root, 'vendor', '.complete');
const force = process.env.FORCE_VENDOR === '1';

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  console.log(`Downloaded ${path.relative(root, destination)} (${bytes.byteLength} bytes)`);
  return bytes;
}

async function downloadText(url, destination) {
  const bytes = await download(url, destination);
  return new TextDecoder().decode(bytes);
}

if (!force) {
  try {
    await fs.access(marker);
    console.log('Dependencies already vendored. Set FORCE_VENDOR=1 to refresh them.');
    process.exit(0);
  } catch {}
}

const leafletBase = 'https://unpkg.com/leaflet@1.9.4/dist';
const faceApiUrl = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const modelBase = 'https://justadudewhohacks.github.io/face-api.js/models';

await download(`${leafletBase}/leaflet.js`, path.join(root, 'vendor/leaflet/leaflet.js'));
await download(`${leafletBase}/leaflet.css`, path.join(root, 'vendor/leaflet/leaflet.css'));
for (const image of ['layers.png', 'layers-2x.png', 'marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png']) {
  await download(`${leafletBase}/images/${image}`, path.join(root, 'vendor/leaflet/images', image));
}
await download(faceApiUrl, path.join(root, 'vendor/face-api/face-api.min.js'));

const manifests = [
  'tiny_face_detector_model-weights_manifest.json',
  'face_landmark_68_model-weights_manifest.json',
  'face_recognition_model-weights_manifest.json'
];
for (const filename of manifests) {
  const manifestText = await downloadText(`${modelBase}/${filename}`, path.join(root, 'models', filename));
  const manifest = JSON.parse(manifestText);
  const strings = [];
  const visit = value => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(manifest);
  const shardPaths = [...new Set(strings.filter(value => /(?:shard|\.bin)(?:$|[?#])/i.test(value)))];
  if (!shardPaths.length) throw new Error(`No model shard paths found in ${filename}`);
  for (const shard of shardPaths) {
    if (shard.includes('..') || shard.startsWith('/')) throw new Error(`Unsafe model path in ${filename}: ${shard}`);
    const cleanPath = shard.split(/[?#]/, 1)[0];
    await download(`${modelBase}/${cleanPath}`, path.join(root, 'models', cleanPath));
  }
}

await fs.writeFile(marker, `Dependencies downloaded ${new Date().toISOString()}\n`);
console.log('All browser dependencies and face models are ready.');
