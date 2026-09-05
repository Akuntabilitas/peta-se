import { rawData } from './state.js';
import { 
  fetchAndRenderDbTagging, 
  fetchAndRenderGoogleBuildings, 
  fetchAndRenderAnomaliCluster, 
  renderDashboard 
} from './layers.js';

/**
 * Mengambil array nilai checkbox jenis bangunan yang dicentang (dikembalikan sebagai array of number/string)
 */
export function getSelectedJenisArray() {
  const checkboxes = document.querySelectorAll('.chk-jenis:checked');
  return Array.from(checkboxes).map(cb => Number(cb.value));
}

/**
 * Memperbarui label teks jumlah jenis bangunan yang dipilih
 */
export function updateJenisLabel() {
  const labelSelected = document.getElementById('label-selected-jenis');
  if (!labelSelected) return;

  const selected = getSelectedJenisArray();
  if (selected.length === 9) {
    labelSelected.innerText = "Semua Jenis Bangunan (1-9)";
  } else if (selected.length === 0) {
    labelSelected.innerText = "⚠️ Tidak ada jenis dipilih";
  } else {
    labelSelected.innerText = `${selected.length} Jenis Bangunan Dipilih`;
  }
}

/**
 * Inisialisasi Event Listener Dropdown Jenis Bangunan
 */
export function initJenisBangunanDropdown() {
  const btnDropdown = document.getElementById('btn-dropdown-jenis');
  const menuDropdown = document.getElementById('dropdown-jenis-menu');
  const btnAll = document.getElementById('btn-jenis-all');
  const btnReset = document.getElementById('btn-jenis-reset');
  const checkboxes = document.querySelectorAll('.chk-jenis');

  if (!btnDropdown || !menuDropdown) return;

  btnDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!menuDropdown.contains(e.target) && !btnDropdown.contains(e.target)) {
      menuDropdown.classList.add('hidden');
    }
  });

  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      updateJenisLabel();
      fetchAndRenderDbTagging(true);
    });
  });

  if (btnAll) {
    btnAll.addEventListener('click', () => {
      checkboxes.forEach(cb => cb.checked = true);
      updateJenisLabel();
      fetchAndRenderDbTagging(true);
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      checkboxes.forEach(cb => cb.checked = false);
      updateJenisLabel();
      fetchAndRenderDbTagging(true);
    });
  }
}

/**
 * Inisialisasi Event Listener Filter Wilayah dan Petugas dengan Fitur Cascading Reset
 */
export function initDynamicFilters() {
  const selectPml = document.getElementById('filter-pml');
  const selectPcl = document.getElementById('filter-pcl');
  const selectKec = document.getElementById('filter-kec');
  const selectDesa = document.getElementById('filter-desa');
  const selectSls = document.getElementById('filter-sls');
  const selectStatus = document.getElementById('filter-status');

  if (selectKec) {
    selectKec.addEventListener('change', () => {
      // Cascading Reset: Reset filter Desa & SLS jika Kecamatan berubah
      if (selectDesa) selectDesa.value = '';
      if (selectSls) selectSls.value = '';
      updateDropdownOptions('kec');
      applyFilters();
    });
  }

  if (selectDesa) {
    selectDesa.addEventListener('change', () => {
      // Cascading Reset: Reset filter SLS jika Desa berubah
      if (selectSls) selectSls.value = '';
      updateDropdownOptions('desa');
      applyFilters();
    });
  }

  if (selectSls) {
    selectSls.addEventListener('change', () => {
      updateDropdownOptions('sls');
      applyFilters();
    });
  }

  if (selectPml) {
    selectPml.addEventListener('change', () => {
      // Cascading Reset: Reset filter PCL jika PML berubah
      if (selectPcl) selectPcl.value = '';
      updateDropdownOptions('pml');
      applyFilters();
    });
  }

  if (selectPcl) {
    selectPcl.addEventListener('change', () => {
      updateDropdownOptions('pcl');
      applyFilters();
    });
  }

  if (selectStatus) {
    selectStatus.addEventListener('change', applyFilters);
  }

  // Populate awal seluruh opsi dropdown
  updateDropdownOptions('ALL');
}

