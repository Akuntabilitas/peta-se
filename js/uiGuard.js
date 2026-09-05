import { handleLogout } from './auth.js';

export function applyRoleBasedUI(profile) {
  if (!profile) return;

  const role = (profile.role || '').toUpperCase();

  // 1. TAMPILKAN IDENTITY USER DI TOPBAR HEADER
  const headerContainer = document.querySelector('header');
  if (headerContainer && !document.getElementById('user-badge-container')) {
    const userBadge = document.createElement('div');
    userBadge.id = 'user-badge-container';
    userBadge.className = "flex items-center gap-3 border-l border-slate-800 pl-4 ml-auto text-xs shrink-0";
    userBadge.innerHTML = `
      <div class="text-right">
        <div class="font-bold text-slate-200">${profile.nama_pengguna || profile.email}</div>
        <div class="text-[10px] font-mono text-emerald-400 uppercase">${role} ${profile.kecamatan_tugas ? `(${profile.kecamatan_tugas})` : ''}</div>
      </div>
      <button id="btn-logout" type="button" class="bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer">
        Keluar
      </button>
    `;
    headerContainer.appendChild(userBadge);

    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  }

  // 2. PEMBATASAN IMPORT CSV (Hanya ADMIN yang boleh Upload)
  const csvContainer = document.getElementById('csv-file-input')?.closest('div');
  if (csvContainer) {
    if (role !== 'ADMIN') {
      csvContainer.style.display = 'none';
    } else {
      csvContainer.style.display = 'block';
    }
  }
}

/**
 * Helper: Ekstraksi hanya NAMA KECAMATAN (misal "130 SIMO" -> "SIMO", "021 GLADAGSARI" -> "GLADAGSARI")
 */
function extractKecamatanName(rawKec) {
  if (!rawKec) return '';
  // Menghapus digit angka, spasi berlebih, dan karakter spasi di awal
  return rawKec.replace(/^[0-9\s.-]+/, '').trim().toUpperCase();
}

/**
 * Filter Data Master SLS khusus PML
 */
export function filterMasterDataForRole(rawData, profile) {
  if (!profile || !rawData) return rawData;
  const role = (profile.role || '').toUpperCase();

  // ISOLASI HANYA UNTUK PML
  if (role === 'PML') {
    const targetKec = extractKecamatanName(profile.kecamatan_tugas);
    const targetEmailPml = (profile.email || '').trim().toLowerCase();
    const targetNamaPml = (profile.nama_pengguna || '').trim().toLowerCase();

    console.log(`🔒 Mengisolasi Data SLS untuk PML: ${profile.nama_pengguna} | Kec Tugas: "${targetKec}"`);

    const filtered = rawData.filter(item => {
      const dbKec = (item.nmkec || '').trim().toUpperCase();
      const dbEmailPml = (item.email_pml || '').trim().toLowerCase();
      const dbNamaPml = (item.nama_pml || '').trim().toLowerCase();

      // 1. Cek apakah Email atau Nama PML cocok di record SLS
      const isMyPmlData = (targetEmailPml !== '' && dbEmailPml === targetEmailPml) ||
                          (targetNamaPml !== '' && dbNamaPml === targetNamaPml);

      // 2. Cek apakah Nama Kecamatan SLS cocok dengan Kecamatan Tugas PML
      const isMyKecamatan = targetKec !== '' && dbKec === targetKec;

      return isMyPmlData || isMyKecamatan;
    });

    console.log(`📊 Hasil Filter PML: ${filtered.length} dari ${rawData.length} SLS ditemukan.`);
    return filtered;
  }

  return rawData;
}