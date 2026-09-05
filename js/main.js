import { setRawData, cachedDbPoints } from './state.js';
import { showMapLoader, hideMapLoader } from './utils.js';
import { initDynamicFilters, initJenisBangunanDropdown, applyFilters, getFilteredData } from './filters.js';
import { initCsvUploader } from './csvUploader.js';
import { 
  fetchAndRenderDbTagging, 
  fetchAndRenderGoogleBuildings, 
  fetchAndRenderAnomaliCluster, 
  renderDbTaggingFromCache, 
  renderDashboard 
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

    if (document.getElementById('toggle-tagging-db').checked && cachedDbPoints.length > 0) {
      renderDbTaggingFromCache();
    }

    if (document.getElementById('toggle-google-buildings').checked) {
      fetchAndRenderGoogleBuildings();
    }
    if (document.getElementById('toggle-anomali-cluster').checked) {
      fetchAndRenderAnomaliCluster();
    }
  }, 200);
});

// EVENT LISTENERS LAYER TOGGLES
document.getElementById('toggle-tagging-db').addEventListener('change', () => fetchAndRenderDbTagging(false));
document.getElementById('toggle-google-buildings').addEventListener('change', fetchAndRenderGoogleBuildings);
document.getElementById('toggle-anomali-cluster').addEventListener('change', fetchAndRenderAnomaliCluster);

// JALANKAN APLIKASI
loadDashboardData();