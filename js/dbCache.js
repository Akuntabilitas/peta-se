const DB_NAME = 'SibulakGIS_DB';
const DB_VERSION = 2; // Naikan versi DB untuk mendukung multiple object stores
const STORE_SLS = 'sls_gap_analysis';
const STORE_LAYERS = 'gis_layers_cache';
const VERSION_KEY = 'sls_data_version';

/**
 * Inisialisasi IndexedDB dengan Multi-Store Support
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      
      // Store 1: Data Master SLS & Gap Analysis
      if (!db.objectStoreNames.contains(STORE_SLS)) {
        db.createObjectStore(STORE_SLS, { keyPath: 'kd_sls' });
      }

      // Store 2: Layer Spasial (DB Tagging, Anomali, Google Buildings)
      if (!db.objectStoreNames.contains(STORE_LAYERS)) {
        db.createObjectStore(STORE_LAYERS, { keyPath: 'cache_key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject("Error IndexedDB: " + e.target.error);
  });
}

// =========================================================================
// 1. MANAJEMEN MASTER DATA SLS
// =========================================================================

export async function getCachedSlsData() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SLS, 'readonly');
      const store = tx.objectStore(STORE_SLS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject("Gagal mengambil cache SLS IndexedDB");
    });
  } catch (err) {
    console.warn("⚠️ Gagal membaca IndexedDB SLS:", err);
    return null;
  }
}

export async function setCachedSlsData(dataList, versionString) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SLS, 'readwrite');
    const store = tx.objectStore(STORE_SLS);

    await store.clear();
    dataList.forEach(item => store.put(item));

    localStorage.setItem(VERSION_KEY, versionString);
    console.log(`✅ Master Data SLS (${dataList.length} baris) disimpan ke IndexedDB. Versi: ${versionString}`);
  } catch (err) {
    console.error("❌ Gagal menyimpan SLS ke IndexedDB:", err);
  }
}

// =========================================================================
// 2. MANAJEMEN LAYER SPASIAL (DB TAGGING, ANOMALI, GOOGLE BUILDINGS)
// =========================================================================

export async function getLayerCacheFromIDB(cacheKey) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_LAYERS, 'readonly');
      const store = tx.objectStore(STORE_LAYERS);
      const request = store.get(cacheKey);

      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

export async function setLayerCacheToIDB(cacheKey, dataArray) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LAYERS, 'readwrite');
    const store = tx.objectStore(STORE_LAYERS);
    
    store.put({ 
      cache_key: cacheKey, 
      data: dataArray, 
      updated_at: Date.now() 
    });
    console.log(`⚡ [IndexedDB] Layer Cache disimpan: ${cacheKey} (${dataArray.length} titik)`);
  } catch (err) {
    console.warn("❌ Gagal menyimpan Layer Cache ke IDB:", err);
  }
}

/**
 * Bersihkan seluruh cache layer jika terjadi update versi data
 */
export async function clearAllGisLayerCache() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LAYERS, 'readwrite');
    const store = tx.objectStore(STORE_LAYERS);
    await store.clear();
    console.log("🧹 Seluruh Layer Cache di IndexedDB berhasil dibersihkan.");
  } catch (err) {
    console.warn("⚠️ Gagal membersihkan Layer Cache IDB:", err);
  }
}

// =========================================================================
// 3. MANAJEMEN VERSI DATA
// =========================================================================

export function getLocalDataVersion() {
  return localStorage.getItem(VERSION_KEY) || '0.0.0';
}