import { requireAuthGuard } from './auth.js';
import { applyRoleBasedUI, filterMasterDataForRole } from './uiGuard.js';
import { getCachedSlsData, setCachedSlsData, getLocalDataVersion } from './dbCache.js';
import { setRawData, cachedDbPoints, cachedAnomaliPoints } from './state.js';
import { showMapLoader, hideMapLoader } from './utils.js';
import { initDynamicFilters, initJenisBangunanDropdown, applyFilters, updateDropdownOptions, getFilteredData } from './filters.js';
import { initCsvUploader } from './csvUploader.js';
import { 
  fetchAndRenderDbTagging, 
  fetchAndRenderGoogleBuildings, 
  fetchAndRenderAnomaliCluster, 
  renderAnomaliClusterFromCache,
  renderDbTaggingFromCache, 
  renderDashboard,
} from './layers.js';

let currentProfile = null;

// MAIN LOADER FUNCTION WITH INDEXEDDB CACHING & ROLE GUARD
export async function loadDashboardData() {
  // 1. AUTENTIKASI PENGGUNA
  currentProfile = await requireAuthGuard();
  if (!currentProfile) return;

  // 2. APPLIKASI ROLE UI (ADMIN / PEGAWAI / PML)
  applyRoleBasedUI(currentProfile);

  showMapLoader("Memeriksa versi data SLS...");

  let masterSlsData = null;

  try {
    // A. Cek Versi Data dari Supabase (Query sangat ringan, < 1 KB Egress)
    const { data: verData, error: verErr } = await supabaseClient
      .from('app_versions')
      .select('version_number')
      .eq('id', 1)
      .maybeSingle();

    const serverVersion = verData ? verData.version_number : '1.0.0';
    const localVersion = getLocalDataVersion();

    console.log(`🔍 Versi Data - Server: ${serverVersion} | Lokal: ${localVersion}`);

    // B. Bandingkan Versi Data
    if (serverVersion === localVersion) {
      // B.1 Jika versi SAMA, ambil dari IndexedDB
      masterSlsData = await getCachedSlsData();
      if (masterSlsData && masterSlsData.length > 0) {
        console.log(`⚡ Menggunakan Data SLS dari IndexedDB (${masterSlsData.length} baris, 0 MB Egress)`);
      }
    }

    // C. Jika versi BEDA atau cache IndexedDB KOSONG, download dari Supabase
    if (!masterSlsData || masterSlsData.length === 0) {
      showMapLoader("Mengunduh pembaruan data SLS (Sekali saja)...");
      console.log("📥 Mengunduh data SLS terbaru dari Supabase...");

      const { data: remoteData, error: dataErr } = await supabaseClient
        .from('admin_sls_gap_analysis')
        .select('*');

      if (dataErr) throw dataErr;

      masterSlsData = remoteData;
      // Simpan ke IndexedDB untuk penggunaan berikutnya
      await setCachedSlsData(masterSlsData, serverVersion);
    }

  } catch (err) {
    console.error("⚠️ Gagal memuat data versi/cache:", err);
    // Fallback: coba ambil data lokal yang ada
    masterSlsData = await getCachedSlsData() || [];
  }

  // 3. ISOLASI DATA SESUAI ROLE USER (PML disaring per Kecamatan)
  const scopedData = filterMasterDataForRole(masterSlsData, currentProfile);
  setRawData(scopedData);

  // 4. INSIALISASI DROPDOWN DENGAN DATA TERISOLASI
  initDynamicFilters();
  initJenisBangunanDropdown();

  // 5. PENYESUAIAN KHUSUS ROLE PML
  if (currentProfile.role === 'PML' && currentProfile.kecamatan_tugas) {
    const selectKec = document.getElementById('filter-kec');
    if (selectKec) {
      const rawKec = currentProfile.kecamatan_tugas.trim();
      const matchDigits = rawKec.match(/^\d+/);
      const targetCode = matchDigits ? matchDigits[0] : '';
      const targetName = rawKec.replace(/^[0-9\s.-]+/, '').trim().toUpperCase();

      let matchedIndex = -1;
      for (let i = 0; i < selectKec.options.length; i++) {
        const opt = selectKec.options[i];
        const optVal = opt.value.trim();
        const optText = opt.innerText.toUpperCase();

        if ((targetCode && optVal === targetCode) || (targetName && optText.includes(targetName))) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex !== -1) {
        selectKec.selectedIndex = matchedIndex;
        updateDropdownOptions('kec');
      }
      selectKec.disabled = true; // Kunci dropdown kecamatan PML
    }
  }

  // 6. AKTIFKAN UPLOADER UNTUK ADMIN
  if (currentProfile.role === 'ADMIN') {
    initCsvUploader();
  }

  // 7. RENDER PEMFILTERAN PERTAMA
  applyFilters();
  hideMapLoader();
}

// =========================================================================
// EVENT LISTENERS MAP MOVE & ZOOM (OPTIMIZED RE-RENDER)
// =========================================================================
let mapMoveTimeout;
map.on('moveend zoomend', () => {
  clearTimeout(mapMoveTimeout);
  mapMoveTimeout = setTimeout(() => {
    const currentFilteredData = getFilteredData();

    // 1. Render ulang batas & label polygon SLS di sidebar & peta
    renderDashboard(currentFilteredData);

    // 2. Render ulang titik DB Tagging (Mengecek Zoom >= 19 untuk Label Detail)
    const toggleDbEl = document.getElementById('toggle-tagging-db');
    if (toggleDbEl && toggleDbEl.checked && cachedDbPoints.length > 0) {
      renderDbTaggingFromCache();
    }

    // 3. Render ulang Anomali Cluster (Mengecek Zoom < 16 vs >= 16 untuk Area Cluster)
    const toggleAnomaliEl = document.getElementById('toggle-anomali-cluster');
    if (toggleAnomaliEl && toggleAnomaliEl.checked && cachedAnomaliPoints.length > 0) {
      renderAnomaliClusterFromCache();
    }

    // 4. Render Google Buildings (Spatial Bounding berdasarkan viewport peta)
    const toggleGoogleEl = document.getElementById('toggle-google-buildings');
    if (toggleGoogleEl && toggleGoogleEl.checked) {
      fetchAndRenderGoogleBuildings();
    }

  }, 100); // Debounce 100ms agar re-render saat zoom terasa instan
});

// =========================================================================
// EVENT LISTENERS LAYER TOGGLES
// =========================================================================
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