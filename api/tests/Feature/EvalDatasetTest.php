<?php

namespace Tests\Feature;

use App\Models\LegitPosting;
use App\Models\ScamReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class EvalDatasetTest extends TestCase
{
    use RefreshDatabase;

    private function report(int $id, string $date, string $text, array $images = []): void
    {
        ScamReport::create([
            'source' => 'turnbackhoax', 'external_id' => $id, 'url' => "https://turnbackhoax.id/articles/{$id}", 'title' => "Kasus {$id}",
            'posting_text' => $text, 'narrative' => 'n', 'source_links' => [], 'archive_links' => [], 'reference_links' => [], 'images' => $images,
            'card' => ['modus' => ['data_sensitif'], 'entitas' => null, 'kanal' => ['TikTok'], 'ciri' => [], 'kutipan' => 'k'], 'published_at' => $date,
        ]);
    }

    public function test_the_newest_fifth_is_the_test_set_with_a_text_and_a_poster_arm_and_genuine_postings(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('scam-reports/5/0.poster.png', 'png-bytes');
        foreach (range(1, 4) as $id) {
            $this->report($id, "2026-0{$id}-01", "lama {$id}");
        }
        $this->report(5, '2026-07-01', 'baru', [['url' => 'u', 'path' => 'scam-reports/5/0.png', 'poster' => 'scam-reports/5/0.poster.png']]);
        LegitPosting::create(['source' => 'karirhub', 'external_id' => 'k1', 'url' => 'https://karirhub.kemnaker.go.id/x', 'title' => 'Admin', 'platform' => 'KarirHub', 'posting_text' => 'asli', 'published_at' => '2026-10-01']);

        $this->artisan('eval:export')
            ->expectsOutput('Test cases from 2026-07-01 (1 of 5 reports): 1 text, 1 poster, 1 genuine.')
            ->expectsOutput('Run with --kb-before 2026-07-01')
            ->assertSuccessful();

        $lines = array_map('str_getcsv', explode("\n", trim(Storage::disk('local')->get('eval/dataset.csv'))));
        $this->assertSame(['T001', 'G001', 'A001'], array_column(array_slice($lines, 1), 0));
        $this->assertSame(['test', 'penipuan', 'data_sensitif', '', 'teks', 'baru', '', 'tiktok'], array_slice($lines[1], 1, 8));
        $this->assertSame(['gambar', '', 'G001.png'], array_slice($lines[2], 5, 3));
        $this->assertSame(['asli', 'teks', 'asli'], [$lines[3][2], $lines[3][5], $lines[3][6]]);
        $this->assertSame('png-bytes', Storage::disk('local')->get('eval/images/G001.png'));
    }
}
