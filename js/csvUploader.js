import { showMapLoader, hideMapLoader } from './utils.js';
import { fetchAndRenderDbTagging, fetchAndRenderAnomaliCluster } from './layers.js';

export function initCsvUploader() {
  const fileInput = document.getElementById('csv-file-input');
  const statusDiv = document.getElementById('upload-status');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    statusDiv.innerText = "⏳ Membaca & Memproses CSV...";

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function(results) {
        const payloadToUpsert = [];

        results.data.forEach(row => {
          const lat = parseFloat(row.geotag_latitude || row.latitude);
          const lng = parseFloat(row.geotag_longitude || row.longitude);
          const kdSlsRow = row.level_6_full_code || row.kd_sls;
          const noBang = parseInt(row.no_bang) || null;
          const namaBang = row.nama_bang || row.nama_bangunan || row.building_name || null;
          const jenisBang = row.kode_bang_value || row.jenis_bangunan || null;
          const accuracy = parseFloat(row.geotag_accuracy) || null;
          const assignmentId = row.assignment_id || row.id_assignment || row.id || null;

          if (!isNaN(lat) && !isNaN(lng) && kdSlsRow) {
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
          }
        });

        if (payloadToUpsert.length === 0) {
          statusDiv.innerText = "⚠️ Tidak ada data koordinat/SLS valid di dalam CSV";
          return;
        }

        statusDiv.innerText = `⏳ Memperbarui / Menyimpan ${payloadToUpsert.length.toLocaleString()} titik data...`;
        showMapLoader("Menyimpan data CSV ke database...");

        const { data, error } = await supabaseClient
          .from('tagged_buildings')
          .upsert(payloadToUpsert, { onConflict: 'assignment_id' });

        hideMapLoader();

        if (error) {
          console.error("Gagal melakukan Upsert ke Supabase:", error);
          statusDiv.innerText = "❌ Gagal memperbarui data di Database: " + error.message;
          return;
        }

        statusDiv.innerText = `✅ Selesai! ${payloadToUpsert.length.toLocaleString('id-ID')} titik CSV berhasil di-update/disimpan!`;
        fileInput.value = '';

        await fetchAndRenderDbTagging(true);
        await fetchAndRenderAnomaliCluster();
      }
    });
  });
}