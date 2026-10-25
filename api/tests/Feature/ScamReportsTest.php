<?php

namespace Tests\Feature;

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

    public function test_a_refresh_reads_stored_articles_again_and_keeps_their_review_status(): void
    {
        ScamReport::create([
            'source' => 'turnbackhoax', 'external_id' => 102, 'url' => 'https://turnbackhoax.id/articles/102-x', 'title' => 't',
            'posting_text' => 'p', 'narrative' => 'n', 'source_links' => [], 'archive_links' => [], 'reference_links' => [],
            'images' => [], 'status' => 'reviewed',
        ]);
        $this->fakeSite([]);

        $this->artisan('scam-reports:sync --refresh')->expectsOutput('Refreshed 1 reports.')->assertSuccessful();
        $report = ScamReport::sole();
        $this->assertSame(['reviewed', 2], [$report->status, count($report->images)]);
    }
}
