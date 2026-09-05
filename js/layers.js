import { 
  rawData,
  googleBuildingsCache, isDownloadingGoogle, setIsDownloadingGoogle,
  cachedDbPoints, setCachedDbPoints, lastFetchFilterKey, setLastFetchFilterKey,
  cachedAnomaliPoints, setCachedAnomaliPoints, lastAnomaliFilterKey, setLastAnomaliFilterKey,
  slsLookupMap, uploadedTaggingMap 
} from './state.js';

import { showMapLoader, hideMapLoader, updateDownloadProgress, getDistanceInMeters, LocalDb } from './utils.js';
import { getFilteredData, getSelectedJenisArray } from './filters.js';
import { getLayerCacheFromIDB, setLayerCacheToIDB } from './dbCache.js';

// =========================================================================
// 1. GOOGLE BUILDINGS (LAYER FISIK BANGUNAN)
// =========================================================================
export async function fetchAndRenderGoogleBuildings() {
  googleBuildingsLayerGroup.clearLayers();
  const toggleEl = document.getElementById('toggle-google-buildings');
  const kecEl = document.getElementById('filter-kec');
  const statusEl = document.getElementById('upload-status');
  const metricEl = document.getElementById('metric-google-drawn');

  const isChecked = toggleEl ? toggleEl.checked : false;
  const kdKec = kecEl && kecEl.value ? String(kecEl.value).trim() : '';

  if (!kdKec || !isChecked) {
    if (metricEl) metricEl.innerText = "0";
    if (!kdKec && isChecked && statusEl) {
      statusEl.innerText = "💡 Google Buildings hanya aktif saat Kecamatan dipilih";
    }
    return;
  }

  const cacheKey = `google_buildings_kec_${kdKec}`;
  let allKecPoints = googleBuildingsCache.get(kdKec);

  // A. Cek Cache Memori / IndexedDB Disk
  if (!allKecPoints) {
    if (statusEl) statusEl.innerText = "🔍 Memeriksa cache penyimpanan lokal browser...";
    
    // Cek dari IndexedDB lewat helper dbCache / idbKeyval
    allKecPoints = await getLayerCacheFromIDB(cacheKey);

    if (!allKecPoints) {
      if (window.idbKeyval) {
        allKecPoints = await idbKeyval.get(cacheKey);
      } else {
        allKecPoints = await LocalDb.get(cacheKey);
      }
    }

    if (allKecPoints && allKecPoints.length > 0) {
      googleBuildingsCache.set(kdKec, allKecPoints);
      console.log(`⚡ [IndexedDB] Data Google Buildings Kec. ${kdKec} dimuat dari Cache Disk (0 KB Egress)`);
    }
  }

  // B. Unduh dari Server Jika Belum Ada di Local Storage
  if (!allKecPoints) {
    if (isDownloadingGoogle) return;
    setIsDownloadingGoogle(true);

    allKecPoints = [];
    const chunkSize = 2000;
    let offset = 0;
    let hasMore = true;

    updateDownloadProgress(true, `Mengunduh Asset Kec. ${kdKec}...`, 5, "Mempersiapkan data dari server...");

    try {
      while (hasMore) {
        const { data: batchData, error } = await supabaseClient
          .rpc('get_google_buildings_paged', {
            target_kd_kec: kdKec,
            page_limit: chunkSize,
            page_offset: offset
          });

        if (error) {
          console.error("Gagal mengunduh batch Google Buildings:", error);
          if (statusEl) statusEl.innerText = "⚠️ Gagal mengunduh data paket Google";
          updateDownloadProgress(false);
          setIsDownloadingGoogle(false);
          return;
        }

        const currentBatch = batchData || [];
        allKecPoints.push(...currentBatch);

        if (currentBatch.length < chunkSize) {
          hasMore = false;
        } else {
          offset += chunkSize;
        }

        const estimatedTotal = Math.max(allKecPoints.length + 2000, 10000);
        const calcPercent = hasMore ? Math.min(Math.round((allKecPoints.length / estimatedTotal) * 100), 95) : 100;

        updateDownloadProgress(
          true, 
          `Mengunduh Asset Kec. ${kdKec}...`, 
          calcPercent, 
          `Tergugat: ${allKecPoints.length.toLocaleString('id-ID')} titik`
        );
      }

      googleBuildingsCache.set(kdKec, allKecPoints);

      // Simpan ke IndexedDB
      await setLayerCacheToIDB(cacheKey, allKecPoints);
      if (window.idbKeyval) {
        await idbKeyval.set(cacheKey, allKecPoints);
      }

      updateDownloadProgress(true, `Selesai Mengunduh!`, 100, `Total ${allKecPoints.length.toLocaleString('id-ID')} titik tersimpan di Cache Browser`);
      setTimeout(() => updateDownloadProgress(false), 1500);

    } catch (err) {
      console.error("Terjadi kesalahan unduh:", err);
      updateDownloadProgress(false);
    } finally {
      setIsDownloadingGoogle(false);
    }
  }

  // Render Spasial berdasarkan Bounding Viewport Peta
  const filteredSlsSet = new Set(getFilteredData().map(d => String(d.kd_sls)));
  const mapBounds = map.getBounds();
  let count = 0;

  allKecPoints.forEach(b => {
    if (filteredSlsSet.size > 0 && !filteredSlsSet.has(String(b.kd_sls))) return;

    let lat, lng;
    if (b.geom && b.geom.coordinates) [lng, lat] = b.geom.coordinates;

    if (lat && lng) {
      if (!mapBounds.contains([lat, lng])) return;

      count++;
      const circle = L.circleMarker([lat, lng], {
        interactive: true,
        radius: 2.5,
        fillColor: "#FBBF24",
        color: "#D97706",
        weight: 0.5,
        fillOpacity: 0.75
      }).bindPopup(`
        <div class="text-xs text-gray-800 font-sans">
          <strong class="text-yellow-700 block mb-1">🟡 Fisik Rumah (Google Building)</strong>
          <div>Luas Bangunan: <b>${b.area_in_meters || '-'} m²</b></div>
          <div class="text-[10px] text-gray-500 mt-1">Kode SLS: <code>${b.kd_sls}</code></div>
        </div>
      `);

      googleBuildingsLayerGroup.addLayer(circle);
    }
  });

  if (statusEl) statusEl.innerText = `⚡ ${count.toLocaleString('id-ID')} titik Google dimuat dari Cache (Total: ${allKecPoints.length.toLocaleString('id-ID')})`;
  if (metricEl) metricEl.innerText = count.toLocaleString('id-ID');
}

