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
        // An unfaked URL would reach the real site
        Http::preventStrayRequests();
    }

    private function fakeSite(array $page1, array $page2 = []): void
    {
        Http::fake([
            'turnbackhoax.id/articles?category=lowongan&page=1' => Http::response(turnbackhoax_listing($page1)),
            'turnbackhoax.id/articles?category=lowongan&page=2' => Http::response(turnbackhoax_listing($page2)),
            'turnbackhoax.id/articles?category=lowongan&page=*' => Http::response(turnbackhoax_listing([])),
            'turnbackhoax.id/articles/*' => Http::response(turnbackhoax_article()),
            'yudistira.turnbackhoax.id/*' => Http::response('png-bytes', 200, ['Content-Type' => 'image/png']),
            '*' => Http::response(''),
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

    public function test_the_search_adds_job_fact_checks_outside_the_category_but_not_genuine_or_other_hoaxes(): void
    {
        Http::fake([
            'turnbackhoax.id/search?query=lowongan&page=1' => Http::response(turnbackhoax_listing([201, 202, 203])),
            'turnbackhoax.id/articles/201-*' => Http::response(turnbackhoax_article('[SALAH] Lowongan Kerja Puskesmas Contoh')),
            'turnbackhoax.id/articles/202-*' => Http::response(turnbackhoax_article('[KLARIFIKASI] Lowongan Kerja PT Pupuk Contoh', 'Klarifikasi')),
            'turnbackhoax.id/articles/203-*' => Http::response(turnbackhoax_article('[SALAH] Pertalite Bubuk, Tinggal Campur Air')),
            '*' => Http::response(''),
        ]);

        $this->artisan('scam-reports:sync')->expectsOutput('Added 1 new reports.')->assertSuccessful();
        $this->assertSame([201], ScamReport::pluck('external_id')->all());
    }

    public function test_partner_fact_checks_are_read_by_id_after_the_last_one_seen(): void
    {
        ScamReport::create([
            'source' => 'turnbackhoax', 'external_id' => 300, 'url' => 'u', 'title' => 't', 'posting_text' => 'p',
            'narrative' => 'n', 'source_links' => [], 'archive_links' => [], 'reference_links' => [], 'images' => [],
        ]);
        Http::fake([
            'turnbackhoax.id/articles?page=1' => Http::response(turnbackhoax_listing([303, 302])),
            'turnbackhoax.id/articles/301' => Http::response(turnbackhoax_article('Cek Fakta: Tidak Benar Link Pendaftaran Lowongan Kerja Ombudsman')),
            'turnbackhoax.id/articles/302' => Http::response(turnbackhoax_article('Cek Fakta: Hoaks Video Menkeu Umumkan Bantuan Dana')),
            'turnbackhoax.id/articles/303' => Http::response('', 404),
            '*' => Http::response(''),
        ]);

        $this->artisan('scam-reports:sync')->expectsOutput('Added 1 new reports.');
        $this->assertSame('https://turnbackhoax.id/articles/301', ScamReport::where('external_id', 301)->value('url'));
        // The next run starts after the latest id instead of reading them again
        $this->artisan('scam-reports:sync')->expectsOutput('Added 0 new reports.');
        $this->assertCount(3, Http::recorded(fn ($request) => preg_match('~/articles/\d+$~', $request->url())));
    }

    public function test_partner_fact_checks_found_on_cekfakta_are_read_through_turnbackhoax(): void
    {
        Http::fake([
            'cekfakta.com/api-search*' => Http::response(cekfakta_search([401, 402])),
            'turnbackhoax.id/articles/401' => Http::response(turnbackhoax_article('Cek Fakta: Tidak Benar Link Pendaftaran Lowongan Kerja Ombudsman')),
            'turnbackhoax.id/articles/402' => Http::response(turnbackhoax_article('Cek Fakta: Hoaks Video Menkeu Umumkan Bantuan Dana')),
            '*' => Http::response(''),
        ]);

        $this->artisan('scam-reports:sync')->expectsOutput('Added 1 new reports.')->assertSuccessful();
        $this->assertSame([401], ScamReport::pluck('external_id')->all());
    }

    public function test_a_failing_cekfakta_search_does_not_stop_the_sync(): void
    {
        Http::fake([
            'cekfakta.com/api-search*' => Http::response('<html>502 Server Error</html>', 502),
            'turnbackhoax.id/articles?category=lowongan&page=1' => Http::response(turnbackhoax_listing([501])),
            'turnbackhoax.id/articles/501-*' => Http::response(turnbackhoax_article()),
            '*' => Http::response(''),
        ]);

        $this->artisan('scam-reports:sync')->expectsOutput('Added 1 new reports.')->assertSuccessful();
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
