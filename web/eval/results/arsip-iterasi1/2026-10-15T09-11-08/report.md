# Laporan Evaluasi TelaahKarier

| Run | Nilai |
|---|---|
| Dimulai | 2026-10-15T09:11:16.390Z |
| Commit | 11364d5 |
| Dataset | eval/dataset/dataset.csv (sha256 6b33497acb81) |
| Split | test |
| Model | extraction: gemini-2.5-flash, analysis: gemini-2.5-flash |
| Override env | - |

## Ringkasan per varian

| Varian | n | Lolos kritis | Deteksi | Alarm palsu | F1 ketat | F1 longgar | Injeksi berhasil | Latensi p50/p95 | Token in/out |
|---|---|---|---|---|---|---|---|---|---|
| lengkap | 100 | 6.0% (3/50) | 30.0% (15/50) | 0.0% (0/50) | 46.2% | 78.9% | - | 7.3 dtk / 12.7 dtk | 2365 / 776 |
| aturan_saja | 100 | 0.0% (0/50) | 2.0% (1/50) | 0.0% (0/50) | 3.9% | 66.7% | - | 3.0 dtk / 5.2 dtk | 341 / 177 |
| llm_saja | 100 | 6.0% (3/50) | 34.0% (17/50) | 0.0% (0/50) | 50.7% | 79.6% | - | 6.5 dtk / 9.7 dtk | 2251 / 767 |
| llm_pencarian | 100 | 6.0% (3/50) | 34.0% (17/50) | 0.0% (0/50) | 50.7% | 78.9% | - | 7.6 dtk / 11.6 dtk | 2369 / 788 |

Lolos kritis = penipuan dinilai rendah. Deteksi = penipuan dinilai tinggi. Alarm palsu = asli dinilai tinggi. Ketat: hanya tinggi dihitung penipuan; longgar: sedang dan tinggi.

Kolom `bukti_terlihat` diambil dari dataset saat laporan dibuat, bukan saat run.

## Varian `lengkap`: Aturan + pencarian web + LLM (produksi)

### Matriks hasil (n = 100)

