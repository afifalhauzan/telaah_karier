<?php

namespace Tests\Unit;

use App\Support\TurnBackHoax;
use PHPUnit\Framework\TestCase;

require_once __DIR__.'/../Fixtures/turnbackhoax.php';

class TurnBackHoaxTest extends TestCase
{
    public function test_the_listing_gives_article_ids_newest_first(): void
    {
        $articles = TurnBackHoax::listingArticles(turnbackhoax_listing([37236, 37222]));

        $this->assertSame([37236, 37222], array_keys($articles));
        $this->assertSame('https://turnbackhoax.id/articles/37236-penipuan-lowongan-kerja-pt-contoh', $articles[37236]);
    }

    public function test_an_article_gives_the_scam_wording_its_links_and_its_images(): void
    {
        $article = TurnBackHoax::parseArticle(turnbackhoax_article());

        $this->assertSame('[PENIPUAN] Lowongan Kerja PT Contoh Tambang', $article['title']);
        $this->assertSame('2026-10-17', $article['published_at']);
        $this->assertSame('Lowongan', $article['category']);
        $this->assertSame('Salah', $article['verdict']);
        // The quoted post, not Mafindo's description of it
        $this->assertSame(
            'Perusahaan Tambang PT Contoh Tambang dibuka mulai 8 Oktober 2026. Syarat & cara melamar lewat link di bio profil',
            $article['posting_text']
        );
        $this->assertStringStartsWith('Akun TikTok', $article['narrative']);
        $this->assertSame('Tautan di bio meminta nama sesuai KTP dan nomor Telegram.', $article['explanation']);
        $this->assertSame('Faktanya, PT Contoh Tambang tidak membuka lowongan.', $article['conclusion']);
        $this->assertSame('tiktok', $article['platform']);
        $this->assertSame(['https://www.tiktok.com/@lokercontoh/photo/123'], $article['source_links']);
        $this->assertSame(['https://archive.ph/AbCdE', 'https://web.archive.org/web/2026/https://contoh.example'], $article['archive_links']);
        // The header and the sidebar are not the scam; Mafindo's own image is marked as stamped
        $this->assertSame([['url' => 'https://yudistira.turnbackhoax.id/uploads/2_SALAH_lowongan.png', 'stamped' => true]], $article['image_urls']);
    }

    public function test_platforms_are_read_from_the_original_link(): void
    {
        $this->assertSame('facebook', TurnBackHoax::platform('https://m.facebook.com/groups/1/posts/2'));
        $this->assertSame('x', TurnBackHoax::platform('https://twitter.com/a/status/1'));
        $this->assertSame('web', TurnBackHoax::platform('https://rekrutmen-palsu.example/daftar'));
    }
}
