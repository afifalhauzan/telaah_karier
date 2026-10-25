<?php

namespace App\Console\Commands;

use App\Models\LegitPosting;
use App\Support\KarirHub;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Throwable;

#[Signature('legit-postings:sync {--pages=3 : Listing pages to read, 18 postings each}')]
#[Description('Collect genuine job postings from KarirHub Kemnaker and its partner portals into legit_postings')]
class SyncLegitPostings extends Command
{
    private const SOURCE = 'karirhub';

    private const USER_AGENT = 'TelaahKarier/1.0 (+https://telaahkarier.com; dataset riset pencegahan penipuan kerja)';

    // Very short descriptions say too little to judge
    private const MIN_TEXT = 120;

    public function handle(): int
    {
        $known = LegitPosting::where('source', self::SOURCE)->pluck('external_id')->all();
        $added = 0;

        for ($page = 1; $page <= (int) $this->option('pages'); $page++) {
            $listing = $this->get(KarirHub::BASE_URL.KarirHub::LISTING_PATH.$page);
            $postings = $listing ? KarirHub::listingPostings($listing) : [];
            if (! $postings) {
                break;
            }
            foreach (array_diff_key($postings, array_flip($known)) as $id => $posting) {
                $known[] = $id;
                $html = $this->get($posting['url']);
                if (! $html) {
                    continue;
                }
                try {
                    $text = KarirHub::postingText($html, $posting['title']);
                    if (mb_strlen($text) < self::MIN_TEXT) {
                        continue;
                    }
                    LegitPosting::create(['source' => self::SOURCE, 'external_id' => $id, ...$posting, 'posting_text' => $text]);
                    $added++;
                } catch (Throwable $error) {
                    report($error);
                    $this->warn("Skipped {$posting['url']}: {$error->getMessage()}");
                }
            }
        }

        $this->info("Added {$added} new postings.");

        return self::SUCCESS;
    }

    private function get(string $url): ?string
    {
        usleep((int) config('services.scam_reports.request_delay_ms') * 1000);
        try {
            $response = Http::withUserAgent(self::USER_AGENT)->timeout(45)->get($url);

            return $response->successful() ? $response->body() : null;
        } catch (Throwable $error) {
            $this->warn("Could not fetch {$url}: {$error->getMessage()}");

            return null;
        }
    }
}
