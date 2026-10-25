<?php

namespace Tests\Feature;

use App\Models\LegitPosting;
use App\Models\ScamReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

require_once __DIR__.'/../Fixtures/turnbackhoax.php';

class ScamReportsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.scam_reports.request_delay_ms' => 0]);
        Storage::fake('local');
    }

    private function fakeSite(array $page1, array $page2 = []): void
    {
        Http::fake([
            'turnbackhoax.id/articles?category=lowongan&page=1' => Http::response(turnbackhoax_listing($page1)),
            'turnbackhoax.id/articles?category=lowongan&page=2' => Http::response(turnbackhoax_listing($page2)),
            'turnbackhoax.id/articles?category=lowongan&page=*' => Http::response(turnbackhoax_listing([])),
            'turnbackhoax.id/articles/*' => Http::response(turnbackhoax_article()),
            'yudistira.turnbackhoax.id/*' => Http::response('png-bytes', 200, ['Content-Type' => 'image/png']),
            'karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan?page=1' => Http::response(karirhub_listing([
                '01a16f23-4acb-70e1-9cc4-376f869568e8', '01a16f22-bb73-7321-b631-b0c2a3b1de6d',
            ])),
            'karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan?page=*' => Http::response(''),
            'karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan/*' => Http::response(karirhub_posting()),
        ]);
    }

    public function test_new_articles_are_stored_with_their_images_and_known_ones_are_skipped(): void
    {
        ScamReport::create([
            'source' => 'turnbackhoax', 'external_id' => 100, 'url' => 'u', 'title' => 't', 'posting_text' => 'p',
            'narrative' => 'n', 'source_links' => [], 'archive_links' => [], 'reference_links' => [], 'images' => [],
        ]);
        $this->fakeSite([102, 101, 100], [99]);

        $this->artisan('scam-reports:sync')->expectsOutput('Added 3 new reports.')->assertSuccessful();

        $report = ScamReport::where('external_id', 102)->firstOrFail();
        $this->assertSame('tiktok', $report->platform);
        $this->assertSame('scam-reports/102/0.png', $report->images[0]['path']);
        Storage::disk('local')->assertExists('scam-reports/102/0.png');
        $this->artisan('scam-reports:sync')->expectsOutput('Added 0 new reports.');
    }

    public function test_a_daily_run_stops_at_a_page_of_known_articles_and_all_walks_on(): void
    {
        foreach ([101, 100] as $id) {
            ScamReport::create([
                'source' => 'turnbackhoax', 'external_id' => $id, 'url' => 'u', 'title' => 't', 'posting_text' => 'p',
                'narrative' => 'n', 'source_links' => [], 'archive_links' => [], 'reference_links' => [], 'images' => [],
            ]);
        }
        $this->fakeSite([101, 100], [98]);

        $this->artisan('scam-reports:sync')->expectsOutput('Added 0 new reports.');
        $this->artisan('scam-reports:sync --all')->expectsOutput('Added 1 new reports.');
    }

    public function test_genuine_postings_are_collected_from_karirhub_up_to_three_per_usable_scam(): void
    {
        $this->fakeSite([102]);
        $this->artisan('legit-postings:sync')->expectsOutput('Added 0 new postings.');
        $this->artisan('scam-reports:sync')->assertSuccessful();

        $this->artisan('legit-postings:sync')->expectsOutput('Added 2 new postings.')->assertSuccessful();
        $this->assertSame('PT Contoh Logistik Nusantara', LegitPosting::firstOrFail()->company);
        $this->artisan('legit-postings:sync')->expectsOutput('Added 0 new postings.');
    }

    public function test_the_export_leaves_out_stamped_images_narratives_and_rejected_reports(): void
    {
        $this->fakeSite([102]);
        $this->artisan('scam-reports:sync')->assertSuccessful();
        $this->artisan('legit-postings:sync')->assertSuccessful();
        ScamReport::create([
            'source' => 'turnbackhoax', 'external_id' => 1, 'url' => 'u', 'title' => 't', 'posting_text' => 'p', 'narrative' => 'n',
            'source_links' => [], 'archive_links' => [], 'reference_links' => [], 'images' => [], 'status' => 'rejected',
        ]);
        // No quoted posting: only the fact-checker's narrative
        ScamReport::create([
            'source' => 'turnbackhoax', 'external_id' => 2, 'url' => 'u', 'title' => 't', 'posting_text' => 'Beredar unggahan', 'narrative' => 'Beredar unggahan',
            'source_links' => [], 'archive_links' => [], 'reference_links' => [], 'images' => [],
        ]);

        $path = tempnam(sys_get_temp_dir(), 'scam');
        $this->artisan('training-pool:export', ['path' => $path])->expectsOutput('Exported 1 scams and 2 genuine postings.');
        $rows = array_map(fn ($line) => json_decode($line, true), file($path, FILE_IGNORE_NEW_LINES));
        $this->assertSame(['turnbackhoax:102', 'penipuan', []], [$rows[0]['id'], $rows[0]['label'], $rows[0]['images']]);
        $this->assertSame('asli', $rows[1]['label']);
    }
}