// =========================================================================
// 2. DB TAGGING (SMART INDEXEDDB & ZERO-EGRESS FETCHING)
// =========================================================================
export async function fetchAndRenderDbTagging(forceRefetch = false) {
  dbTaggingLayerGroup.clearLayers();
  const isChecked = document.getElementById('toggle-tagging-db')?.checked;
  
  const pmlVal = document.getElementById('filter-pml')?.value || '';
  const pclVal = document.getElementById('filter-pcl')?.value || '';
  const kecVal = document.getElementById('filter-kec')?.value || '';
  const selectedJenis = getSelectedJenisArray();

  if ((!kecVal && !pmlVal && !pclVal) || !isChecked || selectedJenis.length === 0) {
    const statusEl = document.getElementById('upload-status');
    if (statusEl) {
      statusEl.innerText = (!kecVal && !pmlVal && !pclVal) ? "💡 Titik disembunyikan di Level Kabupaten" : "";
    }
    const metricEl = document.getElementById('metric-db-tagging');
    if (metricEl) metricEl.innerText = "0";
    return;
  }

  // Master Cache Key Terikat pada Cakupan Wilayah Utama
  const masterFetchKey = `db_tagging_kec_${kecVal}_pml_${pmlVal}_pcl_${pclVal}`;

  // A. CEK CACHE MEMORI RAM (0 KB Egress / Instan)
  if (!forceRefetch && masterFetchKey === lastFetchFilterKey && cachedDbPoints.length > 0) {
    renderDbTaggingFromCache();
    return;
  }

  // B. CEK CACHE INDEXEDDB DISK LOKAL (0 KB Egress)
  if (!forceRefetch) {
    const idbData = await getLayerCacheFromIDB(masterFetchKey);
    if (idbData && idbData.length > 0) {
      console.log(`⚡ [IndexedDB] Memuat ${idbData.length.toLocaleString('id-ID')} titik DB Tagging dari Disk Lokal (0 KB Egress)`);
      setCachedDbPoints(idbData);
      setLastFetchFilterKey(masterFetchKey);
      renderDbTaggingFromCache();

      const statusEl = document.getElementById('upload-status');
      if (statusEl) {
        statusEl.innerText = `⚡ ${idbData.length.toLocaleString('id-ID')} titik dimuat dari Cache Disk Lokal`;
      }
      return;
    }
  }

  // C. JIKA TIDAK ADA DI INDEXEDDB, AMBIL DARI SUPABASE (1 SINGLE REQUEST)
  const statusEl = document.getElementById('upload-status');
  if (statusEl) {
    statusEl.innerText = "⏳ Memuat data tagging dari server...";
    statusEl.classList.add('status-loading');
  }

  showMapLoader("Mempersiapkan data tagging...");

  try {
    let slsSource = rawData || [];
    if (kecVal) slsSource = slsSource.filter(d => String(d.kd_kec) === String(kecVal));
    if (pmlVal) slsSource = slsSource.filter(d => String(d.email_pml) === String(pmlVal));
    if (pclVal) slsSource = slsSource.filter(d => String(d.email_pcl) === String(pclVal));

    const activeSlsCodes = Array.from(new Set(slsSource.map(d => String(d.kd_sls))));
    
    if (activeSlsCodes.length === 0) {
      hideMapLoader();
      if (statusEl) {
        statusEl.innerText = "⚠️ Tidak ada data SLS ditemukan untuk filter ini.";
        statusEl.classList.remove('status-loading');
      }
      return;
    }

    showMapLoader(`Mengunduh titik tagging (${activeSlsCodes.length} SLS)...`);

    // 1 Kueri tunggal untuk mengunduh seluruh jenis bangunan di kecamatan ini
    const { data: remotePoints, error } = await supabaseClient
      .from('view_tagged_buildings_analysis')
      .select('id, no_bang, nama_bang, jenis_bangunan, kd_sls, geom, is_cluster, is_outside_boundary')
      .in('kd_sls', activeSlsCodes);

    if (error) throw error;

    const allPoints = remotePoints || [];

    // Simpan ke Memori RAM & IndexedDB Disk
    setCachedDbPoints(allPoints);
    setLastFetchFilterKey(masterFetchKey);
    await setLayerCacheToIDB(masterFetchKey, allPoints);

    renderDbTaggingFromCache();

    if (statusEl) {
      statusEl.innerText = `✅ Berhasil memuat ${allPoints.length.toLocaleString('id-ID')} titik tagging (Tersimpan di Cache IDB)`;
    }

  } catch (err) {
    console.error("Terjadi kesalahan saat memuat data tagging:", err);
    if (statusEl) statusEl.innerText = "⚠️ Gagal mengambil data tagging dari server: " + (err.message || err);
  } finally {
    hideMapLoader();
    if (statusEl) statusEl.classList.remove('status-loading');
  }
}

