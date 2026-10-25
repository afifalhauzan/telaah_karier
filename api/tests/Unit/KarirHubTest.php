<?php

namespace Tests\Unit;

use App\Support\KarirHub;
use PHPUnit\Framework\TestCase;

require_once __DIR__.'/../Fixtures/turnbackhoax.php';

class KarirHubTest extends TestCase
{
    public function test_the_listing_gives_each_posting_with_its_company_and_portal(): void
    {
        $postings = KarirHub::listingPostings(karirhub_listing(['01a16f23-4acb-70e1-9cc4-376f869568e8', '01a16f22-bb73-7321-b631-b0c2a3b1de6d']));

        $this->assertSame([
            'url' => 'https://karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan/admin-gudang-01a16f23-4acb-70e1-9cc4-376f869568e8',
            'title' => 'Admin Gudang',
            'company' => 'PT Contoh Logistik Nusantara',
            'platform' => 'Karirhub',
            'platform_type' => 'internal',
            'platform_link' => null,
            'published_at' => '2026-10-24',
        ], $postings['01a16f23-4acb-70e1-9cc4-376f869568e8']);
        $this->assertSame(['Kitalulus', 'external'], [
            $postings['01a16f22-bb73-7321-b631-b0c2a3b1de6d']['platform'], $postings['01a16f22-bb73-7321-b631-b0c2a3b1de6d']['platform_type'],
        ]);
    }

    public function test_a_posting_gives_its_description_without_the_portal_around_it(): void
    {
        $text = KarirHub::postingText(karirhub_posting(), 'Admin Gudang');

        $this->assertStringStartsWith("Admin Gudang\nMencatat barang masuk", $text);
        // The portal's labels, filler, and form fields would make every genuine posting look alike
        foreach (['Persyaratan', 'Cek deskripsi', 'Jobfair', 'Disabilitas', 'palsu'] as $portalText) {
            $this->assertStringNotContainsString($portalText, $text);
        }
        // KarirHub's own postings repeat the title as the description's first line
        $this->assertSame("Admin Gudang\nMencatat stok.", KarirHub::postingText(karirhub_posting('Admin Gudang Mencatat stok.'), 'Admin Gudang'));
    }
}
