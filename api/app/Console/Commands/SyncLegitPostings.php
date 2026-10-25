<?php

namespace App\Console\Commands;

use App\Models\LegitPosting;
use App\Models\ScamReport;
use App\Support\KarirHub;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Throwable;

#[Signature('legit-postings:sync {--pages=5 : Listing pages to read, about 17 postings each}')]
#[Description('Collect genuine job postings from KarirHub into legit_postings')]
class SyncLegitPostings extends Command
{
    private const SOURCE = 'karirhub';

    private const USER_AGENT = 'TelaahKarier/1.0 (+https://telaahkarier.com; dataset riset pencegahan penipuan kerja)';

    // Very short descriptions say too little to learn from
    private const MIN_TEXT = 120;

    // Genuine postings per usable scam report: KarirHub adds dozens a day, fact-checks one or two
    private const PER_SCAM = 3;

    public function handle(): int
    {
        $known = LegitPosting::where('source', self::SOURCE)->pluck('external_id')->all();
        $room = self::PER_SCAM * ScamReport::trainable()->count() - LegitPosting::count();
        $added = 0;

        for ($page = 1; $page <= (int) $this->option('pages') && $added < $room; $page++) {
            $listing = $this->get(KarirHub::BASE_URL.KarirHub::LISTING_PATH.$page);
            $postings = $listing ? KarirHub::listingPostings($listing) : [];
            if (! $postings) {
                break;
            }
            foreach (array_diff_key($postings, array_flip($known)) as $id => $url) {
                if ($added >= $room) {
                    break;
                }
                $known[] = $id;
                $html = $this->get($url);
                if (! $html) {
                    continue;
                }
                try {
                    $posting = KarirHub::parsePosting($html);
                    if (mb_strlen($posting['posting_text']) < self::MIN_TEXT) {
                        continue;
                    }
                    LegitPosting::create(['source' => self::SOURCE, 'external_id' => $id, 'url' => $url, ...$posting]);
                    $added++;
                } catch (Throwable $error) {
                    report($error);
                    $this->warn("Skipped {$url}: {$error->getMessage()}");
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
            $response = Http::withUserAgent(self::USER_AGENT)->timeout(20)->get($url);

            return $response->successful() ? $response->body() : null;
        } catch (Throwable $error) {
            $this->warn("Could not fetch {$url}: {$error->getMessage()}");

            return null;
        }
    }
}