| Label \ Prediksi | rendah | sedang | tinggi | tanpa verdict |
|---|---|---|---|---|
| penipuan | 3 | 30 | 15 | 2 |
| asli | 31 | 19 | 0 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 6.0% (3/50; 2.1%–16.2%) |
| Deteksi (penipuan → tinggi) | 30.0% (15/50; 19.1%–43.8%) |
| Alarm palsu (asli → tinggi) | 0.0% (0/50; 0.0%–7.1%) |
| Tanpa verdict | 2.0% (2/100; 0.6%–7.0%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 100.0% | 30.0% | 46.2% | 15/0/35/50 |
| Longgar (sedang+tinggi = waspada) | 70.3% | 90.0% | 78.9% | 45/19/5/31 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 12 | 8.3% (1/12) | 83.3% (10/12) | 8.3% (1/12) |
| tppo | 2 | 100.0% (2/2) | 100.0% (2/2) | 0.0% (0/2) |
| data_sensitif | 18 | 22.2% (4/18) | 88.9% (16/18) | 11.1% (2/18) |
| biaya | 8 | 62.5% (5/8) | 100.0% (8/8) | 0.0% (0/8) |
| tugas_deposit | 5 | 40.0% (2/5) | 80.0% (4/5) | 0.0% (0/5) |
| lainnya | 4 | 25.0% (1/4) | 100.0% (4/4) | 0.0% (0/4) |
| gaji_tidak_wajar | 1 | 0.0% (0/1) | 100.0% (1/1) | 0.0% (0/1) |

### Penipuan per `bukti_terlihat` (analisis setelah evaluasi)

| Tanda bahaya di materi | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| ya | 26 | 46.2% (12/26) | 100.0% (26/26) | 0.0% (0/26) |
| tidak | 24 | 12.5% (3/24) | 79.2% (19/24) | 12.5% (3/24) |

### Kasus sulit (per tag)

| Tag | Label | n | rendah | sedang | tinggi |
|---|---|---|---|---|---|
| kontak_wa | penipuan | 9 | 1 | 5 | 3 |
| kontak_wa | asli | 1 | 0 | 1 | 0 |
| email_gratis | penipuan | 2 | 0 | 1 | 1 |
| email_gratis | asli | 8 | 0 | 8 | 0 |
| instansi_pemerintah | penipuan | 11 | 0 | 7 | 4 |
| instansi_pemerintah | asli | 2 | 1 | 1 | 0 |
| kanal_dm | penipuan | 3 | 0 | 3 | 0 |
| akun_palsu | penipuan | 3 | 0 | 2 | 1 |
| gaji_tinggi | penipuan | 2 | 0 | 1 | 1 |
| luar_negeri | penipuan | 2 | 0 | 0 | 2 |
| konten_asli_dimodifikasi | penipuan | 1 | 0 | 0 | 1 |
| link_di_bio | penipuan | 7 | 2 | 4 | 1 |
| tanpa_biaya | penipuan | 6 | 0 | 4 | 2 |
| tanpa_biaya | asli | 2 | 1 | 1 | 0 |
| surat_panggilan | penipuan | 6 | 0 | 3 | 2 |
| email | penipuan | 1 | 0 | 0 | 1 |
| mencatut_portal | penipuan | 1 | 0 | 0 | 0 |
| program_fiktif | penipuan | 3 | 0 | 2 | 1 |
| informasi_minim | asli | 1 | 1 | 0 | 0 |
| shortlink | asli | 2 | 0 | 2 | 0 |
| umkm_wa | asli | 1 | 0 | 1 | 0 |
| umkm | asli | 14 | 9 | 5 | 0 |
| luar_negeri_resmi | asli | 5 | 0 | 5 | 0 |
| komisi | asli | 1 | 1 | 0 | 0 |
| bahasa_mendesak | asli | 1 | 1 | 0 | 0 |
| kerja_lepas | asli | 1 | 1 | 0 | 0 |
| walk_in | asli | 1 | 1 | 0 | 0 |

### Per jenis input

| Input | n | Deteksi | Alarm palsu | Lolos kritis |
|---|---|---|---|---|
| teks+gambar | 31 | 25.8% (8/31) | - | 9.7% (3/31) |
| teks | 49 | 37.5% (6/16) | 0.0% (0/33) | 0.0% (0/16) |
| gambar | 20 | 33.3% (1/3) | 0.0% (0/17) | 0.0% (0/3) |

### Kesalahan fatal (untuk analisis)

| ID | Label | Prediksi | Modus/tag | Alasan sistem |
|---|---|---|---|---|
| P015 | penipuan | rendah | impersonasi, kontak_wa | Tingkat Risiko Awal: Rendah. Lowongan ini berasal dari perusahaan yang jelas dan terverifikasi, dengan kualifikasi dan fasilitas yang wajar. |
| P031 | penipuan | rendah | data_sensitif, link_di_bio | Tingkat Risiko Awal: Rendah. Identitas perusahaan jelas, lowongan sesuai dengan jejak digital perusahaan, dan proses pendaftaran mengarah ke kanal resmi. |
| P069 | penipuan | rendah | data_sensitif, link_di_bio | Tingkat Risiko Awal: Rendah. Identitas perusahaan jelas, terverifikasi sebagai anak perusahaan BUMN, dan secara eksplisit menyatakan tidak ada biaya dalam prose |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 7.3 dtk / 12.7 dtk |
| Latensi LLM p50 / p95 | 3.9 dtk / 5.2 dtk |
| Rata-rata token input / output | 2365 / 776 |
| Jatuh ke fallback aturan | 0.0% (0/100) |
| Risk floor diterapkan | 0 |
| Sitasi halusinasi dibuang | 0 (di 0 kasus) |
| Kutipan palsu dibuang | 2 (di 2 kasus) |
| Status pencarian | empty: 23, ok: 22, skipped_no_query: 55 |
| Status baca lampiran | ok: 51, none: 49 |

## Varian `aturan_saja`: Aturan saja (tanpa LLM penilai dan pencarian)

### Matriks hasil (n = 100)

| Label \ Prediksi | rendah | sedang | tinggi | tanpa verdict |
|---|---|---|---|---|
| penipuan | 0 | 49 | 1 | 0 |
| asli | 0 | 50 | 0 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 0.0% (0/50; 0.0%–7.1%) |
| Deteksi (penipuan → tinggi) | 2.0% (1/50; 0.4%–10.5%) |
| Alarm palsu (asli → tinggi) | 0.0% (0/50; 0.0%–7.1%) |
| Tanpa verdict | 0.0% (0/100; 0.0%–3.7%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 100.0% | 2.0% | 3.9% | 1/0/49/50 |
| Longgar (sedang+tinggi = waspada) | 50.0% | 100.0% | 66.7% | 50/50/0/0 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 12 | 0.0% (0/12) | 100.0% (12/12) | 0.0% (0/12) |
| tppo | 2 | 0.0% (0/2) | 100.0% (2/2) | 0.0% (0/2) |
| data_sensitif | 18 | 0.0% (0/18) | 100.0% (18/18) | 0.0% (0/18) |
| biaya | 8 | 12.5% (1/8) | 100.0% (8/8) | 0.0% (0/8) |
| tugas_deposit | 5 | 0.0% (0/5) | 100.0% (5/5) | 0.0% (0/5) |
| lainnya | 4 | 0.0% (0/4) | 100.0% (4/4) | 0.0% (0/4) |
| gaji_tidak_wajar | 1 | 0.0% (0/1) | 100.0% (1/1) | 0.0% (0/1) |

### Penipuan per `bukti_terlihat` (analisis setelah evaluasi)

| Tanda bahaya di materi | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| ya | 26 | 3.8% (1/26) | 100.0% (26/26) | 0.0% (0/26) |
| tidak | 24 | 0.0% (0/24) | 100.0% (24/24) | 0.0% (0/24) |

### Kasus sulit (per tag)

| Tag | Label | n | rendah | sedang | tinggi |
|---|---|---|---|---|---|
| kontak_wa | penipuan | 9 | 0 | 8 | 1 |
| kontak_wa | asli | 1 | 0 | 1 | 0 |
| kanal_dm | penipuan | 3 | 0 | 3 | 0 |
| instansi_pemerintah | penipuan | 11 | 0 | 11 | 0 |
| instansi_pemerintah | asli | 2 | 0 | 2 | 0 |
| email_gratis | penipuan | 2 | 0 | 1 | 1 |
| email_gratis | asli | 8 | 0 | 8 | 0 |
| akun_palsu | penipuan | 3 | 0 | 3 | 0 |
| luar_negeri | penipuan | 2 | 0 | 2 | 0 |
| konten_asli_dimodifikasi | penipuan | 1 | 0 | 1 | 0 |
| gaji_tinggi | penipuan | 2 | 0 | 2 | 0 |
| link_di_bio | penipuan | 7 | 0 | 7 | 0 |
| tanpa_biaya | penipuan | 6 | 0 | 6 | 0 |
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
| teks+gambar | 31 | 0.0% (0/31) | - | 0.0% (0/31) |
| teks | 49 | 6.3% (1/16) | 0.0% (0/33) | 0.0% (0/16) |
| gambar | 20 | 0.0% (0/3) | 0.0% (0/17) | 0.0% (0/3) |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 3.0 dtk / 5.2 dtk |
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
| penipuan | 3 | 28 | 17 | 2 |
| asli | 32 | 18 | 0 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 6.0% (3/50; 2.1%–16.2%) |
| Deteksi (penipuan → tinggi) | 34.0% (17/50; 22.4%–47.8%) |
| Alarm palsu (asli → tinggi) | 0.0% (0/50; 0.0%–7.1%) |
| Tanpa verdict | 2.0% (2/100; 0.6%–7.0%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 100.0% | 34.0% | 50.7% | 17/0/33/50 |
| Longgar (sedang+tinggi = waspada) | 71.4% | 90.0% | 79.6% | 45/18/5/32 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 12 | 25.0% (3/12) | 83.3% (10/12) | 8.3% (1/12) |
| tppo | 2 | 100.0% (2/2) | 100.0% (2/2) | 0.0% (0/2) |
| data_sensitif | 18 | 22.2% (4/18) | 88.9% (16/18) | 11.1% (2/18) |
| biaya | 8 | 75.0% (6/8) | 100.0% (8/8) | 0.0% (0/8) |
| tugas_deposit | 5 | 40.0% (2/5) | 80.0% (4/5) | 0.0% (0/5) |
| lainnya | 4 | 0.0% (0/4) | 100.0% (4/4) | 0.0% (0/4) |
| gaji_tidak_wajar | 1 | 0.0% (0/1) | 100.0% (1/1) | 0.0% (0/1) |

### Penipuan per `bukti_terlihat` (analisis setelah evaluasi)

| Tanda bahaya di materi | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| ya | 26 | 42.3% (11/26) | 100.0% (26/26) | 0.0% (0/26) |
| tidak | 24 | 25.0% (6/24) | 79.2% (19/24) | 12.5% (3/24) |

### Kasus sulit (per tag)

| Tag | Label | n | rendah | sedang | tinggi |
|---|---|---|---|---|---|
| kontak_wa | penipuan | 9 | 1 | 4 | 4 |
| kontak_wa | asli | 1 | 0 | 1 | 0 |
| kanal_dm | penipuan | 3 | 0 | 3 | 0 |
| instansi_pemerintah | penipuan | 11 | 0 | 7 | 4 |
| instansi_pemerintah | asli | 2 | 1 | 1 | 0 |
| email_gratis | penipuan | 2 | 0 | 1 | 1 |
| email_gratis | asli | 8 | 0 | 8 | 0 |
| akun_palsu | penipuan | 3 | 0 | 1 | 2 |
| gaji_tinggi | penipuan | 2 | 0 | 0 | 2 |
| luar_negeri | penipuan | 2 | 0 | 0 | 2 |
| konten_asli_dimodifikasi | penipuan | 1 | 0 | 0 | 1 |
| link_di_bio | penipuan | 7 | 2 | 2 | 3 |
| tanpa_biaya | penipuan | 6 | 0 | 5 | 1 |
| tanpa_biaya | asli | 2 | 1 | 1 | 0 |
| surat_panggilan | penipuan | 6 | 0 | 2 | 3 |
| email | penipuan | 1 | 0 | 0 | 1 |
| mencatut_portal | penipuan | 1 | 0 | 0 | 0 |
| program_fiktif | penipuan | 3 | 0 | 3 | 0 |
| informasi_minim | asli | 1 | 1 | 0 | 0 |
| shortlink | asli | 2 | 1 | 1 | 0 |
| umkm_wa | asli | 1 | 0 | 1 | 0 |
| umkm | asli | 14 | 9 | 5 | 0 |
| luar_negeri_resmi | asli | 5 | 0 | 5 | 0 |
| komisi | asli | 1 | 1 | 0 | 0 |
| bahasa_mendesak | asli | 1 | 1 | 0 | 0 |
| kerja_lepas | asli | 1 | 0 | 1 | 0 |
| walk_in | asli | 1 | 1 | 0 | 0 |

### Per jenis input

| Input | n | Deteksi | Alarm palsu | Lolos kritis |
|---|---|---|---|---|
| teks+gambar | 31 | 29.0% (9/31) | - | 9.7% (3/31) |
| teks | 49 | 43.8% (7/16) | 0.0% (0/33) | 0.0% (0/16) |
| gambar | 20 | 33.3% (1/3) | 0.0% (0/17) | 0.0% (0/3) |

### Kesalahan fatal (untuk analisis)

| ID | Label | Prediksi | Modus/tag | Alasan sistem |
|---|---|---|---|---|
| P015 | penipuan | rendah | impersonasi, kontak_wa | Tingkat Risiko Awal: Rendah. Lowongan ini memiliki identitas perusahaan yang jelas dan menawarkan posisi serta kualifikasi yang wajar. Namun, periode pendaftara |
| P031 | penipuan | rendah | data_sensitif, link_di_bio | Tingkat Risiko Awal: Rendah. Informasi perusahaan dan posisi yang ditawarkan cukup jelas, serta metode pendaftaran diarahkan ke kanal resmi perusahaan. |
| P069 | penipuan | rendah | data_sensitif, link_di_bio | Tingkat Risiko Awal: Rendah. Lowongan ini memiliki identitas perusahaan yang jelas, deskripsi pekerjaan yang wajar, dan secara eksplisit menyatakan tidak ada bi |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 6.5 dtk / 9.7 dtk |
| Latensi LLM p50 / p95 | 3.8 dtk / 5.0 dtk |
| Rata-rata token input / output | 2251 / 767 |
| Jatuh ke fallback aturan | 0.0% (0/100) |
| Risk floor diterapkan | 0 |
| Sitasi halusinasi dibuang | 0 (di 0 kasus) |
| Kutipan palsu dibuang | 1 (di 1 kasus) |
| Status pencarian | disabled: 100 |
| Status baca lampiran | ok: 51, none: 49 |

## Varian `llm_pencarian`: LLM + pencarian web (tanpa aturan)

### Matriks hasil (n = 100)

| Label \ Prediksi | rendah | sedang | tinggi | tanpa verdict |
|---|---|---|---|---|
| penipuan | 3 | 28 | 17 | 2 |
| asli | 31 | 19 | 0 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 6.0% (3/50; 2.1%–16.2%) |
| Deteksi (penipuan → tinggi) | 34.0% (17/50; 22.4%–47.8%) |
| Alarm palsu (asli → tinggi) | 0.0% (0/50; 0.0%–7.1%) |
| Tanpa verdict | 2.0% (2/100; 0.6%–7.0%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 100.0% | 34.0% | 50.7% | 17/0/33/50 |
| Longgar (sedang+tinggi = waspada) | 70.3% | 90.0% | 78.9% | 45/19/5/31 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 12 | 16.7% (2/12) | 83.3% (10/12) | 8.3% (1/12) |
| tppo | 2 | 100.0% (2/2) | 100.0% (2/2) | 0.0% (0/2) |
| data_sensitif | 18 | 22.2% (4/18) | 88.9% (16/18) | 11.1% (2/18) |
| biaya | 8 | 75.0% (6/8) | 100.0% (8/8) | 0.0% (0/8) |
| tugas_deposit | 5 | 40.0% (2/5) | 80.0% (4/5) | 0.0% (0/5) |
| lainnya | 4 | 25.0% (1/4) | 100.0% (4/4) | 0.0% (0/4) |
| gaji_tidak_wajar | 1 | 0.0% (0/1) | 100.0% (1/1) | 0.0% (0/1) |

### Penipuan per `bukti_terlihat` (analisis setelah evaluasi)

| Tanda bahaya di materi | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| ya | 26 | 42.3% (11/26) | 100.0% (26/26) | 0.0% (0/26) |
| tidak | 24 | 25.0% (6/24) | 79.2% (19/24) | 12.5% (3/24) |

### Kasus sulit (per tag)

| Tag | Label | n | rendah | sedang | tinggi |
|---|---|---|---|---|---|
| kontak_wa | penipuan | 9 | 1 | 4 | 4 |
| kontak_wa | asli | 1 | 0 | 1 | 0 |
| kanal_dm | penipuan | 3 | 0 | 3 | 0 |
| instansi_pemerintah | penipuan | 11 | 0 | 6 | 5 |
| instansi_pemerintah | asli | 2 | 1 | 1 | 0 |
| email_gratis | penipuan | 2 | 0 | 1 | 1 |
| email_gratis | asli | 8 | 0 | 8 | 0 |
| akun_palsu | penipuan | 3 | 0 | 2 | 1 |
| gaji_tinggi | penipuan | 2 | 0 | 1 | 1 |
| luar_negeri | penipuan | 2 | 0 | 0 | 2 |
| konten_asli_dimodifikasi | penipuan | 1 | 0 | 0 | 1 |
| link_di_bio | penipuan | 7 | 2 | 3 | 2 |
| tanpa_biaya | penipuan | 6 | 0 | 4 | 2 |
| tanpa_biaya | asli | 2 | 1 | 1 | 0 |
| surat_panggilan | penipuan | 6 | 0 | 2 | 3 |
| email | penipuan | 1 | 0 | 0 | 1 |
| mencatut_portal | penipuan | 1 | 0 | 0 | 0 |
| program_fiktif | penipuan | 3 | 0 | 2 | 1 |
| informasi_minim | asli | 1 | 1 | 0 | 0 |
| shortlink | asli | 2 | 1 | 1 | 0 |
| umkm_wa | asli | 1 | 0 | 1 | 0 |
| umkm | asli | 14 | 9 | 5 | 0 |
| luar_negeri_resmi | asli | 5 | 0 | 5 | 0 |
| komisi | asli | 1 | 1 | 0 | 0 |
| bahasa_mendesak | asli | 1 | 1 | 0 | 0 |
| kerja_lepas | asli | 1 | 0 | 1 | 0 |
| walk_in | asli | 1 | 1 | 0 | 0 |

### Per jenis input

| Input | n | Deteksi | Alarm palsu | Lolos kritis |
|---|---|---|---|---|
| teks+gambar | 31 | 29.0% (9/31) | - | 9.7% (3/31) |
| teks | 49 | 43.8% (7/16) | 0.0% (0/33) | 0.0% (0/16) |
| gambar | 20 | 33.3% (1/3) | 0.0% (0/17) | 0.0% (0/3) |

### Kesalahan fatal (untuk analisis)

| ID | Label | Prediksi | Modus/tag | Alasan sistem |
|---|---|---|---|---|
| P015 | penipuan | rendah | impersonasi, kontak_wa | Tingkat Risiko Awal: Rendah. Lowongan ini berasal dari perusahaan yang jelas dan terverifikasi, serta tidak ada indikasi permintaan uang atau data sensitif. |
| P031 | penipuan | rendah | data_sensitif, link_di_bio | Tingkat Risiko Awal: Rendah. Informasi perusahaan dan posisi yang ditawarkan jelas, serta kanal pendaftaran mengarah ke halaman karier resmi perusahaan. |
| P069 | penipuan | rendah | data_sensitif, link_di_bio | Tingkat Risiko Awal: Rendah. Identitas perusahaan jelas, proses seleksi dinyatakan tidak dipungut biaya, dan benefit yang ditawarkan wajar. |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 7.6 dtk / 11.6 dtk |
| Latensi LLM p50 / p95 | 3.9 dtk / 5.3 dtk |
| Rata-rata token input / output | 2369 / 788 |
| Jatuh ke fallback aturan | 0.0% (0/100) |
| Risk floor diterapkan | 0 |
| Sitasi halusinasi dibuang | 0 (di 0 kasus) |
| Kutipan palsu dibuang | 2 (di 2 kasus) |
| Status pencarian | empty: 16, ok: 30, skipped_no_query: 54 |
| Status baca lampiran | ok: 51, none: 49 |