/**
 * Meng-update Opsi Pilihan pada Dropdown secara Dinamis berdasarkan Relasi Data
 */
export function updateDropdownOptions(triggeredBy) {
  const pmlVal = document.getElementById('filter-pml')?.value || '';
  const pclVal = document.getElementById('filter-pcl')?.value || '';
  const kecVal = document.getElementById('filter-kec')?.value || '';
  const desaVal = document.getElementById('filter-desa')?.value || '';
  const slsVal = document.getElementById('filter-sls')?.value || '';

  // 1. UPDATE OPTION PML
  if (triggeredBy !== 'pml') {
    let pmlSource = rawData;
    if (kecVal) pmlSource = pmlSource.filter(d => String(d.kd_kec) === String(kecVal));
    if (desaVal) pmlSource = pmlSource.filter(d => String(d.kd_desa) === String(desaVal));
    if (slsVal) pmlSource = pmlSource.filter(d => String(d.kd_sls) === String(slsVal));
    if (pclVal) pmlSource = pmlSource.filter(d => String(d.email_pcl) === String(pclVal));

    populateSelect('filter-pml', pmlSource, 'email_pml', 'nama_pml', pmlVal, '-- Semua PML --');
  }

  // 2. UPDATE OPTION PCL
  if (triggeredBy !== 'pcl') {
    let pclSource = rawData;
    if (pmlVal) pclSource = pclSource.filter(d => String(d.email_pml) === String(pmlVal));
    if (kecVal) pclSource = pclSource.filter(d => String(d.kd_kec) === String(kecVal));
    if (desaVal) pclSource = pclSource.filter(d => String(d.kd_desa) === String(desaVal));
    if (slsVal) pclSource = pclSource.filter(d => String(d.kd_sls) === String(slsVal));

    populateSelect('filter-pcl', pclSource, 'email_pcl', 'nama_pcl', pclVal, '-- Semua PCL / PPL --');
  }

  // 3. UPDATE OPTION KECAMATAN
  if (triggeredBy !== 'kec') {
    let kecSource = rawData;
    if (pmlVal) kecSource = kecSource.filter(d => String(d.email_pml) === String(pmlVal));
    if (pclVal) kecSource = kecSource.filter(d => String(d.email_pcl) === String(pclVal));

    populateSelect('filter-kec', kecSource, 'kd_kec', 'nmkec', kecVal, '-- Semua Kecamatan --', true);
  }

  // 4. UPDATE OPTION DESA
  if (triggeredBy !== 'desa') {
    let desaSource = rawData;
    if (pmlVal) desaSource = desaSource.filter(d => String(d.email_pml) === String(pmlVal));
    if (pclVal) desaSource = desaSource.filter(d => String(d.email_pcl) === String(pclVal));
    if (kecVal) desaSource = desaSource.filter(d => String(d.kd_kec) === String(kecVal));

    populateSelect('filter-desa', desaSource, 'kd_desa', 'nmdesa', desaVal, '-- Semua Desa --', true);
  }

  // 5. UPDATE OPTION SLS
  if (triggeredBy !== 'sls') {
    let slsSource = rawData;
    if (pmlVal) slsSource = slsSource.filter(d => String(d.email_pml) === String(pmlVal));
    if (pclVal) slsSource = slsSource.filter(d => String(d.email_pcl) === String(pclVal));
    if (kecVal) slsSource = slsSource.filter(d => String(d.kd_kec) === String(kecVal));
    if (desaVal) slsSource = slsSource.filter(d => String(d.kd_desa) === String(desaVal));

    populateSelectSLS('filter-sls', slsSource, slsVal, '-- Semua SLS --');
  }
}

/**
 * Helper Universal untuk Mengisi Opsi Select HTML (Kecamatan, Desa, PML, PCL)
 */
