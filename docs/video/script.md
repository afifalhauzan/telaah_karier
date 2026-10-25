# Skrip Video Explainer TelaahKarier (Final Gemastik 2026)

Disusun 26 Okt 2026 dari kode di `main` (`3d4ed5f`).

## Asumsi (pengguna belum memilih; ubah bila perlu)

| Hal | Pilihan di skrip ini | Alasan |
|---|---|---|
| Durasi | ±5 menit 30 detik | Batas video presentasi + demo 10 menit; sisa waktu untuk demo langsung atau Q&A rekaman. Adegan 4 dan 9 bisa dipotong bila perlu versi lebih pendek. |
| Narator | Bergantian: **Narator A** (pembuka/penutup), **Narator B** (demo produk), **AI Engineer** (adegan 5–8) | Juri menilai penguasaan tiap anggota; AI engineer membawakan bagian yang akan ditantang juri. |
| Bahasa | Narasi Bahasa Indonesia; teks di layar Bahasa Inggris, mengikuti slide | Slide sudah berbahasa Inggris. Istilah teknis (turn router, shortlink, RDAP) dibiarkan apa adanya. |
| Porsi AI engineer | Adegan 5–8: alur AI, guardrails, evaluasi (±2 menit 40 detik) | Sesuai slide 10–12. |

Tempo narasi dihitung ±2,3 kata per detik. Jeda visual sudah termasuk dalam durasi adegan.

## Angka evaluasi: iterasi 3 (diputuskan 26 Okt 2026)

Video dan slide 11–12 memakai **iterasi 3** (`web/eval/results/iterasi3/report.md`, 25 Okt 2026, commit `5ab680a`, 265 kasus, split waktu), bukan iterasi 2 (100 kasus, 15 Okt) yang masih ada di slide lama. Daftar perubahan slide ada di `segmen-7-9.md`.

- Iterasi 3 sudah mengukur mesin analisis yang sekarang: link checks, QR, basis kasus, CT log, dan pernyataan resmi sudah ada di `5ab680a`, dan `web/langchain/` tidak berubah sejak commit itu.
- Ablasi (aturan saja 30%, LLM 64%, lengkap 66%) **hanya ada di iterasi 2** dengan kode lama; ablasi iterasi 3 tidak selesai karena kuota. Skrip tidak menyebut ablasi.
- Prompt injection tidak diuji ulang di iterasi 3. Run injeksi terdokumentasi (`injeksi-final2`, 15 Okt): 3/21 verdict bergeser. Ada run lebih baru yang tidak terdokumentasi di wiki (`injeksi-pemeriksaan-web-2`, 22 Okt, commit `494c5e4`): 7/21 bergeser. Di kedua run, **tidak ada lowongan penipuan yang turun menjadi Rendah**. Skrip hanya memakai klaim yang berlaku di kedua run.

---

## Ringkasan adegan

| # | Waktu | Durasi | Narator | Isi |
|---|---|---|---|---|
| 1 | 0:00–0:20 | 20 dtk | Narator A | Masalah |
| 2 | 0:20–0:45 | 25 dtk | Narator A | Solusi: TelaahKarier |
| 3 | 0:45–1:50 | 65 dtk | Narator B | Demo telaah di chat |
| 4 | 1:50–2:25 | 35 dtk | Narator B | TelaahBareng dan TelaahAlur |
| 5 | 2:25–3:20 | 55 dtk | AI Engineer | Alur AI (1): router, baca dulu, telusuri link |
| 6 | 3:20–3:55 | 35 dtk | AI Engineer | Alur AI (2): aturan + bukti paralel |
| 7 | 3:55–4:30 | 35 dtk | AI Engineer | LLM + guardrails |
| 8 | 4:30–5:15 | 45 dtk | AI Engineer | Evaluasi |
| 9 | 5:15–5:35 | 20 dtk | Narator A | Penutup |

---

## Adegan 1 — Masalah (0:00–0:20, 20 dtk)

