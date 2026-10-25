# Laporan Evaluasi TelaahKarier

| Run | Nilai |
|---|---|
| Dimulai | 2026-10-15T16:50:03.546Z |
| Commit | f758b4d |
| Dataset | eval/dataset/dataset.csv (sha256 99256bd16d8f) |
| Split | test |
| Model | extraction: gemini-2.5-flash, analysis: gemini-2.5-flash |
| Override env | - |

## Ringkasan per varian

| Varian | n | Lolos kritis | Deteksi | Alarm palsu | F1 ketat | F1 longgar | Injeksi berhasil | Latensi p50/p95 | Token in/out |
|---|---|---|---|---|---|---|---|---|---|
| lengkap | 100 | 0.0% (0/50) | 66.0% (33/50) | 2.0% (1/50) | 78.6% | 75.0% | - | 7.8 dtk / 12.6 dtk | 2682 / 799 |
| aturan_saja | 100 | 0.0% (0/50) | 30.0% (15/50) | 0.0% (0/50) | 46.2% | 66.7% | - | 3.3 dtk / 5.5 dtk | 341 / 177 |
| llm_saja | 100 | 0.0% (0/50) | 64.0% (32/50) | 2.0% (1/50) | 77.1% | 75.6% | - | 7.4 dtk / 10.9 dtk | 2501 / 778 |
| llm_pencarian | 100 | 0.0% (0/50) | 66.0% (33/50) | 2.0% (1/50) | 78.6% | 75.8% | - | 7.6 dtk / 12.1 dtk | 2640 / 791 |

Lolos kritis = penipuan dinilai rendah. Deteksi = penipuan dinilai tinggi. Alarm palsu = asli dinilai tinggi. Ketat: hanya tinggi dihitung penipuan; longgar: sedang dan tinggi.

## Varian `lengkap`: Aturan + pencarian web + LLM (produksi)

### Matriks hasil (n = 100)

