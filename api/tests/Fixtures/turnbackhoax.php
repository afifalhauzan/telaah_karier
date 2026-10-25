<?php

// Synthetic pages in TurnBackHoax's markup (as of Oct 2026), for the parser and sync tests

/**
 * A KarirHub listing page: links to the postings, and their data streamed as escaped JSON inside a
 * script (as of Oct 2026). The first posting is KarirHub's own, the rest come from a partner portal.
 */
function karirhub_listing(array $ids): string
{
    $links = implode('', array_map(fn ($id) => "<a href=\"/lowongan-dalam-negeri/lowongan/admin-gudang-{$id}\">Admin</a>", $ids));
    $objects = implode(',', array_map(fn ($id, $i) => json_encode([
        'id' => $id, 'title' => 'Admin Gudang', 'companyName' => 'PT Contoh Logistik Nusantara', 'publishedAt' => 1792883739,
        'platformId' => $i ? 'p-1' : null, 'platformLink' => $i ? "https://www.kitalulus.com/lowongan/detail/admin-{$i}?utm_source=pasker" : null,
        'platformName' => $i ? 'Kitalulus' : null, 'platformType' => $i ? 'external' : 'internal',
    ], JSON_UNESCAPED_SLASHES), $ids, array_keys($ids)));

    return "<html><body>{$links}<script>self.__next_f.push([1,\"".addslashes("[{$objects}]").'"])</script></body></html>';
}

/** A KarirHub posting page; partner portals put the employer's text under "Deskripsi Pekerjaan". */
function karirhub_posting(string $description = 'Mencatat barang masuk dan keluar gudang setiap hari, menyusun laporan stok mingguan, dan berkoordinasi dengan tim pengiriman.'): string
{
    return <<<HTML
<html><head><title>Karirhub - Admin Gudang | Karirhub Kemnaker</title><script>var x = "Deskripsi Pekerjaan palsu";</script></head><body>
<nav>Lowongan Pekerjaan Pemberi Kerja Jobfair</nav>
<main><h1>Admin Gudang</h1><p>Kota Malang, Jawa Timur</p>
<h2>Deskripsi Pekerjaan</h2><p>{$description}</p><h3>Persyaratan Khusus</h3><p>Cek deskripsi untuk kualifikasi dan benefit.</p>
<h2>Persyaratan Umum</h2><p>Minimal pendidikan SMA atau sederajat</p><p>Kondisi fisik Disabilitas &amp; Non disabilitas</p>
<p>PT Contoh Logistik Nusantara</p><a href="/perusahaan/1">Lihat Profil Perusahaan</a></main>
<footer>Kementerian Ketenagakerjaan RI</footer></body></html>
HTML;
}

/** cekfakta.com's search page, which embeds its results as JSON (as of Oct 2026) */
function cekfakta_search(array $ids): string
{
    $results = json_encode(array_map(fn ($id) => [
        'id' => (string) $id, 'authors' => 'Liputan 6', 'status' => 'Salah', 'classification' => 'CekFakta',
        'title' => 'Cek Fakta: Tidak Benar Link Pendaftaran Lowongan Kerja Contoh', 'content' => '<p>Liputan6.com, Jakarta</p>',
        'claim_review' => [], 'media' => [[]],
    ], $ids));

    return "<html><body><div id=\"results\"></div><script>const responseData = {$results};\nrender(responseData);</script></body></html>";
}

function turnbackhoax_listing(array $ids): string
{
    $cards = implode('', array_map(
        fn ($id) => "<div class=\"news-card\"><a href=\"https://turnbackhoax.id/articles/{$id}-penipuan-lowongan-kerja-pt-contoh\">[PENIPUAN] Lowongan Kerja PT Contoh</a></div>",
        $ids
    ));

    return "<html><body><main>{$cards}</main><a href=\"/articles?category=lowongan&page=2\">2</a></body></html>";
}

function turnbackhoax_article(string $title = '[PENIPUAN] Lowongan Kerja PT Contoh Tambang', string $verdict = 'Salah'): string
{
    return str_replace(['[PENIPUAN] Lowongan Kerja PT Contoh Tambang', '<strong>Salah</strong>'], [$title, "<strong>{$verdict}</strong>"], <<<'HTML'
<html><head><title>x</title></head><body>
<article>
  <div>
    <h1>[PENIPUAN] Lowongan Kerja PT Contoh Tambang</h1>
    <p><span><a href="/articles?category=Lowongan">Lowongan</a></span> <time datetime="2026-10-17">17/10/2026</time> <span>Mafindo</span></p>
  </div>
  <section>
    <figure><img src="https://yudistira.turnbackhoax.id/uploads/1_HEADER_-_Light_Background_(17).png" alt="header"></figure>
    <section class="article-origin custom-styling-editor">
      <strong class="block mb-4">Narasi</strong>
      <div class="quoted">
        <p>Akun TikTok “lokercontoh” mengunggah <a href="https://www.tiktok.com/@lokercontoh/photo/123">foto</a> [<a href="https://archive.ph/AbCdE">arsip</a>] berisi lowongan. Berikut narasinya:</p>
        <p>“Perusahaan Tambang PT Contoh Tambang dibuka mulai 8 Oktober 2026. Syarat &amp; cara melamar lewat link di bio profil”.</p>
        <p><img src="https://yudistira.turnbackhoax.id/uploads/2_SALAH_lowongan.png"></p>
      </div>
    </section>
    <section class="article-explanation custom-styling-editor">
      <strong class="block mb-4">Penjelasan</strong>
      <div><p>Tautan di bio meminta nama sesuai KTP dan nomor Telegram.</p></div>
    </section>
    <section class="article-explanation">
      <strong class="block mb-4">Kesimpulan</strong>
      <div> Faktanya, PT Contoh Tambang tidak membuka lowongan. </div>
    </section>
    <section class="article-factcheck">
      <strong class="block mb-4">Hasil Periksa fakta</strong>
      <div class="quoted"><p><span class="factcheck-result"><strong>Salah</strong></span> <span>Sumber: </span> <a href="https://web.archive.org/web/2026/https://contoh.example">arsip</a></p></div>
    </section>
    <section class="article-references">
      <strong class="block mb-4">Referensi</strong>
      <div><ul>
        <li><a href="https://www.contohtambang.co.id/career/">https://www.contohtambang.co.id/career/</a></li>
        <li><a href="https://www.tiktok.com/@lokercontoh/photo/123">https://www.tiktok.com/@lokercontoh/photo/123</a></li>
      </ul></div>
    </section>
  </section>
  <section class="article--sidebar"><img src="https://example.org/other-article.png"></section>
</article>
</body></html>
HTML);
}
