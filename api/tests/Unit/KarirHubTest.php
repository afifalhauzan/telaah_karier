<?php

namespace Tests\Unit;

use App\Support\KarirHub;
use PHPUnit\Framework\TestCase;

require_once __DIR__.'/../Fixtures/turnbackhoax.php';

class KarirHubTest extends TestCase
{
    public function test_the_listing_gives_posting_ids(): void
    {
        $postings = KarirHub::listingPostings(karirhub_listing(['01a16f23-4acb-70e1-9cc4-376f869568e8']));

        $this->assertSame(
            ['01a16f23-4acb-70e1-9cc4-376f869568e8' => 'https://karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan/admin-gudang-01a16f23-4acb-70e1-9cc4-376f869568e8'],
            $postings
        );
    }

    public function test_a_posting_gives_its_description_without_the_site_around_it(): void
    {
        $posting = KarirHub::parsePosting(karirhub_posting());

        $this->assertSame('Admin Gudang', $posting['title']);
        $this->assertSame('PT Contoh Logistik Nusantara', $posting['company']);
        $this->assertStringStartsWith("Admin Gudang\nMencatat barang masuk", $posting['posting_text']);
        // The portal's own labels and form fields would teach a model "portal layout = genuine"
        $this->assertStringNotContainsString('Persyaratan', $posting['posting_text']);
        $this->assertStringNotContainsString('Jobfair', $posting['posting_text']);
        // Script text is not page text
        $this->assertStringNotContainsString('palsu', $posting['posting_text']);
    }
}