// RENDER INSTAN DARI CACHE DENGAN EFEK MEMBAL HOVER MURNI CSS (TANPA LOMPAT)
export function renderDbTaggingFromCache() {
  dbTaggingLayerGroup.clearLayers();

  const kecVal = document.getElementById('filter-kec')?.value || '';
  const desaVal = document.getElementById('filter-desa')?.value || '';
  const slsVal = document.getElementById('filter-sls')?.value || '';
  const selectedJenis = getSelectedJenisArray();
  const selectedJenisSet = new Set(selectedJenis);

  const toggleLabelsEl = document.getElementById('toggle-detailed-labels');
  const isLabelToggleActive = toggleLabelsEl ? toggleLabelsEl.checked : true;

  const currentZoom = map.getZoom();
  const isShowDetailedLabel = currentZoom >= 19 && isLabelToggleActive;

  const isFilterActive = (desaVal || slsVal) ? true : false;
  const isBadgeMode = isFilterActive && !isShowDetailedLabel;

  const mapBounds = map.getBounds();

  let count = 0;
  let renderedLabelsCount = 0;
  const MAX_PERMANENT_LABELS = 500;

  // 1. FILTER TITIK TERLIHAT
  const visiblePoints = [];
  cachedDbPoints.forEach(pt => {
    if (selectedJenisSet.size > 0 && !selectedJenisSet.has(Number(pt.jenis_bangunan))) return;

    const slsInfo = slsLookupMap.get(String(pt.kd_sls)) || {};

    if (slsVal && String(pt.kd_sls) !== String(slsVal)) return;
    if (desaVal && String(slsInfo.kd_desa) !== String(desaVal)) return;
    if (kecVal && String(slsInfo.kd_kec) !== String(kecVal)) return;

    let lat, lng;
    if (pt.geom && pt.geom.coordinates) [lng, lat] = pt.geom.coordinates;

    if (lat && lng && mapBounds.contains([lat, lng])) {
      visiblePoints.push({ pt, lat, lng, slsInfo });
    }
  });

  count = visiblePoints.length;

  // 2. GRID CLUSTERING UNTUK SPIRAL
  const clustersMap = new Map();
  const PRECISION = 0.00015;

  visiblePoints.forEach(item => {
    const gridKey = `${Math.round(item.lat / PRECISION)}_${Math.round(item.lng / PRECISION)}`;
    if (!clustersMap.has(gridKey)) {
      clustersMap.set(gridKey, []);
    }
    clustersMap.get(gridKey).push(item);
  });

  // 3. RENDER MARKER & DETAIL LABELS
  clustersMap.forEach(group => {
    const groupSize = group.length;

    group.forEach((item, indexInGroup) => {
      const { pt, lat, lng, slsInfo } = item;
      const style = getJenisBangunanStyle(pt.jenis_bangunan);

      const popupHtml = `
        <div class="text-xs text-gray-800 font-sans min-w-[210px] p-1">
          <div class="font-bold text-gray-900 text-sm border-b pb-1 mb-1.5 flex items-center justify-between">
            <span class="flex items-center gap-1">${style.icon} <span class="truncate max-w-[140px]">${pt.nama_bang || 'Titik Tagging Field'}</span></span>
            <span class="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300 font-bold shrink-0">Field DB</span>
          </div>
          <div class="grid grid-cols-2 gap-x-2 gap-y-1 my-1.5 bg-gray-50 p-2 rounded border border-gray-200">
            <div>
              <span class="text-gray-500 text-[10px] block uppercase">No. Bangunan</span>
              <b class="font-bold text-gray-900 text-xs">#${pt.no_bang || '-'}</b>
            </div>
            <div>
              <span class="text-gray-500 text-[10px] block uppercase">Jenis Bangunan</span>
              <b style="color: ${style.color}" class="text-xs">${pt.jenis_bangunan ? `${pt.jenis_bangunan}. ${style.label}` : '-'}</b>
            </div>
            <div class="col-span-2 pt-1 border-t border-gray-200">
              <span class="text-gray-500 text-[10px] block uppercase">Nama Bangunan</span>
              <b class="font-bold text-emerald-700 text-xs">${pt.nama_bang || '-'}</b>
            </div>
          </div>
          <div class="space-y-0.5 text-[11px] my-1">
            <div>Kecamatan: <b>KEC. ${slsInfo.nmkec || '-'}</b></div>
            <div>Desa: <b>DESA ${slsInfo.nmdesa || '-'}</b></div>
            <div>Wilayah SLS: <b>${slsInfo.nama_sls || '-'}</b></div>
            <div class="text-[10px] text-gray-500">Kode SLS: <code class="bg-gray-100 px-1 py-0.5 rounded">${pt.kd_sls || '-'}</code></div>
          </div>
          <hr class="my-1.5 border-gray-200">
          <div class="space-y-0.5 text-[11px] bg-slate-100 p-1.5 rounded border border-slate-200">
            <div>👤 PCL / PPL: <b>${slsInfo.nama_pcl || 'Belum Ditunjuk'}</b></div>
            <div>👔 PML: <b>${slsInfo.nama_pml || '-'}</b></div>
          </div>
        </div>
      `;

      if (isBadgeMode) {
        const noText = pt.no_bang ? `${pt.no_bang}` : '?';
        let bgColor = style.fillColor || style.color || '#10b981';

        if (pt.is_cluster && pt.is_outside_boundary) bgColor = '#DC2626';
        else if (pt.is_cluster || pt.is_outside_boundary) bgColor = '#D97706';

        const badgeIcon = L.divIcon({
          className: 'custom-num-badge-container',
          html: `<div class="num-badge-marker" style="background-color: ${bgColor};">${noText}</div>`,
          iconSize: [24, 16],
          iconAnchor: [12, 8]
        });

        const badgeMarker = L.marker([lat, lng], { icon: badgeIcon });
        badgeMarker.bindPopup(popupHtml);
        dbTaggingLayerGroup.addLayer(badgeMarker);

      } else {
        let circleColor = style.color;
        let circleFill = style.fillColor;

        if (pt.is_cluster && pt.is_outside_boundary) {
          circleColor = "#991B1B";
          circleFill = "#EF4444";
        } else if (pt.is_cluster || pt.is_outside_boundary) {
          circleColor = "#B45309";
          circleFill = "#F59E0B";
        }

        const circle = L.circleMarker([lat, lng], {
          interactive: true,
          radius: 5.5,
          fillColor: circleFill,
          color: circleColor,
          weight: 1.5,
          fillOpacity: 0.95
        });

        circle.bindPopup(popupHtml);

        if (isShowDetailedLabel && renderedLabelsCount < MAX_PERMANENT_LABELS) {
          const noText = pt.no_bang ? `#${pt.no_bang}` : '';
          const nameText = pt.nama_bang ? `${pt.nama_bang}` : 'Tanpa Nama';
          const slsNameText = slsInfo.nama_sls || 'SLS ?';

          let boxStyleClass = "bg-white/95 border-slate-300 text-slate-800 shadow-sm";
          let noTextClass = "text-emerald-700 font-bold";
          let subTextClass = "text-gray-500 border-gray-200/80";
          let statusDot = "";

          if (pt.is_cluster && pt.is_outside_boundary) {
            boxStyleClass = "bg-red-600 border-red-700 text-white shadow font-semibold";
            noTextClass = "text-yellow-300 font-extrabold";
            subTextClass = "text-red-100 border-red-500/80";
            statusDot = `<span class="inline-block w-1.5 h-1.5 bg-yellow-300 rounded-full ml-1 animate-ping"></span>`;
          } 
          else if (pt.is_cluster || pt.is_outside_boundary) {
            boxStyleClass = "bg-amber-400 border-amber-500 text-slate-900 shadow font-semibold";
            noTextClass = "text-slate-950 font-extrabold";
            subTextClass = "text-amber-900 border-amber-600/50";
            statusDot = `<span class="inline-block w-1.5 h-1.5 bg-amber-900 rounded-full ml-1"></span>`;
          }

          const labelContent = `
            <div class="px-1.5 py-0.5 rounded border leading-tight text-center ${boxStyleClass}">
              <div class="text-[10px] flex items-center justify-center gap-0.5 whitespace-nowrap">
                <span class="${noTextClass}">${noText}</span>
                <span class="truncate max-w-[110px]">${nameText}</span>
                ${statusDot}
              </div>
              <div class="text-[8px] border-t mt-0.5 pt-0.5 truncate max-w-[120px] font-normal leading-none ${subTextClass}">${slsNameText}</div>
            </div>
          `;

          let offsetX = 14;
          let offsetY = 0;
          let tooltipDir = 'right';

          if (groupSize > 1) {
            const pointsPerRing = 6;
            const ringIndex = Math.floor(indexInGroup / pointsPerRing);
            const positionInRing = indexInGroup % pointsPerRing;

            const radius = 40 + (ringIndex * 35); 
            const angle = (positionInRing * (2 * Math.PI / pointsPerRing)) + (ringIndex * 0.5);

            offsetX = Math.round(Math.cos(angle) * radius);
            offsetY = Math.round(Math.sin(angle) * radius);

            if (offsetX < -12) tooltipDir = 'left';
            else if (offsetX > 12) tooltipDir = 'right';
            else if (offsetY < 0) tooltipDir = 'top';
            else tooltipDir = 'bottom';
          }

          renderedLabelsCount++;

          circle.bindTooltip(labelContent, {
            permanent: true,
            direction: tooltipDir,
            className: 'no-bang-label',
            offset: [offsetX, offsetY]
          });

          // Leader Line
          if (groupSize > 1) {
            const ptContainer = map.latLngToContainerPoint([lat, lng]);
            const targetLatLng = map.containerPointToLatLng([
              ptContainer.x + offsetX,
              ptContainer.y + offsetY
            ]);

            const leaderLine = L.polyline([[lat, lng], targetLatLng], {
              className: 'leader-line-style',
              color: circleColor || '#64748b',
              weight: 1,
              dashArray: '2, 2',
              opacity: 0.6,
              interactive: false
            });

            dbTaggingLayerGroup.addLayer(leaderLine);
          }
        }

        dbTaggingLayerGroup.addLayer(circle);
      }
    });
  });

  const statusEl = document.getElementById('upload-status');
  if (statusEl) statusEl.innerText = `✅ ${count.toLocaleString('id-ID')} titik tampak dimuat (Total Cache: ${cachedDbPoints.length.toLocaleString('id-ID')})`;
  const metricDbEl = document.getElementById('metric-db-tagging');
  if (metricDbEl) metricDbEl.innerText = cachedDbPoints.length.toLocaleString('id-ID');
}