export function populateSelect(elementId, dataset, keyField, labelField, currentValue, defaultText, isCodePrefix = false) {
  const select = document.getElementById(elementId);
  if (!select) return;

  select.innerHTML = `<option value="">${defaultText}</option>`;

  const map = new Map();
  dataset.forEach(item => {
    const key = item[keyField] ? String(item[keyField]).trim() : '';
    const label = item[labelField] ? String(item[labelField]).trim() : '';
    if (key && label) {
      map.set(key, label);
    }
  });

  const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  sorted.forEach(([key, label]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.innerText = isCodePrefix ? `[${key}] ${label}` : label;
    if (key === String(currentValue)) opt.selected = true;
    select.appendChild(opt);
  });
}

/**
 * Helper Khusus Mengisi Opsi Select SLS dengan Format Nama SLS (Kode SLS) tanpa Duplikat
 */
export function populateSelectSLS(elementId, dataset, currentValue, defaultText) {
  const select = document.getElementById(elementId);
  if (!select) return;

  select.innerHTML = `<option value="">${defaultText}</option>`;

  const map = new Map();
  dataset.forEach(d => {
    const code = d.kd_sls ? String(d.kd_sls).trim() : '';
    const name = d.nama_sls ? String(d.nama_sls).trim() : (d.nmsls ? String(d.nmsls).trim() : 'Tanpa Nama');
    if (code) {
      map.set(code, name);
    }
  });

  const slsList = Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  slsList.sort((a, b) => a.code.localeCompare(b.code));

  slsList.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.code;
    opt.innerText = `${item.name} (${item.code})`;
    if (item.code === String(currentValue)) opt.selected = true;
    select.appendChild(opt);
  });
}

/**
 * Mengembalikan Dataset yang Sudah Disaring Berdasarkan Seluruh Filter Aktif
 */
export function getFilteredData() {
  const pmlVal = document.getElementById('filter-pml')?.value || '';
  const pclVal = document.getElementById('filter-pcl')?.value || '';
  const kecVal = document.getElementById('filter-kec')?.value || '';
  const desaVal = document.getElementById('filter-desa')?.value || '';
  const slsVal = document.getElementById('filter-sls')?.value || '';
  const statusVal = document.getElementById('filter-status')?.value || '';

  return rawData.filter(d => {
    if (pmlVal && String(d.email_pml) !== pmlVal) return false;
    if (pclVal && String(d.email_pcl) !== pclVal) return false;
    if (kecVal && String(d.kd_kec) !== kecVal) return false;
    if (desaVal && String(d.kd_desa) !== desaVal) return false;
    if (slsVal && String(d.kd_sls) !== slsVal) return false;
    if (statusVal && (!d.status_sls || !d.status_sls.includes(statusVal))) return false;
    return true;
  });
}

/**
 * Menerapkan Filter Aktif: Menyesuaikan Kamera Peta, Memperbarui Dashboard, dan Memuat Layer Spasial
 */
export function applyFilters() {
  const filtered = getFilteredData();
  const pmlVal = document.getElementById('filter-pml')?.value || '';
  const pclVal = document.getElementById('filter-pcl')?.value || '';
  const kecVal = document.getElementById('filter-kec')?.value || '';

  // Penyesuaian Kamera Zoom Peta Otomatis
  if (filtered.length > 0) {
    const tempFeatures = filtered.filter(d => d.geom).map(d => d.geom);
    if (tempFeatures.length > 0) {
      const tempLayer = L.geoJSON(tempFeatures);
      map.fitBounds(tempLayer.getBounds(), { padding: [20, 20] });
    }
  } else if (!kecVal && !pmlVal && !pclVal) {
    map.setView([-7.53, 110.60], 11);
  }

  // Render Dashboard Sidebar & Metrics
  renderDashboard(filtered);

  // Panggil Pengunduhan & Render Layer Spasial
  fetchAndRenderDbTagging(false);
  fetchAndRenderGoogleBuildings();
  fetchAndRenderAnomaliCluster(false);
}