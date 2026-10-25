<?php

namespace Tests\Feature;

use App\Models\LegitPosting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

require_once __DIR__.'/../Fixtures/turnbackhoax.php';

class LegitPostingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_genuine_postings_are_collected_with_their_portal_and_known_ones_are_skipped(): void
    {
        config(['services.scam_reports.request_delay_ms' => 0]);
        Http::preventStrayRequests();
        Http::fake([
            'karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan?page=1' => Http::response(karirhub_listing([
                '01a16f23-4acb-70e1-9cc4-376f869568e8', '01a16f22-bb73-7321-b631-b0c2a3b1de6d',
            ])),
            'karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan?page=*' => Http::response(''),
            'karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan/*' => Http::response(karirhub_posting()),
        ]);

        $this->artisan('legit-postings:sync')->expectsOutput('Added 2 new postings.')->assertSuccessful();

        $partner = LegitPosting::where('external_id', '01a16f22-bb73-7321-b631-b0c2a3b1de6d')->sole();
        $this->assertSame(['PT Contoh Logistik Nusantara', 'Kitalulus', '2026-10-24'], [
            $partner->company, $partner->platform, $partner->published_at->toDateString(),
        ]);
        $this->artisan('legit-postings:sync')->expectsOutput('Added 0 new postings.');
    }
}
