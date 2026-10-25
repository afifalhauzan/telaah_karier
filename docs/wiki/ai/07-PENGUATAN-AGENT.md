# 🧠 07. Penguatan Agent: TelaahAlur, Klaster Domain, dan Classifier Sendiri

Status: **terimplementasi di branch `feat/telaah-alur`** (25 Okt 2026), belum di-deploy.

Masukan yang dijawab: "apa bedanya dengan chatbot AI biasa?" Perbandingan dengan Claude Sonnet + skill (folder `web/eval/comparison/`) menunjukkan akurasi setara; aplikasi unggul di biaya (~17× lebih hemat token) dan latensi (~9× lebih cepat). Supaya keunggulannya bukan hanya biaya, agent diberi tiga hal yang **tidak bisa direplikasi dengan prompt**:

| Tambahan | Kenapa chatbot biasa tidak punya |
|---|---|
| TelaahAlur di chat | Aturan prosedur penempatan yang deterministik, bukan tebakan model |
| Klaster domain (Certificate Transparency) | Data log sertifikat publik yang tidak ada di pengetahuan model |
| Classifier sendiri + pipeline data harian | Dataset dan bobot milik sendiri, diperbarui tiap hari |

---

## 1. TelaahAlur di dalam TelaahLoker

- **Pemicu:** pesan orang pertama yang sedang dalam proses ("saya sudah terlanjur daftar", "paspor saya diminta", "besok berangkat") atau dalam bahaya ("HP disita", "tidak boleh keluar"). Deteksi di `web/lib/telaah-alur/trigger.ts`; teks lowongan biasa tidak memicu.
- **Tampilan:** kartu pertanyaan interaktif di dalam jawaban chat (`data-alur-check`), dengan jawaban yang sudah terbaca dari pesan diisi otomatis dan dikonfirmasi pengguna.
- **Mesin:** **aturan saja, tanpa panggilan model.** Lima jalur (migran, domestik, lokal, remote, magang), temuan beserta dasar hukum dan kontak (BP2MI, Safe Travel, IASC OJK, cekrekening.id). Kode: `web/lib/telaah-alur/`.

## 2. Klaster Domain dari Certificate Transparency

Setiap sertifikat HTTPS dicatat publik beserta nama host-nya. Satu operasi penipuan sering menjalankan banyak situs rekrutmen palsu di satu domain (`recruitment-buma.aply.my.id`, `pt-timah-tbk.open-rekrutmen.aply.my.id`) atau memutar subdomain acak (`h7.daftar-segera.site`). Log menunjukkannya **sebelum ada artikel cek fakta**.

- Sumber Cert Spotter (crt.sh terlalu lambat). Berjalan paralel dengan pencarian web, jadi tidak menambah waktu tunggu.
- Sinyal `cert_cluster`: menyamar sebagai ≥2 merek → kuat (floor tinggi); ≥3 situs rekrutmen atau ≥4 subdomain bergiliran → sedang.
- Kode: `web/langchain/agents/analyzer/tools/ct-cluster.ts`.

## 3. Pipeline Data Harian (Laravel)

| Jadwal (WIB) | Perintah | Isi |
|---|---|---|
| 03:00 | `scam-reports:sync` | Artikel baru kategori lowongan TurnBackHoax: teks, narasi, penjelasan, tautan sumber, tautan arsip (Wayback, archive.ph), gambar |
| 03:30 | `legit-postings:sync` | Lowongan asli dari KarirHub Kemnaker (penyeimbang kelas) |
| 04:00 | `classifier:retrain` | Ekspor pool ke volume bersama, minta service `ml` melatih model penantang |

- Scheduler berjalan lewat `schedule:work` di supervisord (`api/supervisord.conf`).
- Sopan: jeda 1 detik antar-request, User-Agent menyebut tujuan riset, robots.txt kedua situs mengizinkan.
- Data bisa ditinjau manual: kolom `status` (`new`/`reviewed`/`rejected`); yang `rejected` tidak ikut dilatih.
- **Pencegah shortcut learning:**
  - Laporan yang hanya berisi narasi pemeriksa fakta ("Beredar unggahan…") tidak diekspor, karena model akan mempelajari gaya tulisan Mafindo, bukan pola penipuan.
  - Dari KarirHub hanya teks tulisan pemberi kerja yang diambil, bukan label dan isian formulir portal.
  - Sisa risiko: lowongan asli semuanya berformat portal resmi. Lowongan asli dari WhatsApp/UMKM perlu ditambahkan manual (lihat bagian 6).
- Kode: `api/app/Support/`, `api/app/Console/Commands/`.

## 4. Classifier dan Loop MLOps (`ml/`)