**Narator A:**
> Lowongan kerja palsu jarang terlihat palsu. Logonya meyakinkan, nama perusahaannya besar, dan link pendaftarannya disembunyikan di bio atau di balik shortlink. Pelamar baru sadar setelah diminta biaya, data pribadi, atau diberangkatkan lewat jalur yang tidak resmi.

**Visual:** Montase cepat 3 poster lowongan dari dataset evaluasi (diburamkan nomor dan kontaknya). Sorot kata "link di bio", shortlink, dan "biaya administrasi".
**Teks layar:** *Fake job posts rarely look fake.*

## Adegan 2 — Solusi (0:20–0:45, 25 dtk)

**Narator A:**
> TelaahKarier membantu pelamar menelaah lowongan sebelum melamar. Tempel teksnya, kirim link-nya, atau unggah poster, screenshot, maupun PDF lowongan. TelaahKarier memberi tingkat risiko awal, alasan beserta buktinya, dan langkah yang bisa dicek sendiri. Kami sengaja menyebutnya risiko awal, bukan vonis, dan keyakinannya tidak pernah ditampilkan seratus persen.

**Visual:** Halaman chat kosong, kursor menunjuk tombol lampiran. Potongan kartu "Tingkat Risiko Awal".
**Teks layar:** *Paste text, a link, a poster, or a PDF → initial risk level + evidence + what to check.*

## Adegan 3 — Demo telaah di chat (0:45–1:50, 65 dtk)

**Narator B:**
> Misalnya poster ini. Begitu dikirim, panel tahapan menampilkan pemeriksaan yang benar-benar sedang berjalan: membaca lampiran, menelusuri link, mencocokkan pola, lalu mencari bukti.
>
> Hasilnya tersusun berlapis. Paling atas, tingkat risiko awal dan ringkasan dengan sumber yang bisa dibuka. Di bawahnya daftar risiko, masing-masing dengan kutipan dari materi lowongan. Daftar pemeriksaan menunjukkan apa saja yang sudah dicek, dan bila ada, kasus cek fakta yang mirip ikut ditampilkan.
>
> Dari sini pengguna bisa lanjut: validasi perusahaan, periksa link dan kontak, cek kewajaran gaji, atau minta langkah aman. Pertanyaan lanjutan dijawab dalam konteks lowongan yang sama.

**Visual (rekaman layar, urut):**
1. Unggah satu poster penipuan dengan link atau QR (pilih kasus yang menghasilkan Tinggi dan kartu kasus serupa; uji dulu sebelum merekam).
2. Panel tahapan bertambah baris demi baris. Jangan dipercepat di bagian ini; itu bukti tahapannya nyata.
3. Gulir pelan: kartu risiko → ringkasan + badge sumber → kartu risiko berkutipan → daftar pemeriksaan → kasus cek fakta serupa → rujukan.
4. Klik satu tombol aksi ("Periksa Link & Kontak"), tampilkan hasilnya sekilas.
5. Ketik pertanyaan lanjutan, misalnya "Bagaimana cara memverifikasi perusahaan ini?", tampilkan jawabannya.

**Teks layar:** *Live pipeline steps · cited summary · quoted evidence · checklist · similar fact-checked cases.*

## Adegan 4 — TelaahBareng dan TelaahAlur (1:50–2:25, 35 dtk)

**Narator B:**
> Lowongan palsu biasanya disebar berulang kali. Karena itu, sebelum menelaah, TelaahKarier mengecek apakah lowongan serupa sudah pernah ditelaah dan dibagikan di TelaahBareng. Kalau ada, pengguna langsung membaca telaah itu beserta diskusinya. Hasil Sedang atau Tinggi juga bisa dibagikan menjadi post baru. Dan bila pengguna bercerita, misalnya, "saya sudah diminta paspor", chat menawarkan TelaahAlur untuk memeriksa proses rekrutmen yang sedang dijalani.

**Visual:**
1. Kirim lowongan yang sudah ada di TelaahBareng → kartu "sudah pernah ditelaah" muncul tanpa analisis ulang.
2. Tombol "Buat post?" di bawah hasil Sedang/Tinggi → halaman post TelaahBareng.
3. Ketik "saya sudah diminta paspor oleh agennya" → kartu tawaran TelaahAlur → satu-dua pertanyaan TelaahAlur.

