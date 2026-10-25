<?php

// Synthetic pages in TurnBackHoax's and KarirHub's markup (as of Oct 2026), for the parser and sync tests

function karirhub_listing(array $ids): string
{
    return implode('', array_map(
        fn ($id) => "<a href=\"/lowongan-dalam-negeri/lowongan/admin-gudang-{$id}\">Admin</a>",
        $ids
    ));
}

function karirhub_posting(): string
{
    return <<<'HTML'
<html><head><title>Karirhub - Admin Gudang | Karirhub Kemnaker</title><script>var x = "Deskripsi Pekerjaan palsu";</script></head><body>
<nav>Lowongan Pekerjaan Pemberi Kerja Jobfair</nav>
<main><h1>Admin Gudang</h1><p>Kota Malang, Jawa Timur</p>
<h2>Deskripsi Pekerjaan</h2><h3>Admin Gudang</h3><h3>Persyaratan Khusus</h3><p>Mencatat barang masuk dan keluar gudang setiap hari, menyusun laporan stok mingguan, dan berkoordinasi dengan tim pengiriman.</p>
<h2>Persyaratan Umum</h2><p>Minimal pendidikan SMA atau sederajat</p><p>Kondisi fisik Disabilitas &amp; Non disabilitas</p>
<p>PT Contoh Logistik Nusantara</p><a href="/perusahaan/1">Lihat Profil Perusahaan</a></main>
<footer>Kementerian Ketenagakerjaan RI</footer></body></html>
HTML;
}

function turnbackhoax_listing(array $ids): string
{
    $cards = implode('', array_map(
        fn ($id) => "<div class=\"news-card\"><a href=\"https://turnbackhoax.id/articles/{$id}-penipuan-lowongan-kerja-pt-contoh\">[PENIPUAN] Lowongan Kerja PT Contoh</a></div>",
        $ids
    ));

    return "<html><body><main>{$cards}</main><a href=\"/articles?category=lowongan&page=2\">2</a></body></html>";
}

function turnbackhoax_article(): string
{
    return <<<'HTML'
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
HTML;
}
