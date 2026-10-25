# Draft Segmen 7–9 (bagian Gaung)

Pengganti segmen 7–9 dari skrip awal tim, dengan batas waktu yang sama. Diperiksa terhadap kode di `main` (`3d4ed5f`), 26 Okt 2026.
Tempo: ±2,5 kata per detik. Segmen 7 dan 9 padat, jadi baca latihan dengan stopwatch dan potong kalimat bertanda *(opsional)* bila lewat.

## Koreksi atas skrip awal (wajib dibaca dulu)

1. **"Input disamarkan sebelum dikirim ke Gemini" tidak benar.** `redactSensitive` (NIK dan kode OTP/PIN) hanya dipakai saat materi **dipublikasikan ke TelaahBareng**: post, cerita, dan komentar (`web/langchain/agents/telaah-bersama/share-payload.ts:89`, `web/app/api/telaah-bersama/route.ts:70`, `.../comments/route.ts:25`). Input chat dikirim ke Gemini tanpa disamarkan. Yang benar: *log server hanya mencatat metadata, tidak pernah teks lowongan* (`web/app/api/chat/route.ts:424`), dan *NIK serta kode OTP disensor sebelum apa pun tampil publik di TelaahBareng*. Kalimat ini sudah dihapus dari draft di bawah. Kalau tim ingin tetap mengklaimnya, fiturnya harus dibuat dulu.
2. **Angka 100 kasus (precision 97%, recall 66%, F1 79%) adalah iterasi 2** (15 Okt), diukur sebelum link checks, QR, basis kasus, CT log, dan pernyataan resmi ditambahkan. **Diputuskan 26 Okt: video dan slide memakai iterasi 3** (25 Okt, `web/eval/results/iterasi3/report.md`), yang mengukur mesin yang sekarang dipakai (`web/langchain/` tidak berubah sejak commit run itu, `5ab680a`). Perubahan slide 11–12 ada di bagian akhir berkas ini.
3. **Prompt injection** tidak diuji ulang di iterasi 3. Klaim "tidak ada skenario yang membuat model menuruti instruksi" hanya terdokumentasi untuk run 15 Okt (`injeksi-final2`). Run 22 Okt (`injeksi-pemeriksaan-web-2`) belum dianalisis di wiki. Segmen 9 versi baru tidak memuat injeksi karena waktunya habis untuk evaluasi utama. Lihat catatan di akhir bila tetap ingin dimasukkan.

---

## [GAUNG] 05:15–06:00 — Segmen 7: System Architecture (45 detik)

**[PRESENTER / VOICE-OVER]** (±110 kata)

> Setiap lapisan kami pilih untuk satu kebutuhan. Frontend Next.js kami pilih karena mudah diintegrasikan dengan LangChain dalam bahasa yang sama, TypeScript, sehingga kami tidak perlu membangun server AI terpisah. Laravel dan PostgreSQL mengurus akun, kuota, TelaahBareng, dan basis kasus, termasuk penjadwal malamnya. LangChain memaksa jawaban model mengikuti skema, jadi setiap keluaran bisa diperiksa kode. Gemini 2.5 Flash kami pilih setelah diadu dengan Flash 3, 3.6, dan 3.8: deteksinya tertinggi dan biayanya terendah. Halaman lowongan dibaca lewat Tavily, sehingga server kami tidak bisa diarahkan ke alamat internal.
>
> Basis kasusnya kami bangun sendiri dari TurnBackHoax dan cekfakta.com. Setiap pukul tiga pagi, artikel cek fakta lowongan yang baru diambil, lalu diringkas menjadi kartu kasus: siapa yang dicatut, modusnya, kanalnya, dan jalur resminya. Nomor, akun, dan domain penipunya dicatat untuk mengenali operasi yang sama, dan embedding-nya dipakai mencari kasus serupa.

