import { setRawData, cachedDbPoints, cachedAnomaliPoints } from './state.js';
import { showMapLoader, hideMapLoader } from './utils.js';
import { initDynamicFilters, initJenisBangunanDropdown, applyFilters, getFilteredData } from './filters.js';
import { initCsvUploader } from './csvUploader.js';
import { 
  fetchAndRenderDbTagging, 
  fetchAndRenderGoogleBuildings, 
  fetchAndRenderAnomaliCluster, 
  renderAnomaliClusterFromCache,
  renderDbTaggingFromCache, 
  renderDashboard,
} from './layers.js';

// MAIN LOADER FUNCTION
async function loadDashboardData() {
  showMapLoader("Memuat data SLS & Wilayah...");

  const { data, error } = await supabaseClient
    .from('admin_sls_gap_analysis')
    .select('*');

  if (error) {
    console.error("Gagal mengambil data SLS:", error);
    hideMapLoader();
    return;
  }

  setRawData(data);

  initDynamicFilters();
  initJenisBangunanDropdown();
  initCsvUploader();
  applyFilters();

  hideMapLoader();
}

// EVENT LISTENERS MAP MOVE & ZOOM (DEBOUNCED)
let mapMoveTimeout;
map.on('moveend zoomend', () => {
  clearTimeout(mapMoveTimeout);
  mapMoveTimeout = setTimeout(() => {
    const currentFilteredData = getFilteredData();
    renderDashboard(currentFilteredData);

    const toggleDbEl = document.getElementById('toggle-tagging-db');
    if (toggleDbEl && toggleDbEl.checked && cachedDbPoints.length > 0) {
      renderDbTaggingFromCache();
    }

    const toggleGoogleEl = document.getElementById('toggle-google-buildings');
    if (toggleGoogleEl && toggleGoogleEl.checked) {
      fetchAndRenderGoogleBuildings();
    }

    // Gunakan render dari Cache lokal agar hemat Egress
    const toggleAnomaliEl = document.getElementById('toggle-anomali-cluster');
    if (toggleAnomaliEl && toggleAnomaliEl.checked && cachedAnomaliPoints.length > 0) {
      renderAnomaliClusterFromCache();
    }
  }, 200);
});

// EVENT LISTENERS LAYER TOGGLES
const toggleDb = document.getElementById('toggle-tagging-db');
if (toggleDb) {
  toggleDb.addEventListener('change', () => fetchAndRenderDbTagging(false));
}

const toggleGoogle = document.getElementById('toggle-google-buildings');
if (toggleGoogle) {
  toggleGoogle.addEventListener('change', fetchAndRenderGoogleBuildings);
}

const toggleAnomali = document.getElementById('toggle-anomali-cluster');
if (toggleAnomali) {
  toggleAnomali.addEventListener('change', () => fetchAndRenderAnomaliCluster(false));
}

// TOGGLE BARU: TAMPILKAN / SEMBUNYIKAN LABEL DETAIL (RE-RENDER INSTAN DARI CACHE)
const toggleLabels = document.getElementById('toggle-detailed-labels');
if (toggleLabels) {
  toggleLabels.addEventListener('change', () => {
    const toggleDbEl = document.getElementById('toggle-tagging-db');
    if (toggleDbEl && toggleDbEl.checked && cachedDbPoints.length > 0) {
      renderDbTaggingFromCache();
    }
  });
}

// JALANKAN APLIKASI
loadDashboardData();