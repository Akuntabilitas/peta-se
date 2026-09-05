import { showMapLoader, hideMapLoader } from './utils.js';
import { fetchAndRenderDbTagging, fetchAndRenderAnomaliCluster } from './layers.js';

export function initCsvUploader() {
  const fileInput = document.getElementById('csv-file-input');
  const statusDiv = document.getElementById('upload-status');

  if (!fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (statusDiv) statusDiv.innerText = `⏳ Membaca & Menganalisis ${files.length} file CSV...`;

    const payloadToUpsert = [];
    const skippedLog = []; // Menampung rekap baris yang dilewati/gagal dari semua file
    let totalMentahBaris = 0;

    console.time("⏱️ Waktu Pemrosesan CSV");
    console.log(`📂 Memulai Analisis Multi-File (${files.length} file)`);

    // Fungsi helper untuk parsing 1 file secara async
    const parseFile = (file) => {
      return new Promise((resolve) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: 'greedy',
          dynamicTyping: false,
          transformHeader: (h) => h.trim().replace(/^"|"$/g, '').toLowerCase(),
          complete: (results) => resolve({ file, data: results.data }),
          error: (err) => {
            console.error(`Gagal parsing file ${file.name}:`, err);
            resolve({ file, data: [] });
          }
        });
      });
    };

    // Proses semua file satu per satu
    for (const fileObj of files) {
      const { file, data } = await parseFile(fileObj);
      totalMentahBaris += data.length;

      console.log(`📄 Memproses File: ${file.name} (Total Mentah: ${data.length} baris)`);

      data.forEach((row, index) => {
        const rowNum = index + 2; // Baris ke-N di file CSV (Header = Baris 1)

        // Normalisasi key & value
        const cleanRow = {};
        Object.keys(row).forEach((k) => {
          const cleanKey = k.trim().replace(/^"|"$/g, '');
          const rawVal = row[k];
          cleanRow[cleanKey] = typeof rawVal === 'string' 
            ? rawVal.trim().replace(/^"|"$/g, '').replace(/""/g, '"') 
            : rawVal;
        });

        // Ekstraksi Variabel Utama
        const rawLat = cleanRow.geotag_latitude || cleanRow.latitude || cleanRow.lat;
        const rawLng = cleanRow.geotag_longitude || cleanRow.longitude || cleanRow.lng || cleanRow.long;
        const rawKdSls = cleanRow.level_6_full_code || cleanRow.kd_sls || cleanRow.kdsls || cleanRow.idsubsls;

        const lat = parseFloat(rawLat);
        const lng = parseFloat(rawLng);
        const kdSlsRow = rawKdSls ? String(rawKdSls).trim() : null;

        const noBang = parseInt(cleanRow.no_bang || cleanRow.nobang) || null;
        const namaBang = cleanRow.nama_bang || cleanRow.nama_bangunan || cleanRow.building_name || null;
        const jenisBang = cleanRow.kode_bang_value || cleanRow.jenis_bangunan || cleanRow.jenis_bang || null;
        const accuracy = parseFloat(cleanRow.geotag_accuracy || cleanRow.accuracy) || null;
        const assignmentId = cleanRow.assignment_id || cleanRow.id_assignment || cleanRow.id || null;

        // LOGIKA DIAGNOSTIK: Cek Kenapa Baris Dilewati
        const reasonList = [];

        if (!rawKdSls || kdSlsRow === '') {
          reasonList.push("Kode SLS Kosong/Null");
        }
        if (isNaN(lat)) {
          reasonList.push(`Latitude tidak valid/kosong (nilai: "${rawLat}")`);
        } else if (lat === 0) {
          reasonList.push("Latitude bernilai 0 (Titik Nol)");
        }
        if (isNaN(lng)) {
          reasonList.push(`Longitude tidak valid/kosong (nilai: "${rawLng}")`);
        } else if (lng === 0) {
          reasonList.push("Longitude bernilai 0 (Titik Nol)");
        }

        // HASIL EVALUASI BARIS
        if (reasonList.length === 0) {
          const item = {
            kd_sls: kdSlsRow,
            no_bang: noBang,
            nama_bang: namaBang,
            jenis_bangunan: jenisBang,
            geotag_accuracy: accuracy,
            geom: `POINT(${lng} ${lat})`
          };

          if (assignmentId) {
            item.assignment_id = assignmentId;
          }

          payloadToUpsert.push(item);
        } else {
          skippedLog.push({
            file_name: file.name,
            baris_csv: rowNum,
            alasan: reasonList.join(" | "),
            data_mentah: row
          });
        }
      });
    }

    console.timeEnd("⏱️ Waktu Pemrosesan CSV");

    // =========================================================================
    // REKAP CONSOLE LOGGING MENDALAM
    // =========================================================================
    console.group(`📊 REKAP HASIL PARSING MULTI-FILE CSV (${files.length} File)`);
    console.log(`✅ Total Baris Lolos (Siap Simpan): ${payloadToUpsert.length.toLocaleString('id-ID')} baris`);
    console.log(`⚠️ Total Baris Dilewati (Gagal): ${skippedLog.length.toLocaleString('id-ID')} baris`);
    console.log(`📝 Total Keseluruhan Baris Mentah: ${totalMentahBaris.toLocaleString('id-ID')} baris`);

    if (skippedLog.length > 0) {
      console.groupCollapsed("🔍 DETAIL BARIS YANG DILEWATI DAN ALASANNYA (Klik untuk buka)");
      console.table(skippedLog.map(item => ({
        'Nama File': item.file_name,
        'Baris CSV': item.baris_csv,
        'Alasan Dilewati': item.alasan
      })));
      console.log("Rincian Object Mentah Baris Gagal:", skippedLog);
      console.groupEnd();
    }
    console.groupEnd();

    // JIKA TIDAK ADA DATA VALID
    if (payloadToUpsert.length === 0) {
      if (statusDiv) statusDiv.innerText = "⚠️ Tidak ada data koordinat/SLS valid di dalam CSV (Cek Console F12)";
      return;
    }

    const totalRows = payloadToUpsert.length;
    const totalSkipped = skippedLog.length;

    if (statusDiv) {
      statusDiv.innerText = `⏳ Memproses ${totalRows.toLocaleString('id-ID')} data dari ${files.length} file (${totalSkipped} dilewati, cek Console F12)...`;
    }
    showMapLoader(`Menyimpan ${totalRows.toLocaleString('id-ID')} data CSV ke database...`);

    // PENGIRIMAN BATCH KE SUPABASE (1000 ROW PER BATCH)
    const BATCH_SIZE = 1000;
    const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
    let hasError = false;

    try {
      for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const chunkPayload = payloadToUpsert.slice(start, end);

        const percent = Math.round(((i + 1) / totalBatches) * 100);
        showMapLoader(`Mengunggah ke database... ${percent}% (${i + 1}/${totalBatches} batch)`);

        const { error } = await supabaseClient
          .from('tagged_buildings')
          .upsert(chunkPayload, { onConflict: 'assignment_id' });

        if (error) {
          console.error(`❌ Gagal Upsert Batch ke-${i + 1}:`, error);
          hasError = true;
          if (statusDiv) statusDiv.innerText = `❌ Gagal pada batch ke-${i + 1}: ` + error.message;
          break;
        }
      }

// ... kode upload CSV ...

if (!hasError) {
  if (statusDiv) {
    statusDiv.innerText = `✅ Selesai! ${totalRows.toLocaleString('id-ID')} disimpan dari ${files.length} file (${totalSkipped} dilewati, cek F12)`;
  }
  fileInput.value = '';

  // Langsung re-render layer spasial tanpa menunggu RPC timeout
  await fetchAndRenderDbTagging(true);
  await fetchAndRenderAnomaliCluster(true);
}
    } catch (err) {
      console.error("Terjadi kesalahan sistem saat unggah CSV:", err);
      if (statusDiv) statusDiv.innerText = "❌ Terjadi kesalahan sistem saat unggah data";
    } finally {
      hideMapLoader();
    }
  });
}