**Teks layar:** *TelaahBareng: shared analyses, checked before every new one · TelaahAlur: for applicants already in a process.*

## Adegan 5 — Alur AI (1): router, baca dulu, telusuri link (2:25–3:20, 55 dtk)

**AI Engineer:**
> Saya [nama], AI engineer TelaahKarier. Setiap pesan masuk ke turn router dulu. Lampiran, link, atau teks panjang diperlakukan sebagai materi baru; pertanyaan pendek dijawab sebagai tanya-jawab lanjutan dengan konteks lowongan yang sedang dibahas.
>
> Materi baru dibaca sekali: teks di semua lampiran ditranskripsi dalam satu panggilan model, lalu semua tahap berikutnya bekerja dari teks itu. QR code di poster dibaca oleh decoder, bukan oleh model, supaya tidak ada alamat yang dikarang.
>
> Lalu sistem menelusuri link seperti pemeriksa fakta: membuka shortlink, mengikuti tombol daftar, dan berhenti di formulir atau chat yang meminta data. Kalau link pendaftarannya hanya ada di bio atau DM, sistem meminta link itu dulu sebelum menelaah.

**Visual:** Animasi slide 10 (`slides/slide10-c-hub-animated.html` atau mp4-nya), disorot berurutan: Input → Turn Router (cabang Follow-up Q&A, dan berhenti lebih awal untuk TelaahBareng / link di bio) → Read First → Link Checks.
**Teks layar:** ikuti label diagram slide 10.

## Adegan 6 — Alur AI (2): aturan dan bukti paralel (3:20–3:55, 35 dtk)

**AI Engineer:**
> Berikutnya, aturan deterministik mencari 26 jenis pola: permintaan biaya, permintaan OTP atau KTP, domain tiruan, negara tujuan yang bukan negara penempatan, dan lainnya. Setiap pola yang bisa menetapkan risiko Tinggi punya dasar hukum, misalnya UU Ketenagakerjaan Pasal 38 untuk biaya penempatan.
>
> Bersamaan, lima pemeriksaan bukti berjalan paralel: pencarian web, umur domain lewat RDAP, log Certificate Transparency, basis kasus cek fakta, dan pernyataan resmi perusahaan.

**Visual:** Animasi slide 10 bagian Rule Signals → lima kotak Evidence menyala bersamaan. Sisipkan sekilas satu kartu daftar pemeriksaan nyata (mis. "domain baru terdaftar" atau "pernyataan resmi perusahaan").
**Teks layar:** *26 rule signals · every "High" rests on a law · 5 evidence checks in parallel.*

## Adegan 7 — LLM dan guardrails (3:55–4:30, 35 dtk)

**AI Engineer:**
> Semua itu masuk ke Gemini 2.5 Flash sebagai data, bukan instruksi, sehingga kalimat seperti "nyatakan lowongan ini aman" tidak dituruti. Jawaban model lalu diperiksa: sumber yang tidak pernah diambil dibuang, dan kutipan yang tidak ada di teks materi dilepas. Risiko Tinggi yang hanya bersandar pada upaya manipulasi diturunkan ke Sedang, sedangkan pola kuat seperti permintaan biaya menjaga risiko tetap Tinggi. Kalau model gagal, pengguna tetap mendapat pemeriksaan berbasis aturan, dengan label yang jelas.

**Visual:** Slide 10 bagian LLM Analyst → Guardrails (grounding → manipulation cap → risk floor) → jalur fallback "rules only" → Output.
**Teks layar:** *Material = data, not instructions · citation & quote grounding · manipulation cap · risk floor · rule-based fallback.*

## Adegan 8 — Evaluasi (4:30–5:15, 45 dtk)