// =========================================================================
// 3. ANOMALI CLUSTER (INDEXEDDB SMART CACHING)
// =========================================================================
export async function fetchAndRenderAnomaliCluster(forceRefetch = false) {
  anomaliClusterLayerGroup.clearLayers();
  const isChecked = document.getElementById('toggle-anomali-cluster')?.checked;
  
  const pmlVal = document.getElementById('filter-pml')?.value || '';
  const pclVal = document.getElementById('filter-pcl')?.value || '';
  const kecVal = document.getElementById('filter-kec')?.value || '';

  if ((!kecVal && !pmlVal && !pclVal) || !isChecked) {
    const metricEl = document.getElementById('metric-anomali');
    if (metricEl) metricEl.innerText = "0";
    setCachedAnomaliPoints([]);
    return;
  }

  const masterAnomaliKey = `anomali_kec_${kecVal}_pml_${pmlVal}_pcl_${pclVal}`;

  // A. CEK CACHE MEMORI RAM
  if (!forceRefetch && masterAnomaliKey === lastAnomaliFilterKey && cachedAnomaliPoints.length > 0) {
    renderAnomaliClusterFromCache();
    return;
  }

  // B. CEK CACHE INDEXEDDB DISK LOKAL
  if (!forceRefetch) {
    const idbData = await getLayerCacheFromIDB(masterAnomaliKey);
    if (idbData && idbData.length > 0) {
      console.log(`⚡ [IndexedDB] Memuat ${idbData.length} data anomali dari Disk Lokal (0 KB Egress)`);
      setCachedAnomaliPoints(idbData);
      setLastAnomaliFilterKey(masterAnomaliKey);
      renderAnomaliClusterFromCache();
      return;
    }
  }

  // C. JIKA TIDAK ADA DI IDB, AMBIL DARI SUPABASE (1 SINGLE REQUEST)
  const activeSlsCodes = Array.from(new Set(getFilteredData().map(d => String(d.kd_sls))));
  if (activeSlsCodes.length === 0) return;

  try {
    const { data: anomalies, error } = await supabaseClient
      .from('view_anomali_tagging_mengumpul')
      .select('kd_sls, no_bang, nama_bang, jenis_bangunan, geom, nmkec, nmdesa, nama_sls, nama_pcl, nama_pml')
      .in('kd_sls', activeSlsCodes);

    if (error) throw error;

    const allAnomalies = anomalies || [];

    // Simpan ke Memori RAM & IndexedDB Disk
    setCachedAnomaliPoints(allAnomalies);
    setLastAnomaliFilterKey(masterAnomaliKey);
    await setLayerCacheToIDB(masterAnomaliKey, allAnomalies);

    renderAnomaliClusterFromCache();

  } catch (err) {
    console.error("Terjadi kesalahan tak terduga saat memuat anomali cluster:", err);
  }
}