**[POST VISUAL]**
1. 0–20 dtk: diagram arsitektur (Next.js web → Laravel API → PostgreSQL; Next.js → LangChain → Gemini / Tavily / RDAP / Cert Spotter). Sorot tiap kotak sesuai urutan narasi. Di samping tiap kotak, satu label alasan berbahasa Inggris:
   - Next.js: *same language as LangChain.js (TypeScript) · no separate AI server*
   - Laravel + PostgreSQL: *accounts, quota, TelaahBareng, case base, nightly scheduler*
   - LangChain: *schema-enforced model output*
   - Gemini 2.5 Flash: *chosen over Flash 3 / 3.6 / 3.8*
   - Tavily: *reads pages for us, so user links never hit our server*
2. 20–45 dtk: alur basis kasus sebagai pipa horizontal:
   `TurnBackHoax + cekfakta.com → nightly sync 03:00 WIB → case card (impersonated name · modus · channel · official route) → identifiers + embedding → used in every analysis`.
   Tampilkan satu kartu kasus nyata dari halaman hasil telaah (kartu "kasus serupa").

**Catatan untuk presenter (bila juri bertanya):**
- Nomor, akun, atau domain yang sama dengan kasus terbukti = sinyal aturan yang menaikkan risiko minimal ke Sedang. Kemiripan makna hanya konteks, tidak pernah dijadikan bukti, karena magang BCA asli pun mirip dengan penipuan atas nama BCA (`tools/knowledge.ts:6-11`).
- Kartu kasus: model hanya meringkas. Identitas (nomor, akun, domain) diambil dengan aturan, dan jalur resmi harus dikutip dari penjelasan pemeriksa fakta (`web/langchain/agents/knowledge/case-card.ts:6-9`).
- Scraping mengikuti robots.txt dengan User-Agent yang jelas (`api/app/Support/TurnBackHoax.php:10-14`, `SyncScamReports.php:24`).
- Pembanding embedding saat ini dihitung di PHP, cukup untuk beberapa ribu kasus. Rencananya pindah ke pgvector bila basis kasus sudah puluhan ribu (`KnowledgeController.php:85-86`).

## [GAUNG] 06:00–06:45 — Segmen 8: AI Workflow (45 detik)

**[PRESENTER / VOICE-OVER]** (±115 kata)

> Setiap pesan masuk ke turn router: materi baru dianalisis, pertanyaan dijawab dengan konteks lowongan yang sedang dibahas. Materi baru dibaca sekali. Lampiran ditranskripsi, dan QR dibaca oleh decoder, bukan oleh model, agar tidak ada alamat yang dikarang. Link ditelusuri seperti cara pemeriksa fakta, sampai ke formulir atau chat yang meminta data.
>
> Lalu 26 aturan mencari pola seperti permintaan biaya atau OTP, dan setiap pola yang bisa memberi risiko Tinggi punya dasar hukum. Bersamaan, lima bukti dicari paralel: web, umur domain, log sertifikat, basis kasus, dan pernyataan resmi perusahaan.
>
> Semuanya diberikan ke Gemini sebagai data, bukan instruksi. Terakhir, guardrail membuang sitasi dan kutipan yang tidak ada di sumbernya, membatasi vonis Tinggi yang hanya karena manipulasi, dan menjaga pola kuat tetap Tinggi. Kalau model gagal, hasil tetap diberikan berdasarkan aturan.

**[POST VISUAL]** Animasi slide 10 (`slides/slide10-c-hub-animated.html` atau mp4-nya), disorot mengikuti narasi:
Input → Turn Router (cabang Follow-up Q&A) → Read First → Link Checks → Rule Signals → 5 Evidence (menyala bersamaan) → LLM Analyst → Guardrails (grounding → manipulation cap → risk floor) → Output; jalur "rules only" menyala di kalimat terakhir.

## [GAUNG] 06:45–07:15 — Segmen 9: AI Evaluation (30 detik)

**[PRESENTER / VOICE-OVER]** (±80 kata)

> Data uji kami ambil dari arsip cek fakta, dibagi menurut waktu. Dua puluh persen kasus terbaru menjadi soal uji, dan basis kasus hanya berisi kasus yang lebih lama. Hasilnya 265 kasus: 173 penipuan dalam bentuk teks dan poster, serta 92 lowongan asli dari portal berlisensi.
>
> Hanya satu penipuan yang lolos sebagai Rendah, dan 110 dari 111 vonis Tinggi memang penipuan. Tinggi baru diberikan pada 64 persen penipuan, karena kami hanya memberikannya bila ada tanda pasti yang punya dasar hukum. Sisanya tetap diperingatkan sebagai Sedang.