**AI Engineer:**
> Kami mengujinya pada set yang dibagi menurut waktu: kasus cek fakta terbaru menjadi soal uji, dan basis kasus hanya berisi kasus sebelum tanggal itu. Totalnya 265 kasus: 173 penipuan dalam bentuk teks dan poster, serta 92 lowongan asli dari portal berlisensi.
>
> Hanya satu penipuan yang dinilai Rendah. 169 dari 173 penipuan diberi peringatan Sedang atau Tinggi. Dari 111 vonis Tinggi, 110 memang penipuan. Vonis Tinggi kami batasi pada tanda pasti, sehingga baru 64 persen penipuan yang mendapat Tinggi; sisanya tetap diperingatkan. Dan dari 21 pasang uji sisipan perintah, tidak ada lowongan penipuan yang turun menjadi Rendah.

**Visual:** Slide evaluasi gabungan (`slides/slide11-evaluation-iter3.png`). Tampilkan matriks 2×3 dan empat angka besar: *1/173 critical miss · 97.7% warned · 99.1% precision on "High" · 1/92 false alarm.*
**Teks layar:** *Time-split test set · 265 cases · fact-check sites blocked from search.*

## Adegan 9 — Penutup (5:15–5:35, 20 dtk)

**Narator A:**
> TelaahKarier tidak menggantikan kanal resmi. Ia membantu pelamar berhenti sejenak, melihat buktinya, dan memeriksa ke sumber yang benar sebelum menyerahkan uang atau data.

**Visual:** Logo, URL telaahkarier.com, nama tim dan kampus.

---

## Daftar klaim dan sumber

Nomor baris mengacu ke commit `3d4ed5f`.

