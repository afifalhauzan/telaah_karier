# 🧠 07. Penguatan Agent: Masa Lalu, Masa Kini, Tindak Lanjut

Status: **terimplementasi di branch `feat/telaah-alur`** (26 Okt 2026), belum di-deploy.

Masukan yang dijawab: "apa bedanya dengan chatbot AI biasa?" Perbandingan dengan Claude Sonnet + skill ([08-PERBANDINGAN-SONNET.md](08-PERBANDINGAN-SONNET.md), data di `web/eval/comparison/`) menunjukkan akurasi setara; aplikasi unggul di biaya (~17× lebih hemat token) dan latensi (~9× lebih cepat). Supaya keunggulannya bukan hanya biaya, agent dibingkai dalam tiga lapisan yang **tidak bisa direplikasi dengan prompt**:

| Lapisan | Isi | Kenapa chatbot biasa tidak punya |
|---|---|---|
| **Masa lalu** | Basis pengetahuan kasus penipuan lowongan yang sudah diverifikasi pemeriksa fakta (TurnBackHoax dan media mitra), diperbarui setiap malam | Data dan kurasi milik sendiri, tidak ada di pengetahuan model |
| **Masa kini** | Pencarian web, umur domain, log sertifikat (Certificate Transparency), isi link | Bukti terkini yang bisa diperiksa |
| **Tindak lanjut** | TelaahBareng, TelaahAlur untuk yang sudah terlanjur mendaftar | Chatbot berhenti di jawaban |

---

## 1. Masa Lalu: Basis Pengetahuan Kasus Terverifikasi

### 1.1 Isi dan pengumpulan (Laravel, otomatis setiap malam)

| Jadwal (WIB) | Perintah | Isi |
|---|---|---|
| 03:00 | `scam-reports:sync` | Artikel cek fakta lowongan dari tiga jalur: kategori "Lowongan" TurnBackHoax, pencarian "lowongan" di TurnBackHoax (artikel lama di luar kategori), dan ID baru setelah ID terakhir yang dibaca (artikel media mitra/CekFakta, yang tidak ada di daftar mana pun). Hanya verdict `Salah`; artikel `Klarifikasi` (lowongan asli yang diragukan) dilewati. |
| 04:30 | `scam-reports:cards` | Setiap laporan baru dijadikan kartu kasus lewat endpoint internal web (`/api/internal/case-card`), karena kunci model ada di web. |

- Scheduler berjalan lewat `schedule:work` di supervisord (`api/supervisord.conf`).
- Sopan: jeda 1 detik antar-request, User-Agent menyebut tujuan riset, robots.txt mengizinkan.
- Data bisa ditinjau manual: kolom `status` (`new`/`reviewed`/`rejected`); yang `rejected` tidak dipakai.
- `scam-reports:sync --refresh` membaca ulang artikel yang tersimpan (setelah parser diperbaiki) tanpa mengubah status, dan kartunya dibuat ulang malam itu.
- Kode: `api/app/Support/TurnBackHoax.php`, `api/app/Console/Commands/`.

### 1.2 Bentuk pengetahuan

Tiga bentuk, dari yang paling spesifik ke yang paling umum:

1. **Kartu kasus** (kolom `card`), dibuat model (`GEMINI_CARD_MODEL`, default model Gemini biasa): modus (taksonomi yang sama dengan dataset evaluasi), entitas yang dicatut, kanal, ciri, kutipan lowongan, dan **jalur resmi menurut pemeriksa fakta**. Jalur resmi hanya disimpan jika kalimatnya benar-benar ada di penjelasan artikel, jadi tidak ada yang dikarang.
2. **Graph identitas** (tabel `scam_report_identifiers`): nomor, email, rekening, domain, dan akun penyebar. Identitas diambil **dengan aturan** dari teks lowongan dan link sumber, tidak pernah dari model, sehingga tidak ada nomor yang salah dituduhkan. Kasus yang berbagi identitas membentuk **jaringan operasi** (misalnya akun `infoloker378` mencatut Komatsu, Kaltim Prima Coal, Vale, dan Adaro dalam dua minggu).
3. **Embedding** (kolom `embedding`, Gemini `gemini-embedding-001`, 768 dimensi) dari judul dan teks lowongan, untuk mencari kasus serupa.