**[POST VISUAL]**
1. 0–12 dtk: garis waktu kasus cek fakta. Bagian 80% lama diberi label *case base (before cutoff 12 Jun 2026)*, bagian 20% terbaru diberi label *test*. Di bawahnya tiga balok: *92 scam texts · 81 scam posters · 92 genuine postings (licensed job portals)*. Catatan kecil: *fact-check sites blocked from web search · each case's own article removed from the case base*.
2. 12–30 dtk: matriks 2×3 (Label × Prediksi) dan empat angka besar:
   - *Critical miss (scam → Low): 1 / 173*
   - *Warned (Medium or High): 169 / 173 (97.7%)*
   - *Precision on High: 110 / 111 (99.1%)*
   - *False alarm (genuine → High): 1 / 92*
   Baris kecil: *High = only with a legally grounded sign → detection 63.6%, posters hardest (55.6% vs 70.7% text).*

**Catatan untuk presenter (bila juri bertanya "kenapa begitu"):**
- **Kenapa deteksi Tinggi hanya 64%:** sejak 25 Okt, Tinggi hanya diberikan bila ada tanda pasti yang punya dasar hukum. Penipuan yang hanya menunjukkan "link di bio" jatuh ke Sedang, yang tetap menampilkan peringatan dan langkah verifikasi. Hanya 4 dari 173 penipuan yang tidak diberi peringatan sama sekali.
- **Kenapa poster lebih sulit:** poster hanya memuat sebagian materi, tanpa caption dan link (55,6% vs 70,7% untuk teks).
- **Satu-satunya yang lolos (G083):** poster resmi Kawasaki yang dipakai ulang penipu. Poster itu menautkan ke portal resmi, sedangkan link palsunya disebar di luar poster. Karena itu chat sekarang meminta link pendaftaran yang tersembunyi sebelum menelaah.
- **Satu-satunya alarm palsu (A090):** lowongan kurir J&T dari mitra outsourcing, yang terbaca sebagai pencatutan nama perusahaan besar.
- **Keterbatasan:** 165 dari 173 penipuan bermodus pencatutan nama; modus biaya, tugas/deposit, dan TPPO belum terwakili. Alarm palsu hanya terukur di teks. Ablasi iterasi 3 tidak selesai karena kuota API.
- **Skema:** setiap kasus dijalankan sekali lewat pipeline produksi lengkap (`gemini-2.5-flash`), lalu verdict dibandingkan dengan label. Interval kepercayaan 95% memakai Wilson: lolos kritis 0,1–3,2%, alarm palsu 0,2–5,9%.

**Bila ingin tetap ada kalimat injeksi** (+8 dtk, ambil dari segmen 8):
> Pada 21 pasang uji sisipan perintah, tidak ada lowongan penipuan yang berhasil diturunkan menjadi Rendah.

Klaim ini benar di kedua run injeksi (15 dan 22 Okt).

---

## Klaim dan sumber

Path tanpa awalan ada di `web/langchain/agents/analyzer/`.