- **Model:** TF-IDF n-gram kata (1–2) dan karakter (3–5, tahan terhadap ejaan samaran seperti "p3ndaftaran") + logistic regression. Ringan di CPU, dan bisa dijelaskan: n-gram yang paling mendorong skor ditampilkan ke pengguna.
- **Champion/challenger:** model penantang dilatih dari data lama, diuji pada 20% data **terbaru** per kelas. Model penantang hanya menggantikan model aktif jika F1 dan recall-nya tidak lebih buruk.
  - Model dipakai persis seperti saat diuji, tanpa dilatih ulang dengan seluruh pool. Kalau dilatih ulang, model aktif akan "sudah melihat" data uji berikutnya dan tidak pernah kalah.
  - Pelatihan dilewati jika pool tidak berubah (hash data sama).
  - Setiap run mencatat `metrics.json` (jumlah data, hash data, skor). File model hanya disimpan untuk versi yang dipakai.
- **Keseimbangan kelas:** lowongan asli dari KarirHub dibatasi 3× jumlah laporan penipuan yang bisa dilatih. KarirHub menambah puluhan lowongan per hari, sedangkan cek fakta hanya satu atau dua.
- **Tidak bocor ke evaluasi:** URL dan teks yang ada di `web/eval/dataset/dataset.csv` dikeluarkan dari data latih. Skor pada split dev dilaporkan terpisah (`eval_dev`) agar sebanding dengan evaluasi agent.
- **Di agent:** satu baris di daftar pemeriksaan ("Kemiripan dengan kasus penipuan", skor + kata pemicu), **bukan penentu verdict**. Ratusan contoh belum cukup untuk mengalahkan aturan, bukti web, dan model yang membaca seluruh lowongan. Jika service mati, analisis tetap jalan tanpa baris ini (timeout 1,5 detik).
- **Hasil pelatihan pertama (25 Okt 2026, lokal):**
  - Pool: 333 laporan TurnBackHoax (Okt 2023–Okt 2026), 110 di antaranya mengutip lowongannya; 320 lowongan KarirHub.
  - Setelah deduplikasi dan pengecualian data evaluasi: 86 penipuan, 224 asli.
  - Validasi waktu (data terbaru): F1 0,97, presisi 1,00, recall 0,94 (n=63).
  - Split dev dataset evaluasi: F1 0,84, presisi 0,91, recall 0,78 (n=36).
  - **Kelemahan yang terlihat dari penjelasan model:** kata "lowongan", "pt", "link", "bio" mendorong skor ke penipuan. Penipuan berbunyi "Lowongan kerja PT X… link di bio", sedangkan lowongan KarirHub dibuka dengan nama jabatan. Lowongan asli di media sosial kemungkinan ikut mendapat skor tinggi. Modus tugas online juga masih lemah (contoh "deposit tugas dulu komisi cair" hanya 0,60), karena kategori lowongan TurnBackHoax didominasi pencatutan BUMN. Keduanya diperbaiki dengan data, bukan dengan model (bagian 6).
- **Classifier gambar:** ditunda. Hampir semua gambar dari TurnBackHoax sudah diberi cap "SALAH/PENIPUAN" oleh Mafindo, sehingga model akan belajar mengenali cap itu. Gambar tanpa cap (diambil dari sumber asli/arsip) ditandai `stamped=false` di pool dan akan dipakai setelah jumlahnya cukup.

## 5. Untuk Deploy (Afif)

- Migrasi baru: `scam_reports`, `legit_postings`.
- Service baru `ml` di `docker-compose.yml` (volume `ml-models`, membaca `api-storage` read-only).
- `api/supervisord.conf` sekarang menjalankan scheduler.
- Opsional: `CERTSPOTTER_API_KEY` di `web/.env` (tanpa key, kuota per jam lebih kecil).
- Setelah deploy pertama, jalankan **sebagai www-data** (`docker compose exec` default-nya root; folder storage milik root membuat scheduler malam gagal menulis):
  - `docker compose exec -u www-data api php artisan scam-reports:sync --all`
  - `docker compose exec -u www-data api php artisan legit-postings:sync --pages=20`
  - `docker compose exec -u www-data api php artisan classifier:retrain`

## 6. Pekerjaan Lanjutan

- Kirim permintaan akses API Yudistira (Mafindo) untuk menggantikan scraping.
- Kumpulkan lowongan asli non-portal (WhatsApp, Instagram resmi perusahaan, UMKM) sebagai hard negative, dan contoh penipuan tugas online dari sumber lain (cekfakta, laporan polisi siber).
- Kumpulkan gambar tanpa cap untuk classifier gambar.
- Jalankan ulang evaluasi dev (engine berubah: sinyal `cert_cluster` dapat menaikkan floor) dan laporkan sebagai iterasi baru.
