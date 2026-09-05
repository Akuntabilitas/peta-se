import { rawData } from './state.js';
import { fetchAndRenderDbTagging, fetchAndRenderGoogleBuildings, fetchAndRenderAnomaliCluster, renderDashboard } from './layers.js';

export function getSelectedJenisArray() {
  const checkboxes = document.querySelectorAll('.chk-jenis:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

export function updateJenisLabel() {
  const labelSelected = document.getElementById('label-selected-jenis');
  const selected = getSelectedJenisArray();
  if (selected.length === 9) {
    labelSelected.innerText = "Semua Jenis Bangunan (1-9)";
  } else if (selected.length === 0) {
    labelSelected.innerText = "⚠️ Tidak ada jenis dipilih";
  } else {
    labelSelected.innerText = `${selected.length} Jenis Bangunan Dipilih`;
  }
}

export function initJenisBangunanDropdown() {
  const btnDropdown = document.getElementById('btn-dropdown-jenis');
  const menuDropdown = document.getElementById('dropdown-jenis-menu');
  const btnAll = document.getElementById('btn-jenis-all');
  const btnReset = document.getElementById('btn-jenis-reset');
  const checkboxes = document.querySelectorAll('.chk-jenis');

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

  btnAll.addEventListener('click', () => {
    checkboxes.forEach(cb => cb.checked = true);
    updateJenisLabel();
    fetchAndRenderDbTagging(true);
  });

  btnReset.addEventListener('click', () => {
    checkboxes.forEach(cb => cb.checked = false);
    updateJenisLabel();
    fetchAndRenderDbTagging(true);
  });
}

export function initDynamicFilters() {
  const selectPml = document.getElementById('filter-pml');
  const selectPcl = document.getElementById('filter-pcl');
  const selectKec = document.getElementById('filter-kec');
  const selectDesa = document.getElementById('filter-desa');
  const selectSls = document.getElementById('filter-sls');
  const selectStatus = document.getElementById('filter-status');

  selectPml.addEventListener('change', () => { updateDropdownOptions('pml'); applyFilters(); });
  selectPcl.addEventListener('change', () => { updateDropdownOptions('pcl'); applyFilters(); });
  selectKec.addEventListener('change', () => { updateDropdownOptions('kec'); applyFilters(); });
  selectDesa.addEventListener('change', () => { updateDropdownOptions('desa'); applyFilters(); });
  selectSls.addEventListener('change', () => { updateDropdownOptions('sls'); applyFilters(); });
  selectStatus.addEventListener('change', applyFilters);

  updateDropdownOptions('ALL');
}

export function updateDropdownOptions(triggeredBy) {
  const pmlVal = document.getElementById('filter-pml').value;
  const pclVal = document.getElementById('filter-pcl').value;
  const kecVal = document.getElementById('filter-kec').value;
  const desaVal = document.getElementById('filter-desa').value;
  const slsVal = document.getElementById('filter-sls').value;

  if (triggeredBy !== 'pml') {
    let pmlSource = rawData;
    if (kecVal) pmlSource = pmlSource.filter(d => d.kd_kec === kecVal);
    if (desaVal) pmlSource = pmlSource.filter(d => d.kd_desa === desaVal);
    if (slsVal) pmlSource = pmlSource.filter(d => d.kd_sls === slsVal);
    if (pclVal) pmlSource = pmlSource.filter(d => d.email_pcl === pclVal);

    populateSelect('filter-pml', pmlSource, 'email_pml', 'nama_pml', pmlVal, '-- Semua PML --');
  }

  if (triggeredBy !== 'pcl') {
    let pclSource = rawData;
    if (pmlVal) pclSource = pclSource.filter(d => d.email_pml === pmlVal);
    if (kecVal) pclSource = pclSource.filter(d => d.kd_kec === kecVal);
    if (desaVal) pclSource = pclSource.filter(d => d.kd_desa === desaVal);
    if (slsVal) pclSource = pclSource.filter(d => d.kd_sls === slsVal);

    populateSelect('filter-pcl', pclSource, 'email_pcl', 'nama_pcl', pclVal, '-- Semua PCL / PPL --');
  }

  if (triggeredBy !== 'kec') {
    let kecSource = rawData;
    if (pmlVal) kecSource = kecSource.filter(d => d.email_pml === pmlVal);
    if (pclVal) kecSource = kecSource.filter(d => d.email_pcl === pclVal);

    populateSelect('filter-kec', kecSource, 'kd_kec', 'nmkec', kecVal, '-- Semua Kecamatan --', true);
  }

  if (triggeredBy !== 'desa') {
    let desaSource = rawData;
    if (pmlVal) desaSource = desaSource.filter(d => d.email_pml === pmlVal);
    if (pclVal) desaSource = desaSource.filter(d => d.email_pcl === pclVal);
    if (kecVal) desaSource = desaSource.filter(d => d.kd_kec === kecVal);

    populateSelect('filter-desa', desaSource, 'kd_desa', 'nmdesa', desaVal, '-- Semua Desa --', true);
  }

  if (triggeredBy !== 'sls') {
    let slsSource = rawData;
    if (pmlVal) slsSource = slsSource.filter(d => d.email_pml === pmlVal);
    if (pclVal) slsSource = slsSource.filter(d => d.email_pcl === pclVal);
    if (kecVal) slsSource = slsSource.filter(d => d.kd_kec === kecVal);
    if (desaVal) slsSource = slsSource.filter(d => d.kd_desa === desaVal);

    populateSelectSLS('filter-sls', slsSource, slsVal, '-- Semua SLS --');
  }
}

export function populateSelect(elementId, dataset, keyField, labelField, currentValue, defaultText, isCodePrefix = false) {
  const select = document.getElementById(elementId);
  select.innerHTML = `<option value="">${defaultText}</option>`;

  const map = new Map();
  dataset.forEach(item => {
    if (item[keyField] && item[labelField]) map.set(item[keyField], item[labelField]);
  });

  const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  sorted.forEach(([key, label]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.innerText = isCodePrefix ? `[${key}] ${label}` : label;
    if (key === currentValue) opt.selected = true;
    select.appendChild(opt);
  });
}

export function populateSelectSLS(elementId, dataset, currentValue, defaultText) {
  const select = document.getElementById(elementId);
  select.innerHTML = `<option value="">${defaultText}</option>`;

  const slsList = dataset.map(d => ({ code: d.kd_sls, name: d.nama_sls }));
  slsList.sort((a, b) => a.code.localeCompare(b.code));

  slsList.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.code;
    opt.innerText = `${item.name} (${item.code})`;
    if (item.code === currentValue) opt.selected = true;
    select.appendChild(opt);
  });
}