export function renderAnomaliClusterFromCache() {
  anomaliClusterLayerGroup.clearLayers();

  if (!cachedAnomaliPoints || cachedAnomaliPoints.length === 0) {
    const metricEl = document.getElementById('metric-anomali');
    if (metricEl) metricEl.innerText = "0";
    return;
  }

  const kecVal = document.getElementById('filter-kec')?.value || '';
  const desaVal = document.getElementById('filter-desa')?.value || '';
  const slsVal = document.getElementById('filter-sls')?.value || '';

  const uniqueAnomalies = [];
  const seenKeys = new Set();

  cachedAnomaliPoints.forEach((item) => {
    const slsInfo = slsLookupMap.get(String(item.kd_sls)) || {};
    if (slsVal && String(item.kd_sls) !== String(slsVal)) return;
    if (desaVal && String(slsInfo.kd_desa) !== String(desaVal)) return;
    if (kecVal && String(slsInfo.kd_kec) !== String(kecVal)) return;

    if (!item.geom || !item.geom.coordinates) return;
    const [lng, lat] = item.geom.coordinates;
    const uniqueKey = `${lat}_${lng}_${item.no_bang || ''}_${item.kd_sls}`;
    
    if (!seenKeys.has(uniqueKey)) {
      seenKeys.add(uniqueKey);
      uniqueAnomalies.push(item);
    }
  });

  const clusters = [];
  const visited = new Set();

  uniqueAnomalies.forEach((item, index) => {
    if (visited.has(index)) return;

    let [lng, lat] = item.geom.coordinates;
    const currentCluster = [item];
    visited.add(index);

    for (let j = index + 1; j < uniqueAnomalies.length; j++) {
      if (visited.has(j)) continue;

      const other = uniqueAnomalies[j];
      let [oLng, oLat] = other.geom.coordinates;
      const dist = getDistanceInMeters(lat, lng, oLat, oLng);

      if (dist <= 15) {
        currentCluster.push(other);
        visited.add(j);
      }
    }
    clusters.push(currentCluster);
  });

  let totalPointsCount = 0;
  const currentZoom = map.getZoom();
  const mapBounds = map.getBounds();

  clusters.forEach(clusterGroup => {
    const pointCount = clusterGroup.length;

    let sumLat = 0, sumLng = 0;
    clusterGroup.forEach(pt => {
      let [lng, lat] = pt.geom.coordinates;
      sumLat += lat;
      sumLng += lng;
    });
    const centerLat = sumLat / pointCount;
    const centerLng = sumLng / pointCount;

    if (!mapBounds.contains([centerLat, centerLng])) return;

    totalPointsCount += pointCount;

    let maxDist = 0;
    clusterGroup.forEach(pt => {
      let [lng, lat] = pt.geom.coordinates;
      const d = getDistanceInMeters(centerLat, centerLng, lat, lng);
      if (d > maxDist) maxDist = d;
    });
    const zoneRadius = Math.max(maxDist + 6, 10);

    if (currentZoom < 16) {
      const summaryIcon = L.divIcon({
        className: 'custom-cluster-badge-container',
        html: `<div class="cluster-summary-badge">⚠️ ${pointCount} Titik Mengumpul</div>`,
        iconSize: [150, 26],
        iconAnchor: [75, 32] 
      });

      const summaryMarker = L.marker([centerLat, centerLng], { icon: summaryIcon });
      summaryMarker.on('click', () => {
        map.setView([centerLat, centerLng], 17);
      });

      anomaliClusterLayerGroup.addLayer(summaryMarker);

      const centerPoint = L.circleMarker([centerLat, centerLng], {
        radius: 5,
        fillColor: "#EF4444",
        color: "#FFFFFF",
        weight: 2,
        fillOpacity: 0.9,
        interactive: false
      });
      anomaliClusterLayerGroup.addLayer(centerPoint);

    } else {
      const clusterZone = L.circle([centerLat, centerLng], {
        radius: zoneRadius,
        color: "#EF4444",
        fillColor: "#F87171",
        fillOpacity: 0.2,
        weight: 1.5,
        className: "cluster-zone-bg",
        interactive: false
      });
      anomaliClusterLayerGroup.addLayer(clusterZone);

      const offsetY = Math.min(Math.max(zoneRadius * 2.2, 28), 55); 
      const zoneHeaderIcon = L.divIcon({
        className: 'custom-cluster-header-container',
        html: `<div class="cluster-zone-header-badge">🔴 ${pointCount} Titik</div>`,
        iconSize: [80, 22],
        iconAnchor: [40, offsetY]
      });

      const zoneHeaderMarker = L.marker([centerLat, centerLng], { 
        icon: zoneHeaderIcon,
        interactive: false 
      });
      anomaliClusterLayerGroup.addLayer(zoneHeaderMarker);

      clusterGroup.forEach(item => {
        let [lng, lat] = item.geom.coordinates;
        const slsInfo = slsLookupMap.get(String(item.kd_sls)) || {};
        const style = getJenisBangunanStyle(item.jenis_bangunan);

        const anomaliPopupHtml = `
          <div class="text-xs text-gray-800 font-sans min-w-[210px] p-1">
            <div class="font-bold text-red-900 text-sm border-b pb-1 mb-1 flex items-center justify-between gap-1">
              <span class="flex items-center gap-1 truncate max-w-[140px]">${style.icon} <span>${item.nama_bang || 'Titik Bangunan'}</span></span>
              <span class="text-[9px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded border border-red-300 font-bold shrink-0">Menumpuk</span>
            </div>

            <div class="bg-red-50 text-red-900 p-1.5 rounded text-[10px] font-semibold mb-1.5 border border-red-200">
              ⚠️ Terdeteksi Tagging Menumpuk (${pointCount} titik dalam klaster)
            </div>

            <div class="grid grid-cols-2 gap-x-2 gap-y-1 my-1.5 bg-gray-50 p-2 rounded border border-gray-200">
              <div>
                <span class="text-gray-500 text-[10px] block uppercase">No. Bangunan</span>
                <b class="font-bold text-gray-900 text-xs">#${item.no_bang || '-'}</b>
              </div>
              <div>
                <span class="text-gray-500 text-[10px] block uppercase">Jenis Bangunan</span>
                <b style="color: ${style.color}" class="text-xs">${item.jenis_bangunan ? `${item.jenis_bangunan}. ${style.label}` : (item.jenis_bangunan || '-')}</b>
              </div>
              <div class="col-span-2 pt-1 border-t border-gray-200">
                <span class="text-gray-500 text-[10px] block uppercase">Nama Bangunan</span>
                <b class="font-bold text-red-700 text-xs">${item.nama_bang || '-'}</b>
              </div>
            </div>

            <div class="space-y-0.5 text-[11px] my-1">
              <div>Kecamatan: <b>KEC. ${item.nmkec || slsInfo.nmkec || '-'}</b></div>
              <div>Desa: <b>DESA ${item.nmdesa || slsInfo.nmdesa || '-'}</b></div>
              <div>Wilayah SLS: <b>${item.nama_sls || slsInfo.nama_sls || '-'}</b></div>
              <div class="text-[10px] text-gray-500">Kode SLS: <code class="bg-gray-100 px-1 py-0.5 rounded">${item.kd_sls || '-'}</code></div>
            </div>

            <hr class="my-1.5 border-gray-200">

            <div class="space-y-0.5 text-[11px] bg-slate-100 p-1.5 rounded border border-slate-200">
              <div>👤 PCL / PPL: <b>${item.nama_pcl || slsInfo.nama_pcl || 'Belum Ditunjuk'}</b></div>
              <div>👔 PML: <b>${item.nama_pml || slsInfo.nama_pml || '-'}</b></div>
            </div>
          </div>
        `;

        const pointMarker = L.circleMarker([lat, lng], {
          interactive: true,
          radius: 6.5,
          fillColor: style.fillColor,
          color: "#FFFFFF",
          weight: 2,
          fillOpacity: 0.95
        });

        pointMarker.bindPopup(anomaliPopupHtml);
        anomaliClusterLayerGroup.addLayer(pointMarker);
      });
    }
  });

  const metricAnomaliEl = document.getElementById('metric-anomali');
  if (metricAnomaliEl) metricAnomaliEl.innerText = totalPointsCount.toLocaleString('id-ID');
}

