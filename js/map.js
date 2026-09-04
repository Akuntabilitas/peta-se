// INITIALIZE MAP & BASEMAPS
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxNativeZoom: 19, maxZoom: 22, attribution: '© OpenStreetMap contributors'
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxNativeZoom: 18, maxZoom: 22, attribution: 'Tiles © Esri'
});

const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
  maxNativeZoom: 19, maxZoom: 22, subdomains: 'abcd'
});

const hybridGroup = L.layerGroup([satelliteLayer, labelsLayer]);
const canvasRenderer = L.canvas({ padding: 0.5 });

const map = L.map('map', { 
  preferCanvas: true, 
  maxZoom: 22, 
  layers: [hybridGroup],
  zoomAnimation: true,         // Mengaktifkan animasi transisi zoom
  fadeAnimation: true,         // Efek kehalusan perubahan layer
  markerZoomAnimation: true    // Menganimasikan pergeseran marker & label saat zoom
}).setView([-7.53, 110.60], 11);

const baseMaps = { "🛰️ Satelit / Hybrid": hybridGroup, "🗺️ Peta Jalan (OSM)": osmLayer };
L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

// LAYER GROUPS
const slsLayerGroup = L.layerGroup().addTo(map);
const dbTaggingLayerGroup = L.layerGroup().addTo(map);
const googleBuildingsLayerGroup = L.layerGroup().addTo(map);
const csvTaggingLayerGroup = L.layerGroup().addTo(map);
const anomaliClusterLayerGroup = L.layerGroup().addTo(map);

// STYLE HELPER FOR BUILDING TYPES
function getJenisBangunanStyle(jenisCode) {
  const codeStr = String(jenisCode).trim();
  switch (codeStr) {
    case '1': return { color: '#1D4ED8', fillColor: '#2563EB', label: 'Khusus Usaha', icon: '💼' };
    case '2': return { color: '#7E22CE', fillColor: '#9333EA', label: 'Campuran', icon: '🏪' };
    case '3': return { color: '#047857', fillColor: '#10B981', label: 'Tempat Tinggal', icon: '🏠' };
    case '4': return { color: '#B45309', fillColor: '#D97706', label: 'Ibadah / Kantor Organisasi', icon: '🕌' };
    case '5': return { color: '#B91C1C', fillColor: '#DC2626', label: 'Kantor Pemerintah', icon: '🏛️' };
    case '6': return { color: '#4B5563', fillColor: '#6B7280', label: 'Lainnya / Kosong / Rusak', icon: '🏚️' };
    case '7': return { color: '#0E7490', fillColor: '#0891B2', label: 'Virtual Office', icon: '💻' };
    case '8': return { color: '#451A03', fillColor: '#78350F', label: 'Panti / Lapas / Barak', icon: '🏢' };
    case '9': return { color: '#111827', fillColor: '#374151', label: 'Non Respon', icon: '❓' };
    default:  return { color: '#047857', fillColor: '#10B981', label: 'Belum Terklasifikasi', icon: '🟢' };
  }
}