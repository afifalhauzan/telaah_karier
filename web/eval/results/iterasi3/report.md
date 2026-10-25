# Laporan Evaluasi TelaahKarier

| Run | Nilai |
|---|---|
| Dimulai | 2026-10-25T16:23:54.908Z |
| Commit | 5ab680a |
| Dataset | eval/dataset/v2/dataset.csv (sha256 95f18ef3a78a) |
| Split | test |
| Model | extraction: gemini-2.5-flash, analysis: gemini-2.5-flash |
| Override env | - |

## Ringkasan per varian

| Varian | n | Lolos kritis | Deteksi | Alarm palsu | F1 ketat | F1 longgar | Injeksi berhasil | Latensi p50/p95 | Token in/out |
|---|---|---|---|---|---|---|---|---|---|
| lengkap | 265 | 0.6% (1/173) | 63.6% (110/173) | 1.1% (1/92) | 77.5% | 92.3% | - | 8.3 dtk / 12.1 dtk | 5012 / 770 |

Lolos kritis = penipuan dinilai rendah. Deteksi = penipuan dinilai tinggi. Alarm palsu = asli dinilai tinggi. Ketat: hanya tinggi dihitung penipuan; longgar: sedang dan tinggi.

## Varian `lengkap`: Aturan + pencarian web + LLM (produksi)

### Matriks hasil (n = 265)

| Label \ Prediksi | rendah | sedang | tinggi | tanpa verdict |
|---|---|---|---|---|
| penipuan | 1 | 59 | 110 | 3 |
| asli | 68 | 23 | 1 | 0 |

### Metrik utama (IK 95% Wilson)

| Metrik | Nilai |
|---|---|
| Lolos kritis (penipuan → rendah) | 0.6% (1/173; 0.1%–3.2%) |
| Deteksi (penipuan → tinggi) | 63.6% (110/173; 56.2%–70.4%) |
| Alarm palsu (asli → tinggi) | 1.1% (1/92; 0.2%–5.9%) |
| Tanpa verdict | 1.1% (3/265; 0.4%–3.3%) |

| Ambang | Precision | Recall | F1 | TP/FP/FN/TN |
|---|---|---|---|---|
| Ketat (tinggi = penipuan) | 99.1% | 63.6% | 77.5% | 110/1/63/91 |
| Longgar (sedang+tinggi = waspada) | 87.6% | 97.7% | 92.3% | 169/24/4/68 |

### Penipuan per modus

| Modus | n | Deteksi (tinggi) | Waspada (sedang+tinggi) | Lolos kritis |
|---|---|---|---|---|
| impersonasi | 165 | 64.8% (107/165) | 98.2% (162/165) | 0.6% (1/165) |
| data_sensitif | 8 | 37.5% (3/8) | 87.5% (7/8) | 0.0% (0/8) |

### Per jenis input

| Input | n | Deteksi | Alarm palsu | Lolos kritis |
|---|---|---|---|---|
| teks | 184 | 70.7% (65/92) | 1.1% (1/92) | 0.0% (0/92) |
| gambar | 81 | 55.6% (45/81) | - | 1.2% (1/81) |

### Kesalahan fatal (untuk analisis)

| ID | Label | Prediksi | Modus/tag | Alasan sistem |
|---|---|---|---|---|
| G083 | penipuan | rendah | impersonasi | Tingkat Risiko Awal: Rendah. Lowongan ini mengarahkan pelamar ke portal rekrutmen yang terverifikasi sebagai situs resmi PT Kawasaki Motor Indonesia dan menyata |
| A090 | asli | tinggi | - | Tingkat Risiko Awal: Tinggi. Lowongan ini mencatut nama perusahaan besar (J&T Express) namun kanal pendaftaran yang digunakan tidak resmi dan dikelola oleh piha |

### Operasional

| Ukuran | Nilai |
|---|---|
| Latensi total p50 / p95 | 8.3 dtk / 12.1 dtk |
| Latensi LLM p50 / p95 | 4.2 dtk / 5.2 dtk |
| Rata-rata token input / output | 5012 / 770 |
| Jatuh ke fallback aturan | 0.0% (0/265) |
| Risk floor diterapkan | 1 |
| Batas manipulasi diterapkan | 0 |
| Sitasi halusinasi dibuang | 0 (di 0 kasus) |
| Kutipan palsu dibuang | 5 (di 5 kasus) |
| Status pencarian | skipped_no_query: 110, empty: 25, ok: 130 |
| Status baca lampiran | none: 184, ok: 81 |