| # | Adegan | Klaim | Sumber |
|---|---|---|---|
| 1 | 2 | Input: teks, link, gambar (poster/screenshot), PDF | `web/lib/attachments.ts:8-12`; `web/app/api/chat/route.ts:45-46` |
| 2 | 2 | Disebut "Tingkat Risiko Awal" | `web/langchain/agents/analyzer/analyze.ts:195-198` |
| 3 | 2 | Keyakinan tidak pernah 100% (maks 0,95) | `analyze.ts:150-151`, `analyze.ts:313` |
| 4 | 3 | Panel tahapan melaporkan tahap yang benar-benar selesai, bukan diputar ulang | `route.ts:411-421`; `analyze.ts:567-571` |
| 5 | 3 | Ringkasan bersitasi, risiko dengan kutipan, daftar pemeriksaan, kasus serupa, rujukan | `route.ts:440-496`; `analyze.ts:811-841` |
| 6 | 3 | Tombol aksi: Validasi Perusahaan, Cek Red Flag, Periksa Link & Kontak, Cek Kewajaran Gaji, Beri Langkah Aman | `web/types/ui-actions.ts:38-63` |
| 7 | 3, 5 | Pertanyaan lanjutan dijawab dengan konteks lowongan | `route.ts:302-335`; `turn-router.ts:26-77` |
| 8 | 4 | Cek TelaahBareng sebelum analisis, hanya untuk materi pertama sesi | `route.ts:342-391` |
| 9 | 4 | Hanya hasil Sedang/Tinggi yang bisa dibagikan | `route.ts:507-511` |
| 10 | 4 | TelaahAlur ditawarkan bila pengguna (orang pertama) bilang sudah dalam proses, mis. "diminta paspor" | `route.ts:223-227`; `web/lib/telaah-alur/trigger.ts:12-13, 47-50` |
| 11 | 5 | Router: lampiran, teks >500 karakter, atau link → analisis; selebihnya classifier model | `turn-router.ts:21-22, 42-73` |
| 12 | 5 | Lampiran ditranskripsi sekali, tahap berikutnya memakai teksnya | `analyze.ts:594-635`; `extraction.ts:17-20` |
| 13 | 5 | QR dibaca decoder (jsQR), bukan model, agar alamat tidak dikarang | `tools/qr.ts:1-5` |
| 14 | 5 | Penelusuran link: shortlink → tombol daftar → berhenti di formulir/chat | `tools/link-checks.ts:3-7`; `analyze.ts:642-669` |
| 15 | 5 | Link hanya di bio/komentar/DM → diminta dulu sebelum analisis | `route.ts:393-408`; `checks.ts:124-129` |
| 16 | 6 | 26 jenis sinyal aturan | `signals.ts:15-41` (union `SignalId`) |
| 17 | 6 | Setiap floor Tinggi punya dasar hukum; contoh UU 13/2003 Pasal 38 untuk biaya | `signals.ts:54-55, 77` |
| 18 | 6 | Lima pemeriksaan bukti paralel lewat `Promise.all` | `analyze.ts:693-701` |
| 19 | 6 | Pencarian web via Tavily | `tools/tavily-search.ts:255, 309` |
| 20 | 6 | Umur domain via RDAP | `tools/domain-age.ts:1-3, 44` |
| 21 | 6 | Certificate Transparency (Cert Spotter) | `tools/ct-cluster.ts:4-10, 80` |
| 22 | 6 | Basis kasus cek fakta (TurnBackHoax dan media mitra) | `tools/knowledge.ts:8-12, 56-85` |
| 23 | 6 | Pernyataan resmi perusahaan | `tools/official-statement.ts:6-9, 78-110` |
| 24 | 7 | Model produksi Gemini 2.5 Flash | `llm.ts:44`; `docs/wiki/ai/09-PEMILIHAN-MODEL.md` |
| 25 | 7 | Materi dibungkus tag sebagai data, bukan instruksi; perintah di data tidak dituruti | `prompts.ts:9, 15-16` |
| 26 | 7 | Sitasi ke sumber yang tidak diambil dibuang | `analyze.ts:276-280` |
| 27 | 7 | Kutipan yang tidak ada di teks materi dilepas (risikonya tetap) | `analyze.ts:207-221, 294-297` |
| 28 | 7 | Tinggi karena manipulasi saja → Sedang | `analyze.ts:370-392, 797-802` |
| 29 | 7 | Risk floor: pola kuat menjaga level minimum | `analyze.ts:333-368, 803-807` |
| 30 | 7 | Model gagal → pemeriksaan berbasis aturan berlabel | `analyze.ts:409-478, 781-795` |
| 31 | 8 | Split waktu, basis kasus dipotong di cutoff, situs cek fakta diblokir | `docs/wiki/ai/05-DATASET-EVALUASI.md` bagian 11 |
| 32 | 8 | 265 kasus = 173 penipuan (92 teks, 81 poster) + 92 asli | `web/eval/results/iterasi3/report.md`; doc 05 bagian 11 |
| 33 | 8 | Lolos kritis 1/173 (0,6%) | `iterasi3/report.md` |
| 34 | 8 | 169/173 diberi peringatan Sedang/Tinggi (97,7%) | doc 05 bagian 11 |
| 35 | 8 | 110 dari 111 vonis Tinggi benar (presisi 99,1%) | `iterasi3/report.md` |
| 36 | 8 | Deteksi tegas 63,6% (110/173), dibulatkan "64 persen" | `iterasi3/report.md` |
| 37 | 8 | Alarm palsu 1/92 | `iterasi3/report.md` |
| 38 | 8 | 21 pasang injeksi: tidak ada penipuan turun ke Rendah | `web/eval/results/injeksi-final2/report.md`, `web/eval/results/injeksi-pemeriksaan-web-2/report.md` (baris penipuan: 0 Rendah di keduanya) |

Path tanpa awalan di tabel ada di `web/langchain/agents/analyzer/`.

### Sengaja tidak diklaim

- Angka kerugian atau jumlah korban penipuan lowongan secara nasional: tidak ada sumbernya di repo. Bila ingin dipakai di adegan 1, tambahkan sumber resmi di tabel ini.
- Ablasi (30% / 64% / 66%): hanya iterasi 2, kode lama.
- "Model tidak pernah menuruti sisipan": hanya terdokumentasi untuk run 15 Okt, belum dicek untuk run 22 Okt.
- Latensi (p50 8,3 detik) dan biaya (±$3,43 per 1.000 telaah) ada di doc 05 bagian 11, tetapi tidak dipakai di narasi. Bisa ditambahkan ke adegan 8 bila juri perlu angka operasional.