Ditambah hitungan per entitas ("PT X dicatut N kali") yang dihitung saat pencarian.

### 1.3 Cara agent memakainya

`POST /api/knowledge/search` (internal) dipanggil paralel dengan pencarian web:

- **Cocok identitas** → sinyal aturan `known_scam_identity` dengan **floor "tinggi"**. Identitas hanya diambil dari materi pengguna sendiri, bukan dari halaman link (yang memuat "lowongan serupa" milik perusahaan lain).
- **Kasus serupa** (kemiripan ≥ 0,6, maksimal 3) → **konteks saja**, tidak menaikkan risiko. Lowongan asli Magang Bakti BCA paling mirip dengan kasus penipuan "BCA", jadi kemiripan mencerminkan perusahaan dan topik, bukan penipuan atau tidaknya.
- Kedua jenis kasus masuk ke prompt sebagai sumber (`S…`) berjudul "Kasus penipuan terverifikasi …", sehingga sitasi, pengaman sumber, dan daftar rujukan yang sudah ada langsung berlaku.
- Baris baru di daftar pemeriksaan: **"Basis kasus terverifikasi"**.

### 1.4 Uji kecil sebelum dibangun (25 Okt 2026, 333 kasus)

| Uji | Embedding | TF-IDF | Acak |
|---|---|---|---|
| Kasus yang mencatut entitas yang sama ada di 3 hasil teratas (224 kasus) | **0,66** | 0,43 | 0,04 |
| AUC penipuan vs asli dari kemiripan tertinggi (split dev, 27 vs 9) | **0,82** | 0,66 | 0,50 |

Graph identitas: 28 jaringan (≥2 kasus) mencakup 89 kasus. Hasil ini yang membuat classifier TF-IDF + logistic regression sebelumnya **dipensiunkan**: classifier tidak ikut menentukan verdict, cenderung memberi skor tinggi pada lowongan asli di media sosial, dan embedding lebih baik untuk mencari kasus serupa. Kodenya tetap ada di riwayat git.

### 1.5 Evaluasi

Kasus dari dataset evaluasi dikeluarkan dari basis pengetahuan selama evaluasi: lewat URL sumbernya, dan lewat kemiripan ≥ 0,9 untuk salinan yang tercatat di artikel lain (`web/eval/run.ts`). Tanpa ini agent hanya "mengingat" jawabannya: 21 dari 36 kasus dev ada di basis pengetahuan.

## 2. Masa Kini

### 2.1 Klaster domain dari Certificate Transparency

Setiap sertifikat HTTPS dicatat publik beserta nama host-nya. Satu operasi penipuan sering menjalankan banyak situs rekrutmen palsu di satu domain (`recruitment-buma.aply.my.id`, `pt-timah-tbk.open-rekrutmen.aply.my.id`) atau memutar subdomain acak (`h7.daftar-segera.site`). Log menunjukkannya **sebelum ada artikel cek fakta**.

- Sumber Cert Spotter (crt.sh terlalu lambat). Berjalan paralel dengan pencarian web.
- Sinyal `cert_cluster`: menyamar sebagai ≥2 merek → kuat (floor tinggi); ≥3 situs rekrutmen atau ≥4 subdomain bergiliran → sedang.
- Kode: `web/langchain/agents/analyzer/tools/ct-cluster.ts`.

### 2.2 Jejak pendaftaran (cara pemeriksa fakta menelusuri link)

Dari 457 artikel cek fakta di basis pengetahuan: di 2026, 52% lowongan palsu menyembunyikan alamatnya di **link bio** (2024: 6%), 92% link berujung di **formulir data pribadi**, dan 86% formulir itu meminta **nomor Telegram** (lalu kode verifikasinya, untuk mengambil alih akun). Hanya sekitar 1 dari 13 lowongan menuliskan alamatnya, dan alamat yang tertulis berupa subdomain panjang di domain acak (`rekrutmenbersamaskkmigasdankkks.piillly.com`). QR code tidak pernah tercatat sebagai jalur, tapi tetap didekode.