export function getFilteredData() {
  const pmlVal = document.getElementById('filter-pml').value;
  const pclVal = document.getElementById('filter-pcl').value;
  const kecVal = document.getElementById('filter-kec').value;
  const desaVal = document.getElementById('filter-desa').value;
  const slsVal = document.getElementById('filter-sls').value;
  const statusVal = document.getElementById('filter-status').value;

  let filtered = rawData;
  if (pmlVal) filtered = filtered.filter(d => d.email_pml === pmlVal);
  if (pclVal) filtered = filtered.filter(d => d.email_pcl === pclVal);
  if (kecVal) filtered = filtered.filter(d => d.kd_kec === kecVal);
  if (desaVal) filtered = filtered.filter(d => d.kd_desa === desaVal);
  if (slsVal) filtered = filtered.filter(d => d.kd_sls === slsVal);
  if (statusVal) filtered = filtered.filter(d => d.status_sls && d.status_sls.includes(statusVal));

  return filtered;
}

export function applyFilters() {
  const filtered = getFilteredData();
  const pmlVal = document.getElementById('filter-pml').value;
  const pclVal = document.getElementById('filter-pcl').value;
  const kecVal = document.getElementById('filter-kec').value;

  if (filtered.length > 0) {
    const tempFeatures = filtered.filter(d => d.geom).map(d => d.geom);
    if (tempFeatures.length > 0) {
      const tempLayer = L.geoJSON(tempFeatures);
      map.fitBounds(tempLayer.getBounds(), { padding: [20, 20] });
    }
  } else if (!kecVal && !pmlVal && !pclVal) {
    map.setView([-7.53, 110.60], 11);
  }

  Promise.all([
    fetchAndRenderDbTagging(false),
    fetchAndRenderGoogleBuildings(),
    fetchAndRenderAnomaliCluster()
  ]);

  renderDashboard(filtered);
}