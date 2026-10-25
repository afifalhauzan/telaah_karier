# 🧭 09. Pemilihan Model Produksi (Gemini Flash)

**Keputusan (25 Okt 2026): produksi tetap memakai `gemini-2.5-flash`** untuk tahap baca lampiran dan analisis.

## 1. Pertanyaan

Apakah model Flash yang lebih baru (3, 3.6, 3.8) layak menggantikan `gemini-2.5-flash` di TelaahLoker, dengan melihat kualitas, ketahanan terhadap manipulasi, kecepatan, dan biaya?

## 2. Cara Uji

- **Data:** split `dev` (39 kasus: 28 penipuan, 11 asli) dan split `injeksi` (21 pasang versi bersih/disisipi) dari `web/eval/dataset/dataset.csv`. Set `test` dan set iterasi 3 (split waktu) **tidak** dipakai, supaya pemilihan model tidak menyetel apa pun dengan data uji (bagian 6, doc 05).
- **Konfigurasi:** varian `lengkap` (aturan + pencarian web + basis kasus + LLM), sama dengan produksi. Model yang diuji dipasang di tahap baca lampiran dan analisis sekaligus (`GEMINI_EXTRACTION_MODEL`, `GEMINI_ANALYSIS_MODEL`). Artikel cek fakta kasus itu sendiri dikeluarkan dari basis kasus, dan situs cek fakta diblokir dari pencarian web.
- **Engine:** commit `6cd8f2a` untuk keempat run. Ketentuan "tinggi" berbasis dasar hukum (doc 07 bagian 2.4) sudah berlaku.
- **Biaya:** token dari metadata Gemini, termasuk token berpikir (ditagih sebagai output; sebelum `6cd8f2a` tidak ikut terhitung). Harga paid tier dari ai.google.dev/gemini-api/docs/pricing, dibaca 25 Okt 2026.
- **Metrik:** sesuai protokol doc 05 bagian 6, dengan urutan prioritas lolos kritis → deteksi → alarm palsu; biaya dan latensi pendukung.

Menjalankan ulang:
```bash
cd web
pnpm eval --split dev,injeksi --env GEMINI_ANALYSIS_MODEL=<model> --env GEMINI_EXTRACTION_MODEL=<model> --out eval/results/pilih-model/<model>
npx jiti eval/compare-models.ts eval/results/pilih-model/<model-1> eval/results/pilih-model/<model-2> ...
```

## 3. Hasil

| Model | Lolos kritis | Deteksi (tinggi) | Alarm palsu | F1 ketat | F1 longgar | Injeksi berhasil | Latensi p50 / p95 | Biaya per 1.000 telaah |
|---|---|---|---|---|---|---|---|---|
| `gemini-2.5-flash` | **0/28** (0–12%) | **21/28 = 75%** (57–87%) | 1/11 (2–38%) | **84%** | 91.8% | 7/21 | 9.2 / 28.0 dtk | **$4.09** |
| `gemini-3-flash-preview` | 1/28 (1–18%) | 19/28 = 68% (49–82%) | 0/11 (0–26%) | 80.9% | 93.1% | 8/21 | 8.6 / 21.1 dtk | $6.50 |
| `gemini-3.6-flash` | 0/28 (0–12%) | 16/28 = 57% (39–74%) | 1/11 (2–38%) | 71.1% | 90.3% | 6/21 | 10.5 / 20.3 dtk | $8.72 |
| `gemini-3.8-flash` | 0/28 (0–12%) | 11/28 = 39% (24–58%) | 0/11 (0–26%) | 56.4% | 93.3% | 5/21 | 15.0 / 26.2 dtk | $8.98 |

Rentang dalam kurung adalah interval kepercayaan 95% (Wilson). Laporan lengkap per model: `web/eval/results/pilih-model/<model>/report.md`; tabel: `web/eval/results/pilih-model/perbandingan.md`.

## 4. Pembacaan

1. **Lolos kritis.** Hanya `gemini-3-flash-preview` yang meloloskan satu penipuan sebagai `rendah`. Ditambah statusnya yang masih *preview*, model ini tidak dipilih.
2. **Deteksi.** Makin baru modelnya, makin jarang ia memberi `tinggi`: 21 → 19 → 16 → 11 dari 28. Penipuan yang tidak `tinggi` turun ke `sedang`, bukan `rendah`, sehingga F1 longgar keempat model hampir sama (90–93%). Model baru tampak lebih ketat mengikuti aturan "tinggi hanya dengan dasar hukum", dan memberi `sedang` saat tanda pastinya tidak ada di materi (misalnya link di bio). Ini sesuai prinsip produk, tetapi mengurangi peringatan tegas.
3. **Alarm palsu.** 3 Flash dan 3.8 Flash tidak memberi `tinggi` pada lowongan asli, sedangkan 2.5 dan 3.6 sekali (A008, kerja luar negeri resmi dengan biaya ditanggung pekerja). Dengan hanya 11 lowongan asli, selisih 0 dan 1 belum bermakna (rentangnya tumpang tindih).
4. **Injeksi.** 2.5 Flash paling sering bergeser oleh sisipan (7/21), 3.8 Flash paling tahan (5/21). Selisihnya kecil dibanding rentang ketidakpastiannya.
5. **Biaya dan latensi.** 2.5 Flash paling murah ($4.09 per 1.000 telaah), sekitar separuh 3.6/3.8 Flash. Harga 3.6/3.8 juga naik dua kali lipat mulai 1 Jan 2027. Latensi p50 2.5 Flash termasuk tercepat; p95-nya paling lambat.

## 5. Keputusan dan Batasan

`gemini-2.5-flash` tetap dipakai: tidak ada lolos kritis, deteksi tertinggi, dan biaya terendah. Model 3.x tidak memberi perbaikan yang terukur pada metrik utama, dan lebih mahal.

Batasan yang perlu disebut saat presentasi:
- **Sampel kecil.** 39 kasus dan 11 lowongan asli; banyak selisih masih di dalam rentang kepercayaan. Hanya penurunan deteksi 2.5 → 3.8 (75% vs 39%) yang rentangnya nyaris tidak bertumpuk.
- **Satu run per model.** Model berpikir bervariasi antar-run; run ulang bisa menggeser satu atau dua kasus.
- **Dev bukan test.** Hasil akhir dilaporkan dari evaluasi iterasi 3 (doc 05 bagian 11) dengan model yang dipilih di sini.
- Bila prioritas berubah ke "nol alarm palsu", `gemini-3.8-flash` layak diuji ulang di set yang lebih besar, dengan konsekuensi lebih banyak penipuan yang hanya mendapat `sedang`.