// =========================================================================
// 4. DASHBOARD SLS & SIDEBAR (O(N) MAP LOOKUP OPTIMIZED)
// =========================================================================
export function renderDashboard(data) {
  slsLayerGroup.clearLayers();
  const listContainer = document.getElementById('sls-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  let totalGap = 0, countKritis = 0;
  const currentZoom = map.getZoom();
  const mapBounds = map.getBounds();

  // Optimasi Hash Map untuk pencarian titik SLS berkecepatan 0 ms
  const dbPointsMapBySls = new Map();
  cachedDbPoints.forEach(pt => {
    const slsCode = String(pt.kd_sls).trim();
    if (!dbPointsMapBySls.has(slsCode)) {
      dbPointsMapBySls.set(slsCode, []);
    }
    dbPointsMapBySls.get(slsCode).push(pt);
  });

  data.forEach(item => {
    const itemSlsCode = String(item.kd_sls).trim();
    const csvCount = uploadedTaggingMap.get(itemSlsCode) || 0;
    const totalTagged = (item.total_realisasi_tagging || 0) + csvCount;
    
    const btt = item.btt_pemetaan || 0;
    const bttk = item.bttk_pemetaan || 0;
    const bku = item.bku_pemetaan || 0;
    const bbttnu = item.bbttnu_pemetaan || 0;

    const targetMuatan = item.total_muatan_pemetaan || (btt + bttk + bku + bbttnu);

    const gap = targetMuatan - totalTagged;
    if (gap > 0) totalGap += gap;

    let computedStatus = 'AMAN';
    let color = "#3B82F6"; 

    if ((totalTagged === 0 && targetMuatan > 10) || gap >= 50) {
      computedStatus = 'KRITIS';
      color = "#EF4444"; 
      countKritis++;
    } 
    else if (gap >= 40) {
      computedStatus = 'PERHATIAN (TINGGI)';
      color = "#F97316"; 
    } 
    else if (gap >= 20) {
      computedStatus = 'PERHATIAN';
      color = "#F59E0B"; 
    }

    const slsPoints = dbPointsMapBySls.get(itemSlsCode) || [];

    const realisasiBtt = slsPoints.filter(pt => {
      const j = Number(pt.jenis_bangunan);
      return j === 2 || j === 3;
    }).length;

    const realisasiBku = slsPoints.filter(pt => Number(pt.jenis_bangunan) === 1).length;

    const realisasiLainnya = slsPoints.filter(pt => {
      const j = Number(pt.jenis_bangunan);
      return ![1, 2, 3].includes(j);
    }).length;

    const targetBttkNu = bttk + bbttnu;

    if (item.geom) {
      const layer = L.geoJSON(item.geom, {
        style: { color: color, weight: 1.5, opacity: 0.9, fillOpacity: 0.3 }
      });

      const popupHtml = `
        <div class="text-gray-900 text-xs font-sans min-w-[240px] p-0.5">
          <div class="font-bold text-sm text-slate-800 border-b pb-1 mb-1.5 flex justify-between items-center gap-1">
            <span class="truncate">${item.nama_sls || item.nmsls}</span>
            <span class="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-300 shrink-0">${item.kd_sls}</span>
          </div>
          
          <div class="space-y-0.5 text-[11px] mb-2 text-slate-600">
            <div>👤 PCL / PPL: <b class="text-slate-800">${item.nama_pcl || 'Belum Ditunjuk'}</b></div>
            <div>👔 PML: <b class="text-slate-800">${item.nama_pml || '-'}</b></div>
          </div>

          <div class="bg-slate-50 p-2 rounded-lg border border-slate-200 mb-2">
            <div class="font-bold text-slate-700 text-[10px] uppercase mb-1.5 border-b pb-1 border-slate-200 flex justify-between items-center">
              <span>Jenis Muatan</span>
              <span class="text-slate-500 font-semibold">Tagging / Pemetaan</span>
            </div>
            
            <div class="space-y-1 text-[11px]">
              <div class="flex justify-between items-center">
                <span class="text-slate-600 font-medium">BKU <span class="text-[9px] text-slate-400">(Jenis 1)</span></span>
                <span class="font-mono">
                  <b class="${realisasiBku < bku ? 'text-amber-600' : 'text-emerald-700'}">${realisasiBku.toLocaleString('id-ID')}</b> / <b>${bku.toLocaleString('id-ID')}</b>
                </span>
              </div>

              <div class="flex justify-between items-center border-t border-slate-100 pt-1">
                <span class="text-slate-600 font-medium">BTT <span class="text-[9px] text-slate-400">(Jenis 2,3)</span></span>
                <span class="font-mono">
                  <b class="${realisasiBtt < btt ? 'text-amber-600' : 'text-emerald-700'}">${realisasiBtt.toLocaleString('id-ID')}</b> / <b>${btt.toLocaleString('id-ID')}</b>
                </span>
              </div>

              <div class="flex justify-between items-center border-t border-slate-100 pt-1">
                <span class="text-slate-600 font-medium">BTTK + NU <span class="text-[9px] text-slate-400">(Lainnya)</span></span>
                <span class="font-mono">
                  <b class="${realisasiLainnya < targetBttkNu ? 'text-amber-600' : 'text-emerald-700'}">${realisasiLainnya.toLocaleString('id-ID')}</b> / <b>${targetBttkNu.toLocaleString('id-ID')}</b>
                </span>
              </div>
            </div>
          </div>

          <div class="space-y-1 text-[11px] bg-emerald-50/70 p-2 rounded-lg border border-emerald-200">
            <div class="flex justify-between items-center">
              <span class="text-emerald-900 font-medium">📍 Total Realisasi Tagging:</span>
              <b class="text-emerald-800 text-xs font-mono">${totalTagged.toLocaleString('id-ID')} / ${targetMuatan.toLocaleString('id-ID')}</b>
            </div>
            <div class="flex justify-between items-center border-t border-emerald-200/80 pt-1">
              <span class="font-bold ${gap > 0 ? 'text-red-700' : 'text-emerald-700'}">🔴 Total Selisih Gap:</span>
              <b class="text-xs font-mono ${gap > 0 ? 'text-red-700 font-bold' : 'text-emerald-700'}">${gap.toLocaleString('id-ID')}</b>
            </div>
          </div>
        </div>
      `;

      layer.bindPopup(popupHtml);
      slsLayerGroup.addLayer(layer);

      if (currentZoom >= 18 && currentZoom <= 19) {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          const centerLatLng = bounds.getCenter();
          if (mapBounds.contains(centerLatLng)) {
            const polyLabelHtml = `
              <div class="sls-center-poly-label">
                <div class="sls-poly-title">${item.nama_sls || item.nmsls}</div>
                <div class="sls-poly-details">
                  <span>BTT:<b>${btt}</b></span> | <span>BKU:<b>${bku}</b></span> | <span>BTTK:<b>${bttk}</b></span> | <span>NU:<b>${bbttnu}</b></span>
                </div>
                <div class="sls-poly-tagging">
                  Tagging: <b>${totalTagged}</b> / <b>${targetMuatan}</b>
                </div>
              </div>
            `;

            const centerMarker = L.marker(centerLatLng, {
              icon: L.divIcon({
                className: 'custom-sls-center-label-container',
                html: polyLabelHtml,
                iconSize: [160, 42],
                iconAnchor: [80, 21]
              }),
              interactive: false
            });

            slsLayerGroup.addLayer(centerMarker);
          }
        }
      }
    }

    if (computedStatus !== 'AMAN') {
      const card = document.createElement('div');
      
      let borderColor = "border-amber-500";
      if (computedStatus === 'KRITIS') borderColor = "border-red-500";
      else if (gap >= 40) borderColor = "border-orange-500";

      card.className = `bg-slate-800/80 p-2.5 rounded-xl border-l-4 ${borderColor} hover:bg-slate-700/80 cursor-pointer text-xs transition shadow-sm`;

      card.innerHTML = `
        <div class="font-bold text-slate-100 text-[11px] truncate">${item.nama_sls || item.nmsls}</div>
        <div class="text-slate-400 text-[10px] mt-0.5">PCL: ${item.nama_pcl || '-'}</div>
        <div class="flex justify-between items-center text-[10px] text-slate-300 mt-1.5 pt-1 border-t border-slate-700/50">
          <span>Muatan: <b class="font-mono">${targetMuatan.toLocaleString('id-ID')}</b></span>
          <span class="font-bold" style="color: ${color}">Gap: ${gap.toLocaleString('id-ID')}</span>
        </div>
      `;
      
      card.addEventListener('click', () => {
        if (item.geom) {
          const tempGeo = L.geoJSON(item.geom);
          map.fitBounds(tempGeo.getBounds(), { maxZoom: 17 });
        }
      });

      listContainer.appendChild(card);
    }
  });

  const metricGapEl = document.getElementById('metric-gap');
  if (metricGapEl) metricGapEl.innerText = totalGap.toLocaleString('id-ID');
  
  const metricKritisEl = document.getElementById('metric-kritis');
  if (metricKritisEl) metricKritisEl.innerText = countKritis;

  const slsCountEl = document.getElementById('sls-count');
  if (slsCountEl) slsCountEl.innerText = `${data.length} SLS`;
}