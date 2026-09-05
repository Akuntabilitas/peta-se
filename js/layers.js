import { 
  googleBuildingsCache, isDownloadingGoogle, setIsDownloadingGoogle,
  cachedDbPoints, setCachedDbPoints, lastFetchFilterKey, setLastFetchFilterKey,
  slsLookupMap, uploadedTaggingMap 
} from './state.js';

import { showMapLoader, hideMapLoader, updateDownloadProgress, getDistanceInMeters, LocalDb } from './utils.js';
import { getFilteredData, getSelectedJenisArray } from './filters.js';

// --- GOOGLE BUILDINGS ---
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

  if (!allKecPoints) {
    if (statusEl) statusEl.innerText = "🔍 Memeriksa cache penyimpanan lokal browser...";
    
    if (window.idbKeyval) {
      allKecPoints = await idbKeyval.get(cacheKey);
    } else {
      allKecPoints = await LocalDb.get(cacheKey);
    }

    if (allKecPoints && allKecPoints.length > 0) {
      googleBuildingsCache.set(kdKec, allKecPoints);
      console.log(`⚡ Data Kec. ${kdKec} berhasil dimuat dari IndexedDB!`);
    }
  }

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

      if (window.idbKeyval) {
        await idbKeyval.set(cacheKey, allKecPoints);
      } else {
        await LocalDb.set(cacheKey, allKecPoints);
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

  const filteredSlsSet = new Set(getFilteredData().map(d => d.kd_sls));
  const mapBounds = map.getBounds();
  let count = 0;

  allKecPoints.forEach(b => {
    if (filteredSlsSet.size > 0 && !filteredSlsSet.has(b.kd_sls)) return;

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

// --- DB TAGGING ---
export async function fetchAndRenderDbTagging(forceRefetch = false) {
  dbTaggingLayerGroup.clearLayers();
  const isChecked = document.getElementById('toggle-tagging-db').checked;
  
  const filtered = getFilteredData();
  const pmlVal = document.getElementById('filter-pml').value;
  const pclVal = document.getElementById('filter-pcl').value;
  const kecVal = document.getElementById('filter-kec').value;
  const desaVal = document.getElementById('filter-desa').value;
  const slsVal = document.getElementById('filter-sls').value;
  const selectedJenis = getSelectedJenisArray();

  if ((!kecVal && !pmlVal && !pclVal) || !isChecked || selectedJenis.length === 0) {
    document.getElementById('upload-status').innerText = (!kecVal && !pmlVal && !pclVal) ? "💡 Titik disembunyikan di Level Kabupaten" : "";
    document.getElementById('metric-db-tagging').innerText = "0";
    return;
  }

  const currentFilterKey = `${kecVal}_${desaVal}_${slsVal}_${pmlVal}_${pclVal}_${selectedJenis.join(',')}`;

  if (!forceRefetch && currentFilterKey === lastFetchFilterKey && cachedDbPoints.length > 0) {
    renderDbTaggingFromCache();
    return;
  }

  const statusEl = document.getElementById('upload-status');
  if (statusEl) {
    statusEl.innerText = "⏳ Memuat titik tagging...";
    statusEl.classList.add('status-loading');
  }

  showMapLoader("Memuat titik bangunan...");

  const activeSlsCodes = filtered.map(d => d.kd_sls);
  if (activeSlsCodes.length === 0) {
    hideMapLoader();
    if (statusEl) statusEl.classList.remove('status-loading');
    return;
  }

// --- UBAH BAGIAN INI DI fetchAndRenderDbTagging ---
const { data: points, error } = await supabaseClient
  .from('view_tagged_buildings_analysis') // <- Ganti nama table ke View baru
  .select('id, no_bang, nama_bang, jenis_bangunan, kd_sls, geom, is_cluster, is_outside_boundary')
  .in('kd_sls', activeSlsCodes)
  .in('jenis_bangunan', selectedJenis);

  hideMapLoader();
  if (statusEl) statusEl.classList.remove('status-loading');

  if (error) return;

  setCachedDbPoints(points || []);
  setLastFetchFilterKey(currentFilterKey);

  renderDbTaggingFromCache();
}

export function renderDbTaggingFromCache() {
  dbTaggingLayerGroup.clearLayers();

  const kecVal = document.getElementById('filter-kec').value;
  const desaVal = document.getElementById('filter-desa').value;
  const slsVal = document.getElementById('filter-sls').value;
  const pclVal = document.getElementById('filter-pcl').value;

  const currentZoom = map.getZoom();
  const isShowDetailedLabel = currentZoom >= 20;
  const isFilterActive = (desaVal || slsVal || pclVal) ? true : false;
  const isBadgeMode = isFilterActive && !isShowDetailedLabel;

  const mapBounds = map.getBounds();

  let count = 0;
  let renderedLabelsCount = 0;
  const MAX_PERMANENT_LABELS = 500;
  const occupiedBoxes = [];

  const placementCandidates = [
    { x: 15, y: 0, dir: 'right' }, { x: -15, y: 0, dir: 'left' }, { x: 0, y: -18, dir: 'top' }, { x: 0, y: 18, dir: 'bottom' },
    { x: 18, y: -18, dir: 'right' }, { x: -18, y: -18, dir: 'left' }, { x: 18, y: 18, dir: 'right' }, { x: -18, y: 18, dir: 'left' },
    { x: 35, y: 0, dir: 'right' }, { x: -35, y: 0, dir: 'left' }, { x: 0, y: -35, dir: 'top' }, { x: 0, y: 35, dir: 'bottom' },
    { x: 32, y: -32, dir: 'right' }, { x: -32, y: -32, dir: 'left' }, { x: 32, y: 32, dir: 'right' }, { x: -32, y: 32, dir: 'left' },
    { x: 52, y: 0, dir: 'right' }, { x: -52, y: 0, dir: 'left' }, { x: 0, y: -52, dir: 'top' }, { x: 0, y: 52, dir: 'bottom' },
    { x: 48, y: -48, dir: 'right' }, { x: -48, y: -48, dir: 'left' }, { x: 48, y: 48, dir: 'right' }, { x: -48, y: 48, dir: 'left' },
    { x: 70, y: 0, dir: 'right' }, { x: -70, y: 0, dir: 'left' }, { x: 0, y: -70, dir: 'top' }, { x: 0, y: 70, dir: 'bottom' },
    { x: 65, y: -65, dir: 'right' }, { x: -65, y: -65, dir: 'left' }, { x: 65, y: 65, dir: 'right' }, { x: -65, y: 65, dir: 'left' }
  ];

  function isOverlapping(boxA, boxB) {
    return !(boxA.right < boxB.left || boxA.left > boxB.right || boxA.bottom < boxB.top || boxA.top > boxB.bottom);
  }

  cachedDbPoints.forEach(pt => {
    const slsInfo = slsLookupMap.get(pt.kd_sls) || {};

    if (slsVal && pt.kd_sls !== slsVal) return;
    if (desaVal && slsInfo.kd_desa !== desaVal) return;
    if (kecVal && slsInfo.kd_kec !== kecVal) return;

    let lat, lng;
    if (pt.geom && pt.geom.coordinates) [lng, lat] = pt.geom.coordinates;

    if (lat && lng) {
      if (!mapBounds.contains([lat, lng])) return;

      count++;
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

        // Penyesuaian warna mode badge sederhana
        if (pt.is_cluster && pt.is_outside_boundary) {
          bgColor = '#DC2626'; // Merah
        } else if (pt.is_cluster || pt.is_outside_boundary) {
          bgColor = '#D97706'; // Kuning / Amber
        }

        const badgeIcon = L.divIcon({
          className: 'custom-num-badge-container',
          html: `<div class="num-badge-marker" style="background-color: ${bgColor};">${noText}</div>`,
          iconSize: [28, 18],
          iconAnchor: [14, 9]
        });

        const badgeMarker = L.marker([lat, lng], { icon: badgeIcon });
        badgeMarker.bindPopup(popupHtml);
        dbTaggingLayerGroup.addLayer(badgeMarker);

      } else {
        // Tentukan warna marker lingkaran
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
          radius: 6,
          fillColor: circleFill,
          color: circleColor,
          weight: 1.5,
          fillOpacity: 0.95
        });

        circle.bindPopup(popupHtml);

        if (isShowDetailedLabel && renderedLabelsCount < MAX_PERMANENT_LABELS) {
          const noText = pt.no_bang ? `#${pt.no_bang}` : '';
          const nameText = pt.nama_bang ? `${pt.nama_bang}` : 'Tanpa Nama';
          const slsNameText = slsInfo.nama_sls || '-';

          // ==============================================================
          // PENYESUAIAN WARNA BACKGROUND, BORDER, DAN TEKS LABEL
          // ==============================================================
          let boxStyleClass = "bg-white/95 border-emerald-500 text-slate-800 shadow-md";
          let noTextClass = "text-emerald-700 font-extrabold";
          let subTextClass = "text-gray-500 border-gray-200";
          let badgeStatusHtml = "";

          // 1. KLASTER & LUAR WILAYAH (MERAH MENOLOK)
          if (pt.is_cluster && pt.is_outside_boundary) {
            boxStyleClass = "bg-red-600 border-red-800 text-white shadow-xl ring-2 ring-red-400/50 animate-pulse";
            noTextClass = "text-yellow-300 font-black";
            subTextClass = "text-red-100 border-red-500/80";
            badgeStatusHtml = `<span class="bg-red-950 text-red-200 text-[7.5px] px-1 rounded ml-1 font-bold border border-red-400">⚠️ KLASTER & LUAR SLS</span>`;
          } 
          // 2. HANYA KLASTER ATAU HANYA LUAR WILAYAH (KUNING/AMBER)
          else if (pt.is_cluster || pt.is_outside_boundary) {
            boxStyleClass = "bg-amber-400 border-amber-600 text-amber-950 shadow-lg ring-1 ring-amber-300";
            noTextClass = "text-amber-900 font-black";
            subTextClass = "text-amber-800 border-amber-500/60";
            
            if (pt.is_cluster) {
              badgeStatusHtml = `<span class="bg-amber-100 text-amber-900 text-[7.5px] px-1 rounded ml-1 font-bold border border-amber-500">Klaster</span>`;
            } else {
              badgeStatusHtml = `<span class="bg-amber-100 text-amber-900 text-[7.5px] px-1 rounded ml-1 font-bold border border-amber-500">Luar Wilayah</span>`;
            }
          }

          const labelContent = `
            <div class="px-2 py-1 rounded-md border-2 leading-tight text-center ${boxStyleClass}">
              <div class="text-[11px] font-bold"><span class="${noTextClass}">${noText}</span> ${nameText} ${badgeStatusHtml}</div>
              <div class="text-[8.5px] font-normal border-t mt-0.5 pt-0.5 truncate max-w-[150px] ${subTextClass}">${slsNameText}</div>
            </div>
          `;

          const pointContainer = map.latLngToContainerPoint([lat, lng]);
          const approxWidth = Math.min(Math.max((nameText.length + noText.length) * 6, slsNameText.length * 4.5) + 12, 150);
          const approxHeight = 24;

          let bestCandidate = null;

          for (let cand of placementCandidates) {
            const candBox = {
              left: pointContainer.x + cand.x - (cand.dir === 'left' ? approxWidth : 0),
              right: pointContainer.x + cand.x + (cand.dir === 'right' ? approxWidth : approxWidth / 2),
              top: pointContainer.y + cand.y - (cand.dir === 'top' ? approxHeight : approxHeight / 2),
              bottom: pointContainer.y + cand.y + (cand.dir === 'bottom' ? approxHeight : approxHeight / 2)
            };

            const hasConflict = occupiedBoxes.some(box => isOverlapping(candBox, box));

            if (!hasConflict) {
              bestCandidate = { cand, box: candBox };
              break;
            }
          }

          if (!bestCandidate) {
            const fallbackIdx = (renderedLabelsCount % 8) + 24;
            const cand = placementCandidates[fallbackIdx] || placementCandidates[placementCandidates.length - 1];
            const candBox = {
              left: pointContainer.x + cand.x,
              right: pointContainer.x + cand.x + approxWidth,
              top: pointContainer.y + cand.y,
              bottom: pointContainer.y + cand.y + approxHeight
            };
            bestCandidate = { cand, box: candBox };
          }

          occupiedBoxes.push(bestCandidate.box);
          renderedLabelsCount++;

          const choice = bestCandidate.cand;

          circle.bindTooltip(labelContent, {
            permanent: true,
            direction: choice.dir,
            className: 'no-bang-label',
            offset: [choice.x, choice.y]
          });

          const targetLatLng = map.containerPointToLatLng([
            pointContainer.x + choice.x,
            pointContainer.y + choice.y
          ]);

          const leaderLine = L.polyline([[lat, lng], targetLatLng], {
            className: 'leader-line-style',
            interactive: false
          });

          dbTaggingLayerGroup.addLayer(leaderLine);
        }

        dbTaggingLayerGroup.addLayer(circle);
      }
    }
  });

  document.getElementById('upload-status').innerText = `✅ ${count.toLocaleString('id-ID')} titik wilayah dimuat`;
  document.getElementById('metric-db-tagging').innerText = cachedDbPoints.length.toLocaleString('id-ID');
}