| Seg | Klaim | Sumber |
|---|---|---|
| 7 | Antarmuka dan mesin AI dalam satu kode TypeScript: route handler memanggil `runAnalysis` langsung | `web/app/api/chat/route.ts:4, 413` |
| 7 | Kartu UI memakai tipe dari skema mesin AI (bila juri bertanya) | `web/components/cards/ClaimCard.tsx:2`, `KnownScamCard.tsx:2`, `CitationBadge.tsx:3`, `web/components/chat.tsx:38` |
| 7 | Streaming tiap tahap ke UI | `web/app/api/chat/route.ts:411-421, 538-553` |
| 7 | Laravel + PostgreSQL: akun, kuota, TelaahBareng, basis kasus | `api/app/Http/Controllers/` (Auth, Quota, TelaahPost, Knowledge); `docker-compose.yml` (`postgres:17-alpine`) |
| 7 | Penjadwal malam 03:00 (sync) dan 04:30 (kartu kasus) WIB | `api/routes/console.php` |
| 7 | Keluaran model dipaksa mengikuti skema | `analyze.ts:241-242` (`withStructuredOutput`), `schema.ts` |
| 7 | Gemini 2.5 Flash dipilih atas Flash 3 / 3.6 / 3.8: deteksi tertinggi, biaya terendah, tanpa lolos kritis | `docs/wiki/ai/09-PEMILIHAN-MODEL.md` bagian 5 (uji di dev 39 kasus + 21 injeksi) |
| 7 | Halaman dibaca lewat Tavily; server hanya menghubungi host tetap (shortener, lnkd.in, Google Forms), jadi tidak bisa diarahkan ke host internal | `tools/link-checks.ts:3-7` |
| 7 | Sumber basis kasus: TurnBackHoax + cekfakta.com (termasuk media mitra) | `api/app/Support/TurnBackHoax.php`, `api/app/Support/CekFakta.php:6-8`, `SyncScamReports.php:46-67` |
| 7 | Kartu kasus: entitas, modus, kanal, ciri, jalur resmi | `analyze.ts:829-839`; `web/langchain/agents/knowledge/case-card.ts:6-9` |
| 7 | Identitas sama = sinyal; kemiripan = konteks | `tools/knowledge.ts:6-11` |
| 7 | Embedding `gemini-embedding-001`, 768 dimensi | `web/langchain/agents/knowledge/embedding.ts:4-5` |
| 8 | Turn router | `turn-router.ts:26-77`; `route.ts:312-335` |
| 8 | Baca lampiran sekali | `analyze.ts:594-635`; `extraction.ts:17-20` |
| 8 | QR lewat decoder, bukan model | `tools/qr.ts:1-5` |
| 8 | Penelusuran link sampai formulir/chat | `tools/link-checks.ts:3-7`; `analyze.ts:642-669` |
| 8 | 26 jenis sinyal; floor Tinggi berdasar hukum | `signals.ts:15-41, 54-55, 76-90` |
| 8 | 5 bukti paralel (`Promise.all`) | `analyze.ts:693-701` |
| 8 | Materi = data, bukan instruksi | `prompts.ts:9, 15-16` |
| 8 | Sitasi dan kutipan yang tidak ada dibuang | `analyze.ts:276-280, 294-297` |
| 8 | Manipulation cap, risk floor | `analyze.ts:333-392, 797-808` |
| 8 | Fallback berbasis aturan | `analyze.ts:409-478, 781-795` |
| 9 | Split waktu 20% terbaru = test; basis kasus sebelum cutoff | `api/app/Console/Commands/ExportEvalDataset.php:18, 33-39`; `docs/wiki/ai/05-DATASET-EVALUASI.md` bagian 11 |
| 9 | 265 = 173 penipuan (92 teks, 81 poster) + 92 asli; cutoff 12 Jun 2026 | `web/eval/results/iterasi3/report.md`, `run.json` (`kbBefore`) |
| 9 | Lolos kritis 1/173; Tinggi 110/111; deteksi 63,6%; alarm palsu 1/92; diperingatkan 169/173 | `web/eval/results/iterasi3/report.md`; doc 05 bagian 11 |
| 9 | Alasan dan keterbatasan (G083, A090, komposisi modus) | doc 05 bagian 11 "Pembacaan" dan "Keterbatasan" |
| 9 (opsional) | Injeksi: 0 penipuan turun ke Rendah | `web/eval/results/injeksi-final2/report.md`, `web/eval/results/injeksi-pemeriksaan-web-2/report.md` |

---

## Perubahan slide 11–12 ke iterasi 3

**26 Okt: slide 11 dan 12 digabung menjadi satu slide**, `slides/slide11-evaluation-iter3.html` + `.png` (3480×1600, latar transparan, `base.css` yang sama). Tabel di bawah menjadi catatan asal tiap angka; ablasi diganti panel Text vs Poster, dan injeksi ditandai "15 Oct run".