Agent menelusuri jalur yang sama (`web/langchain/agents/analyzer/tools/link-checks.ts`):

- Titik awal: link di materi dan link dari **QR code** di gambar (`tools/qr.ts`, didekode `jsqr`, bukan oleh model yang bisa mengarang alamat). Maksimal 3 titik awal, 2 lompatan, 6 langkah.
- Shortlink dibuka tujuannya (termasuk halaman peringatan `lnkd.in`), lalu halaman dibaca lewat Tavily dan **tombol "Daftar"** di halaman itu diikuti.
- **Google Form** dibaca langsung dari `docs.google.com` (pertanyaannya ada di data halaman); formulir yang dibatasi login akun Google tercatat sebagai tertutup login.
- Setiap langkah berakhir dengan status: formulir (dengan data yang diminta), halaman, chat WhatsApp/Telegram, tertutup login, atau tidak dapat dibaca. Profil Instagram/Facebook/TikTok tertutup login, jadi untuk "link di bio" pengguna diminta menyalin link-nya.
- Sinyal: formulir meminta kode verifikasi, kata sandi, atau foto KTP → floor tinggi; meminta nomor Telegram → floor sedang; subdomain rekrutmen panjang di domain tak dikenal → floor sedang.

### 2.3 Link dan perusahaan luar negeri

- Halaman link dibaca dalam format markdown, sehingga alamat yang tertulis di halaman (misalnya link pendaftaran di komentar LinkedIn) ikut terbaca.
- `lnkd.in` dibuka tujuannya, termasuk shortlink di halaman yang dibaca.
- Nama perusahaan dengan bentuk hukum di belakang (Inc, Ltd, LLC, Corp, GmbH, Co., Ltd., Sdn Bhd, Pte Ltd) ikut dicari di web.

## 3. Tindak Lanjut: TelaahAlur di dalam TelaahLoker

- **Pemicu:** pesan orang pertama yang sedang dalam proses ("saya sudah terlanjur daftar", "paspor saya diminta", "besok berangkat") atau dalam bahaya ("HP disita", "tidak boleh keluar"). Deteksi di `web/lib/telaah-alur/trigger.ts`; teks lowongan biasa tidak memicu.
- **Tampilan:** kartu pertanyaan interaktif di dalam jawaban chat (`data-alur-check`), dengan jawaban yang sudah terbaca dari pesan diisi otomatis dan dikonfirmasi pengguna.
- **Mesin:** **aturan saja, tanpa panggilan model.** Lima jalur (migran, domestik, lokal, remote, magang), temuan beserta dasar hukum dan kontak (BP2MI, Safe Travel, IASC OJK, cekrekening.id). Kode: `web/lib/telaah-alur/`.

## 4. Untuk Deploy (Afif)

- Migrasi baru: `scam_reports`, lalu kolom kartu kasus dan tabel `scam_report_identifiers`.
- `api/supervisord.conf` sekarang menjalankan scheduler.
- Api memanggil web lewat `WEB_INTERNAL_URL` (default `http://web:3000`), dengan `TELAAH_INTERNAL_KEY` yang sama.
- Opsional: `CERTSPOTTER_API_KEY` dan `GEMINI_EMBEDDING_MODEL` / `GEMINI_CARD_MODEL` di `web/.env`.
- Setelah deploy pertama, jalankan **sebagai www-data** (`docker compose exec` default-nya root; folder storage milik root membuat scheduler malam gagal menulis):
  - `docker compose exec -u www-data api php artisan scam-reports:sync --all`
  - `docker compose exec -u www-data api php artisan scam-reports:cards`

## 5. Pekerjaan Lanjutan

- Kirim permintaan akses API Yudistira (Mafindo): menggantikan scraping, dan satu-satunya jalan mengambil artikel media mitra yang **lama** (sebelum ID pertama yang dipindai).
- Draf aduan otomatis ke TurnBackHoax/CekFakta dan isi kolom form instansi (Kemnaker, Patroli Siber, LAPOR!) di TelaahBareng.
- Jalankan ulang evaluasi dev (engine berubah: `cert_cluster`, basis pengetahuan) dan laporkan sebagai iterasi baru.