// --- ANOMALI CLUSTER ---
export async function fetchAndRenderAnomaliCluster() {
  anomaliClusterLayerGroup.clearLayers();
  const isChecked = document.getElementById('toggle-anomali-cluster').checked;
  
  const filtered = getFilteredData();
  const pmlVal = document.getElementById('filter-pml').value;
  const pclVal = document.getElementById('filter-pcl').value;
  const kecVal = document.getElementById('filter-kec').value;

  if ((!kecVal && !pmlVal && !pclVal) || !isChecked) {
    document.getElementById('metric-anomali').innerText = "0";
    return;
  }

  const activeSlsCodes = filtered.map(d => d.kd_sls);
  if (activeSlsCodes.length === 0) return;

  const { data: anomalies, error } = await supabaseClient
    .from('view_anomali_tagging_mengumpul')
    .select('*')
    .in('kd_sls', activeSlsCodes.slice(0, 500));

  if (error || !anomalies) return;

  const uniqueAnomalies = [];
  const seenKeys = new Set();

  anomalies.forEach((item) => {
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

  clusters.forEach(clusterGroup => {
    const pointCount = clusterGroup.length;
    totalPointsCount += pointCount;

    let sumLat = 0, sumLng = 0;
    clusterGroup.forEach(pt => {
      let [lng, lat] = pt.geom.coordinates;
      sumLat += lat;
      sumLng += lng;
    });
    const centerLat = sumLat / pointCount;
    const centerLng = sumLng / pointCount;

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
        const slsInfo = slsLookupMap.get(item.kd_sls) || {};
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

  document.getElementById('metric-anomali').innerText = totalPointsCount.toLocaleString('id-ID');
}

// --- DASHBOARD SLS & SIDEBAR ---
export function renderDashboard(data) {
  slsLayerGroup.clearLayers();
  const listContainer = document.getElementById('sls-list');
  listContainer.innerHTML = '';

  let totalGap = 0, countKritis = 0;
  const currentZoom = map.getZoom();
  const mapBounds = map.getBounds();

  data.forEach(item => {
    const csvCount = uploadedTaggingMap.get(item.kd_sls) || 0;
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

    if (totalTagged === 0 && targetMuatan > 10) {
      computedStatus = 'KRITIS';
      color = "#EF4444";
      countKritis++;
    } else if (gap >= 15) {
      computedStatus = 'PERHATIAN';
      color = "#F59E0B";
    }

    if (item.geom) {
      const layer = L.geoJSON(item.geom, {
        style: { color: color, weight: 1.5, opacity: 0.9, fillOpacity: 0.3 }
      });

      const popupHtml = `
        <div class="text-gray-900 text-xs font-sans min-w-[220px] p-0.5">
          <div class="font-bold text-sm text-slate-800 border-b pb-1 mb-1.5 flex justify-between items-center gap-1">
            <span class="truncate">${item.nama_sls || item.nmsls}</span>
            <span class="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-300 shrink-0">${item.kd_sls}</span>
          </div>
          
          <div class="space-y-0.5 text-[11px] mb-2 text-slate-600">
            <div>👤 PCL / PPL: <b class="text-slate-800">${item.nama_pcl || 'Belum Ditunjuk'}</b></div>
            <div>👔 PML: <b class="text-slate-800">${item.nama_pml || '-'}</b></div>
          </div>

          <div class="bg-slate-50 p-2 rounded-lg border border-slate-200 mb-2">
            <div class="font-bold text-slate-700 text-[10px] uppercase mb-1 border-b pb-0.5 border-slate-200 flex justify-between">
              <span>Rincian Muatan Pemetaan</span>
              <span class="text-emerald-700 font-bold">Total: ${targetMuatan.toLocaleString('id-ID')}</span>
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <div class="flex justify-between"><span class="text-slate-500">BTT:</span> <b>${btt.toLocaleString('id-ID')}</b></div>
              <div class="flex justify-between"><span class="text-slate-500">BKU:</span> <b>${bku.toLocaleString('id-ID')}</b></div>
              <div class="flex justify-between"><span class="text-slate-500">BTTK:</span> <b>${bttk.toLocaleString('id-ID')}</b></div>
              <div class="flex justify-between"><span class="text-slate-500">BBTT-NU:</span> <b>${bbttnu.toLocaleString('id-ID')}</b></div>
            </div>
          </div>

          <div class="space-y-1 text-[11px] bg-emerald-50/70 p-2 rounded-lg border border-emerald-200">
            <div class="flex justify-between items-center">
              <span class="text-emerald-900 font-medium">📍 Realisasi Tagging:</span>
              <b class="text-emerald-800 text-xs">${totalTagged.toLocaleString('id-ID')}</b>
            </div>
            <div class="flex justify-between items-center border-t border-emerald-200/80 pt-1">
              <span class="font-bold ${gap > 0 ? 'text-red-700' : 'text-emerald-700'}">🔴 Selisih Gap:</span>
              <b class="text-xs ${gap > 0 ? 'text-red-700 font-bold' : 'text-emerald-700'}">${gap.toLocaleString('id-ID')}</b>
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

    if (computedStatus === 'KRITIS' || computedStatus === 'PERHATIAN') {
      const card = document.createElement('div');
      card.className = "bg-slate-800/80 p-2.5 rounded-xl border-l-4 " + 
        (computedStatus === 'KRITIS' ? "border-red-500" : "border-amber-500") + 
        " hover:bg-slate-700/80 cursor-pointer text-xs transition shadow-sm";

      card.innerHTML = `
        <div class="font-bold text-slate-100 text-[11px] truncate">${item.nama_sls || item.nmsls}</div>
        <div class="text-slate-400 text-[10px] mt-0.5">PCL: ${item.nama_pcl || '-'}</div>
        <div class="flex justify-between items-center text-[10px] text-slate-300 mt-1.5 pt-1 border-t border-slate-700/50">
          <span>Muatan: <b class="font-mono">${targetMuatan.toLocaleString('id-ID')}</b></span>
          <span class="text-red-400 font-bold">Gap: ${gap.toLocaleString('id-ID')}</span>
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

  document.getElementById('metric-gap').innerText = totalGap.toLocaleString('id-ID');
  document.getElementById('metric-kritis').innerText = countKritis;
  document.getElementById('sls-count').innerText = `${data.length} SLS`;
}