Sumber slide lama: `slides/slide11-evaluation.html` dan `slides/slide12-evaluation.html` (di luar repo; deck final di Canva). Semua angka baru diambil dari `web/eval/results/iterasi3/report.md` dan `docs/wiki/ai/05-DATASET-EVALUASI.md` bagian 11.

### Slide 11 — Dataset & hasil

| Elemen | Lama (iterasi 2) | Baru (iterasi 3) |
|---|---|---|
| Kotak "Test set" | 100 · 50 scam · 50 legitimate | **265** · 173 scam · 92 legitimate |
| Kotak "Dev set" / "Injection pairs" | 39 / 21 | Tetap (dev untuk tuning; injeksi tidak diulang di iterasi 3) |
| Poin asal label | Komdigi, MAFINDO TurnBackHoax, kanal resmi | Scam: fact-check TurnBackHoax + media mitra CekFakta. Legitimate: KarirHub Kemnaker dan portal berlisensi (Glints, Jobstreet, Kalibrr, dll.) |
| Poin protokol | Test set *frozen* | *Time split*: 20% fact-check terbaru = test; case base hanya kasus sebelum cutoff **12 Jun 2026**; situs cek fakta diblokir dari web search; artikel kasus itu sendiri dikeluarkan |
| Bar jenis input | Text 49 · Text+image 31 · Image 20 | **Text 184** (92 scam + 92 legit) · **Poster 81** (scam) |
| Bar "red flag visible?" | 26 / 24 | Hapus (tidak diukur di iterasi 3) |
| Chip jenis scam | Sensitive data 18, Impersonation 12, … | **Impersonation 165 · Sensitive data 8** |
| Tile 1 | "No Critical Miss" 48/50; High 33 · Medium 15 · none 2; 0 Low | "**1 Critical Miss**" atau "Warned" **169/173**; High 110 · Medium 59 · Low 1 · none 3 |
| Tile 2 Detection | 66%, CI 52–78%, 33/50 | **63.6%**, CI **56–70%**, 110/173 |
| Tile 3 False alarm | 49/50; Low 20 · Medium 29 · High 1 | **91/92**; Low 68 · Medium 23 · High 1 |
| Tile 4 F1 | 79%; precision 97%, recall 66%; 33 of 34 High | **77.5%**; precision **99.1%**, recall **63.6%**; **110 of 111** High are real scams |
| Footer | frozen test set of 100 posts | full pipeline (rules + case base + web search + Gemini 2.5 Flash) · time-split test set of 265 posts |

### Slide 12 — Ablasi, injeksi, operasional, keterbatasan

| Panel | Lama | Baru |
|---|---|---|
| Ablation | Rules 30% · LLM 64% · LLM+Search 66% · Full 66% | Ablasi iterasi 3 **tidak selesai** (kuota API). Usul: ganti panel jadi **"Text vs Poster"**: detection 70.7% (65/92) vs 55.6% (45/81); critical miss 0/92 vs 1/81. Kalau ablasi tetap dipasang, beri label *"iteration 2, earlier code, 100-case set"*. |
| Prompt injection | 3/21; 0/11 scam → safe; model obeyed 0 | Angka boleh tetap, tetapi tambah label *"15 Oct run"*. Iterasi 3 tidak menguji ulang injeksi. Run 22 Okt (belum dibahas di wiki) mencatat 7/21 verdict bergeser, tetapi **0 scam turun ke Low** di kedua run. Kalimat "model obeyed 0" hanya berlaku untuk run 15 Okt. |
| Operations | 7.8 s (p95 12.6 s) · ~3.5K tokens · 0/100 fallback · 2 quotes removed | **8.3 s** (p95 **12.1 s**) · **~5.8K tokens** (5,012 in + 770 out) · **0/265** fallback · **5** fabricated quotes removed · tambahan opsional: **~$3.43 per 1,000 analyses** (model saja, tanpa Tavily) |
| Limitations | Rubrik disetel dari run sebelumnya; legit tanpa link sering Medium; set injeksi dari dev | **165 of 173 scams are impersonation**; fee, task/deposit, and trafficking scams are not represented. False alarms measured on text only. Legitimate posts come from licensed portals; posts circulating on social media may get Medium more often. |