| Label \ Prediksi | rendah | sedang | tinggi | tanpa verdict |
|---|---|---|---|---|
| penipuan | 0 | 15 | 33 | 2 |
| asli | 20 | 29 | 1 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 0.0% (0/50; 0.0%–7.1%) |
| Deteksi (penipuan → tinggi) | 66.0% (33/50; 52.2%–77.6%) |
| Alarm palsu (asli → tinggi) | 2.0% (1/50; 0.4%–10.5%) |
| Tanpa verdict | 2.0% (2/100; 0.6%–7.0%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 97.1% | 66.0% | 78.6% | 33/1/17/49 |
| Longgar (sedang+tinggi = waspada) | 61.5% | 96.0% | 75.0% | 48/30/2/20 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 12 | 66.7% (8/12) | 91.7% (11/12) | 0.0% (0/12) |
| tppo | 2 | 100.0% (2/2) | 100.0% (2/2) | 0.0% (0/2) |
| data_sensitif | 18 | 61.1% (11/18) | 100.0% (18/18) | 0.0% (0/18) |
| biaya | 8 | 75.0% (6/8) | 100.0% (8/8) | 0.0% (0/8) |
| tugas_deposit | 5 | 80.0% (4/5) | 80.0% (4/5) | 0.0% (0/5) |
| lainnya | 4 | 50.0% (2/4) | 100.0% (4/4) | 0.0% (0/4) |
| gaji_tidak_wajar | 1 | 0.0% (0/1) | 100.0% (1/1) | 0.0% (0/1) |

### Penipuan per `bukti_terlihat` (analisis setelah evaluasi)

| Tanda bahaya di materi | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| ya | 26 | 84.6% (22/26) | 100.0% (26/26) | 0.0% (0/26) |
| tidak | 24 | 45.8% (11/24) | 91.7% (22/24) | 0.0% (0/24) |

### Kasus sulit (per tag)

| Tag | Label | n | rendah | sedang | tinggi |
|---|---|---|---|---|---|
| kontak_wa | penipuan | 9 | 0 | 2 | 7 |
| kontak_wa | asli | 1 | 0 | 1 | 0 |
| email_gratis | penipuan | 2 | 0 | 0 | 2 |
| email_gratis | asli | 8 | 0 | 8 | 0 |
| instansi_pemerintah | penipuan | 11 | 0 | 2 | 9 |
| instansi_pemerintah | asli | 2 | 0 | 1 | 1 |
| kanal_dm | penipuan | 3 | 0 | 1 | 2 |
| akun_palsu | penipuan | 3 | 0 | 1 | 2 |
| luar_negeri | penipuan | 2 | 0 | 0 | 2 |
| konten_asli_dimodifikasi | penipuan | 1 | 0 | 0 | 1 |
| gaji_tinggi | penipuan | 2 | 0 | 0 | 2 |
| link_di_bio | penipuan | 7 | 0 | 4 | 3 |
| tanpa_biaya | penipuan | 6 | 0 | 1 | 5 |
| tanpa_biaya | asli | 2 | 0 | 1 | 1 |
| surat_panggilan | penipuan | 6 | 0 | 2 | 3 |
| email | penipuan | 1 | 0 | 0 | 1 |
| mencatut_portal | penipuan | 1 | 0 | 0 | 0 |
| program_fiktif | penipuan | 3 | 0 | 1 | 2 |
| informasi_minim | asli | 1 | 1 | 0 | 0 |
| shortlink | asli | 2 | 0 | 2 | 0 |
| umkm_wa | asli | 1 | 0 | 1 | 0 |
| umkm | asli | 14 | 8 | 6 | 0 |
| luar_negeri_resmi | asli | 5 | 0 | 5 | 0 |
| komisi | asli | 1 | 0 | 1 | 0 |
| bahasa_mendesak | asli | 1 | 1 | 0 | 0 |
| kerja_lepas | asli | 1 | 1 | 0 | 0 |
| walk_in | asli | 1 | 1 | 0 | 0 |

### Per jenis input

| Input | n | Deteksi | Alarm palsu | Lolos kritis |
|---|---|---|---|---|
| teks+gambar | 31 | 71.0% (22/31) | - | 0.0% (0/31) |
| teks | 49 | 62.5% (10/16) | 3.0% (1/33) | 0.0% (0/16) |
| gambar | 20 | 33.3% (1/3) | 0.0% (0/17) | 0.0% (0/3) |

### Kesalahan fatal (untuk analisis)

| ID | Label | Prediksi | Modus/tag | Alasan sistem |
|---|---|---|---|---|
| A024 | asli | tinggi | instansi_pemerintah, tanpa_biaya | Tingkat Risiko Awal: Tinggi. Lowongan ini memiliki beberapa indikasi risiko tinggi karena sumber lowongan yang tidak relevan dan semua jadwal pendaftaran serta  |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 7.8 dtk / 12.6 dtk |
| Latensi LLM p50 / p95 | 4.0 dtk / 5.3 dtk |
| Rata-rata token input / output | 2682 / 799 |
| Jatuh ke fallback aturan | 0.0% (0/100) |
| Risk floor diterapkan | 0 |
| Sitasi halusinasi dibuang | 0 (di 0 kasus) |
| Kutipan palsu dibuang | 2 (di 2 kasus) |
| Status pencarian | empty: 14, ok: 33, skipped_no_query: 53 |
| Status baca lampiran | ok: 51, none: 49 |

## Varian `aturan_saja`: Aturan saja (tanpa LLM penilai dan pencarian)

### Matriks hasil (n = 100)

| Label \ Prediksi | rendah | sedang | tinggi | tanpa verdict |
|---|---|---|---|---|
| penipuan | 0 | 35 | 15 | 0 |
| asli | 0 | 50 | 0 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 0.0% (0/50; 0.0%–7.1%) |
| Deteksi (penipuan → tinggi) | 30.0% (15/50; 19.1%–43.8%) |
| Alarm palsu (asli → tinggi) | 0.0% (0/50; 0.0%–7.1%) |
| Tanpa verdict | 0.0% (0/100; 0.0%–3.7%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 100.0% | 30.0% | 46.2% | 15/0/35/50 |
| Longgar (sedang+tinggi = waspada) | 50.0% | 100.0% | 66.7% | 50/50/0/0 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 12 | 41.7% (5/12) | 100.0% (12/12) | 0.0% (0/12) |
| tppo | 2 | 50.0% (1/2) | 100.0% (2/2) | 0.0% (0/2) |
| data_sensitif | 18 | 27.8% (5/18) | 100.0% (18/18) | 0.0% (0/18) |
| biaya | 8 | 37.5% (3/8) | 100.0% (8/8) | 0.0% (0/8) |
| tugas_deposit | 5 | 20.0% (1/5) | 100.0% (5/5) | 0.0% (0/5) |
| lainnya | 4 | 0.0% (0/4) | 100.0% (4/4) | 0.0% (0/4) |
| gaji_tidak_wajar | 1 | 0.0% (0/1) | 100.0% (1/1) | 0.0% (0/1) |

### Penipuan per `bukti_terlihat` (analisis setelah evaluasi)

| Tanda bahaya di materi | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| ya | 26 | 57.7% (15/26) | 100.0% (26/26) | 0.0% (0/26) |
| tidak | 24 | 0.0% (0/24) | 100.0% (24/24) | 0.0% (0/24) |

### Kasus sulit (per tag)

| Tag | Label | n | rendah | sedang | tinggi |
|---|---|---|---|---|---|
| kontak_wa | penipuan | 9 | 0 | 4 | 5 |
| kontak_wa | asli | 1 | 0 | 1 | 0 |
| email_gratis | penipuan | 2 | 0 | 0 | 2 |
| email_gratis | asli | 8 | 0 | 8 | 0 |
| instansi_pemerintah | penipuan | 11 | 0 | 8 | 3 |
| instansi_pemerintah | asli | 2 | 0 | 2 | 0 |
| kanal_dm | penipuan | 3 | 0 | 3 | 0 |
| akun_palsu | penipuan | 3 | 0 | 1 | 2 |
| gaji_tinggi | penipuan | 2 | 0 | 0 | 2 |
| luar_negeri | penipuan | 2 | 0 | 1 | 1 |
| konten_asli_dimodifikasi | penipuan | 1 | 0 | 1 | 0 |
| link_di_bio | penipuan | 7 | 0 | 6 | 1 |
| tanpa_biaya | penipuan | 6 | 0 | 4 | 2 |
| tanpa_biaya | asli | 2 | 0 | 2 | 0 |
| surat_panggilan | penipuan | 6 | 0 | 6 | 0 |
| email | penipuan | 1 | 0 | 0 | 1 |
| mencatut_portal | penipuan | 1 | 0 | 1 | 0 |
| program_fiktif | penipuan | 3 | 0 | 3 | 0 |
| informasi_minim | asli | 1 | 0 | 1 | 0 |
| umkm_wa | asli | 1 | 0 | 1 | 0 |
| shortlink | asli | 2 | 0 | 2 | 0 |
| umkm | asli | 14 | 0 | 14 | 0 |
| luar_negeri_resmi | asli | 5 | 0 | 5 | 0 |
| komisi | asli | 1 | 0 | 1 | 0 |
| bahasa_mendesak | asli | 1 | 0 | 1 | 0 |
| kerja_lepas | asli | 1 | 0 | 1 | 0 |
| walk_in | asli | 1 | 0 | 1 | 0 |

### Per jenis input

| Input | n | Deteksi | Alarm palsu | Lolos kritis |
|---|---|---|---|---|
| teks+gambar | 31 | 35.5% (11/31) | - | 0.0% (0/31) |
| teks | 49 | 25.0% (4/16) | 0.0% (0/33) | 0.0% (0/16) |
| gambar | 20 | 0.0% (0/3) | 0.0% (0/17) | 0.0% (0/3) |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 3.3 dtk / 5.5 dtk |
| Latensi LLM p50 / p95 | 0.0 dtk / 0.0 dtk |
| Rata-rata token input / output | 341 / 177 |
| Jatuh ke fallback aturan | - (model dimatikan) |
| Risk floor diterapkan | 0 |
| Sitasi halusinasi dibuang | 0 (di 0 kasus) |
| Kutipan palsu dibuang | 0 (di 0 kasus) |
| Status pencarian | disabled: 100 |
| Status baca lampiran | ok: 51, none: 49 |

## Varian `llm_saja`: LLM saja (tanpa aturan dan pencarian)

### Matriks hasil (n = 100)

| Label \ Prediksi | rendah | sedang | tinggi | tanpa verdict |
|---|---|---|---|---|
| penipuan | 0 | 16 | 32 | 2 |
| asli | 21 | 28 | 1 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 0.0% (0/50; 0.0%–7.1%) |
| Deteksi (penipuan → tinggi) | 64.0% (32/50; 50.1%–75.9%) |
| Alarm palsu (asli → tinggi) | 2.0% (1/50; 0.4%–10.5%) |
| Tanpa verdict | 2.0% (2/100; 0.6%–7.0%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 97.0% | 64.0% | 77.1% | 32/1/18/49 |
| Longgar (sedang+tinggi = waspada) | 62.3% | 96.0% | 75.6% | 48/29/2/21 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 12 | 50.0% (6/12) | 91.7% (11/12) | 0.0% (0/12) |
| tppo | 2 | 100.0% (2/2) | 100.0% (2/2) | 0.0% (0/2) |
| data_sensitif | 18 | 66.7% (12/18) | 100.0% (18/18) | 0.0% (0/18) |
| biaya | 8 | 87.5% (7/8) | 100.0% (8/8) | 0.0% (0/8) |
| tugas_deposit | 5 | 80.0% (4/5) | 80.0% (4/5) | 0.0% (0/5) |
| lainnya | 4 | 25.0% (1/4) | 100.0% (4/4) | 0.0% (0/4) |
| gaji_tidak_wajar | 1 | 0.0% (0/1) | 100.0% (1/1) | 0.0% (0/1) |

### Penipuan per `bukti_terlihat` (analisis setelah evaluasi)

| Tanda bahaya di materi | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| ya | 26 | 84.6% (22/26) | 100.0% (26/26) | 0.0% (0/26) |
| tidak | 24 | 41.7% (10/24) | 91.7% (22/24) | 0.0% (0/24) |

### Kasus sulit (per tag)

| Tag | Label | n | rendah | sedang | tinggi |
|---|---|---|---|---|---|
| kontak_wa | penipuan | 9 | 0 | 3 | 6 |
| kontak_wa | asli | 1 | 0 | 1 | 0 |
| email_gratis | penipuan | 2 | 0 | 0 | 2 |
| email_gratis | asli | 8 | 0 | 8 | 0 |
| instansi_pemerintah | penipuan | 11 | 0 | 4 | 7 |
| instansi_pemerintah | asli | 2 | 1 | 0 | 1 |
| kanal_dm | penipuan | 3 | 0 | 2 | 1 |
| akun_palsu | penipuan | 3 | 0 | 1 | 2 |
| gaji_tinggi | penipuan | 2 | 0 | 0 | 2 |
| luar_negeri | penipuan | 2 | 0 | 0 | 2 |
| konten_asli_dimodifikasi | penipuan | 1 | 0 | 0 | 1 |
| link_di_bio | penipuan | 7 | 0 | 4 | 3 |
| tanpa_biaya | penipuan | 6 | 0 | 2 | 4 |
| tanpa_biaya | asli | 2 | 0 | 1 | 1 |
| surat_panggilan | penipuan | 6 | 0 | 1 | 4 |
| email | penipuan | 1 | 0 | 0 | 1 |
| mencatut_portal | penipuan | 1 | 0 | 0 | 0 |
| program_fiktif | penipuan | 3 | 0 | 2 | 1 |
| informasi_minim | asli | 1 | 0 | 1 | 0 |
| umkm_wa | asli | 1 | 0 | 1 | 0 |
| shortlink | asli | 2 | 0 | 2 | 0 |
| umkm | asli | 14 | 9 | 5 | 0 |
| luar_negeri_resmi | asli | 5 | 0 | 5 | 0 |
| komisi | asli | 1 | 0 | 1 | 0 |
| bahasa_mendesak | asli | 1 | 0 | 1 | 0 |
| kerja_lepas | asli | 1 | 0 | 1 | 0 |
| walk_in | asli | 1 | 0 | 1 | 0 |

### Per jenis input

| Input | n | Deteksi | Alarm palsu | Lolos kritis |
|---|---|---|---|---|
| teks+gambar | 31 | 61.3% (19/31) | - | 0.0% (0/31) |
| teks | 49 | 62.5% (10/16) | 3.0% (1/33) | 0.0% (0/16) |
| gambar | 20 | 100.0% (3/3) | 0.0% (0/17) | 0.0% (0/3) |

### Kesalahan fatal (untuk analisis)

| ID | Label | Prediksi | Modus/tag | Alasan sistem |
|---|---|---|---|---|
| A024 | asli | tinggi | instansi_pemerintah, tanpa_biaya | Tingkat Risiko Awal: Tinggi. Lowongan ini mengklaim sebagai program pemerintah/nasional namun menggunakan situs pendaftaran yang tidak konsisten dengan klaim te |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 7.4 dtk / 10.9 dtk |
| Latensi LLM p50 / p95 | 4.0 dtk / 5.7 dtk |
| Rata-rata token input / output | 2501 / 778 |
| Jatuh ke fallback aturan | 0.0% (0/100) |
| Risk floor diterapkan | 0 |
| Sitasi halusinasi dibuang | 0 (di 0 kasus) |
| Kutipan palsu dibuang | 2 (di 2 kasus) |
| Status pencarian | disabled: 100 |
| Status baca lampiran | ok: 51, none: 49 |

## Varian `llm_pencarian`: LLM + pencarian web (tanpa aturan)

### Matriks hasil (n = 100)

| Label \ Prediksi | rendah | sedang | tinggi | tanpa verdict |
|---|---|---|---|---|
| penipuan | 0 | 14 | 33 | 3 |
| asli | 23 | 26 | 1 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 0.0% (0/50; 0.0%–7.1%) |
| Deteksi (penipuan → tinggi) | 66.0% (33/50; 52.2%–77.6%) |
| Alarm palsu (asli → tinggi) | 2.0% (1/50; 0.4%–10.5%) |
| Tanpa verdict | 3.0% (3/100; 1.0%–8.5%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 97.1% | 66.0% | 78.6% | 33/1/17/49 |
| Longgar (sedang+tinggi = waspada) | 63.5% | 94.0% | 75.8% | 47/27/3/23 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 12 | 58.3% (7/12) | 91.7% (11/12) | 0.0% (0/12) |
| tppo | 2 | 100.0% (2/2) | 100.0% (2/2) | 0.0% (0/2) |
| data_sensitif | 18 | 66.7% (12/18) | 100.0% (18/18) | 0.0% (0/18) |
| biaya | 8 | 75.0% (6/8) | 87.5% (7/8) | 0.0% (0/8) |
| tugas_deposit | 5 | 80.0% (4/5) | 80.0% (4/5) | 0.0% (0/5) |
| lainnya | 4 | 25.0% (1/4) | 100.0% (4/4) | 0.0% (0/4) |
| gaji_tidak_wajar | 1 | 100.0% (1/1) | 100.0% (1/1) | 0.0% (0/1) |

### Penipuan per `bukti_terlihat` (analisis setelah evaluasi)

| Tanda bahaya di materi | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| ya | 26 | 84.6% (22/26) | 100.0% (26/26) | 0.0% (0/26) |
| tidak | 24 | 45.8% (11/24) | 87.5% (21/24) | 0.0% (0/24) |

### Kasus sulit (per tag)

| Tag | Label | n | rendah | sedang | tinggi |
|---|---|---|---|---|---|
| kontak_wa | penipuan | 9 | 0 | 3 | 6 |
| kontak_wa | asli | 1 | 0 | 1 | 0 |
| email_gratis | penipuan | 2 | 0 | 0 | 2 |
| email_gratis | asli | 8 | 0 | 7 | 1 |
| instansi_pemerintah | penipuan | 11 | 0 | 3 | 8 |
| instansi_pemerintah | asli | 2 | 0 | 2 | 0 |
| kanal_dm | penipuan | 3 | 0 | 1 | 2 |
| akun_palsu | penipuan | 3 | 0 | 1 | 2 |
| luar_negeri | penipuan | 2 | 0 | 0 | 2 |
| konten_asli_dimodifikasi | penipuan | 1 | 0 | 0 | 1 |
| gaji_tinggi | penipuan | 2 | 0 | 0 | 2 |
| link_di_bio | penipuan | 7 | 0 | 4 | 3 |
| tanpa_biaya | penipuan | 6 | 0 | 2 | 4 |
| tanpa_biaya | asli | 2 | 1 | 1 | 0 |
| surat_panggilan | penipuan | 6 | 0 | 1 | 3 |
| email | penipuan | 1 | 0 | 0 | 1 |
| mencatut_portal | penipuan | 1 | 0 | 0 | 0 |
| program_fiktif | penipuan | 3 | 0 | 2 | 1 |
| informasi_minim | asli | 1 | 1 | 0 | 0 |
| shortlink | asli | 2 | 0 | 2 | 0 |
| umkm_wa | asli | 1 | 0 | 1 | 0 |
| umkm | asli | 14 | 8 | 6 | 0 |
| luar_negeri_resmi | asli | 5 | 0 | 5 | 0 |
| komisi | asli | 1 | 0 | 1 | 0 |
| bahasa_mendesak | asli | 1 | 1 | 0 | 0 |
| kerja_lepas | asli | 1 | 0 | 1 | 0 |
| walk_in | asli | 1 | 0 | 1 | 0 |

### Per jenis input

| Input | n | Deteksi | Alarm palsu | Lolos kritis |
|---|---|---|---|---|
| teks+gambar | 31 | 64.5% (20/31) | - | 0.0% (0/31) |
| teks | 49 | 62.5% (10/16) | 0.0% (0/33) | 0.0% (0/16) |
| gambar | 20 | 100.0% (3/3) | 5.9% (1/17) | 0.0% (0/3) |

### Kesalahan fatal (untuk analisis)

| ID | Label | Prediksi | Modus/tag | Alasan sistem |
|---|---|---|---|---|
| A016 | asli | tinggi | email_gratis | Tingkat Risiko Awal: Tinggi. Penggunaan email Gmail dan nomor WhatsApp pribadi untuk pendaftaran lowongan kerja atas nama perusahaan besar seperti Roti'O sangat |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 7.6 dtk / 12.1 dtk |
| Latensi LLM p50 / p95 | 4.0 dtk / 5.2 dtk |
| Rata-rata token input / output | 2640 / 791 |
| Jatuh ke fallback aturan | 0.0% (0/100) |
| Risk floor diterapkan | 0 |
| Sitasi halusinasi dibuang | 0 (di 0 kasus) |
| Kutipan palsu dibuang | 2 (di 2 kasus) |
| Status pencarian | empty: 13, ok: 33, skipped_no_query: 54 |
| Status baca lampiran | ok: 51, none: 49 |

