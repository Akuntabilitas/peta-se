export function showMapLoader(message = "Memuat data spasial...") {
  const loader = document.getElementById('map-loader');
  const loaderText = document.getElementById('map-loader-text');
  const mapElement = document.getElementById('map');

  if (loaderText) loaderText.innerText = message;
  if (loader) loader.classList.remove('hidden');
  if (mapElement) mapElement.classList.add('map-loading');
}

export function hideMapLoader() {
  const loader = document.getElementById('map-loader');
  const mapElement = document.getElementById('map');

  if (loader) loader.classList.add('hidden');
  if (mapElement) mapElement.classList.remove('map-loading');
}

export function updateDownloadProgress(show, title = "", percent = 0, subtext = "") {
  const container = document.getElementById('download-progress-container');
  const titleEl = document.getElementById('download-progress-title');
  const percentEl = document.getElementById('download-progress-percent');
  const barEl = document.getElementById('download-progress-bar');
  const subtextEl = document.getElementById('download-progress-subtext');

  if (!container) return;

  if (show) {
    container.classList.remove('hidden');
    if (titleEl) titleEl.innerHTML = `<span class="animate-spin">⏳</span> ${title}`;
    if (percentEl) percentEl.innerText = `${percent}%`;
    if (barEl) barEl.style.width = `${percent}%`;
    if (subtextEl) subtextEl.innerText = subtext;
  } else {
    container.classList.add('hidden');
  }
}

export function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const LocalDb = {
  dbName: 'GoogleBuildingsCacheDB',
  storeName: 'kecamatan_buildings',
  
  async getDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get(key) {
    try {
      const db = await this.getDb();
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn("Gagal membaca dari IndexedDB:", e);
      return null;
    }
  },

  async set(key, value) {
    try {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("Gagal menyimpan ke IndexedDB:", e);
    }
  }
};