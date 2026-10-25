<?php

namespace App\Console\Commands;

use App\Models\ScamReport;
use App\Support\TurnBackHoax;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Throwable;

#[Signature('scam-reports:sync {--all : Walk the whole category instead of stopping at known articles} {--pages=40 : Most listing pages to read} {--refresh : Read the stored articles again, e.g. after a parser fix}')]
#[Description('Collect new job-scam fact-checks (Mafindo and partner media) from TurnBackHoax into scam_reports')]
class SyncScamReports extends Command
{
    private const SOURCE = 'turnbackhoax';

    private const USER_AGENT = 'TelaahKarier/1.0 (+https://telaahkarier.com; dataset riset pencegahan penipuan kerja)';

    private const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

    // Where scanNewIds stopped; fact-checks get a few dozen new ids a day
    private const SCAN_CURSOR = 'scam-reports:scanned-id';

    private const MAX_SCAN = 200;

    public function handle(): int
    {
        if ($this->option('refresh')) {
            $updated = 0;
            foreach (ScamReport::where('source', self::SOURCE)->pluck('url', 'external_id') as $id => $url) {
                $updated += $this->store($id, $url) ? 1 : 0;
            }
            $this->info("Refreshed {$updated} reports.");

            return self::SUCCESS;
        }

        $known = ScamReport::where('source', self::SOURCE)->pluck('external_id')->all();
        $added = 0;

        // The category is all about jobs; the search also finds "lowongan" in other hoaxes
        foreach ([TurnBackHoax::LISTING_PATH => false, TurnBackHoax::SEARCH_PATH => true] as $path => $checkTitle) {
            for ($page = 1; $page <= (int) $this->option('pages'); $page++) {
                $listing = $this->get(TurnBackHoax::BASE_URL.$path.$page);
                $articles = $listing ? TurnBackHoax::listingArticles($listing) : [];
                if (! $articles) {
                    break;
                }

                $new = array_diff_key($articles, array_flip($known));
                foreach ($new as $id => $url) {
                    $added += $this->store($id, $url, $checkTitle) ? 1 : 0;
                    $known[] = $id;
                }
                // Daily runs stop at the first page with nothing new; listings are newest first
                if (! $new && ! $this->option('all')) {
                    break;
                }
            }
        }
        $added += $this->scanNewIds($known);

        $this->info("Added {$added} new reports.");

        return self::SUCCESS;
    }

    /**
     * Partner media's fact-checks (CekFakta) share TurnBackHoax's ids but appear in no listing, so
     * every id after the last one read is opened once and kept when it is about a job.
     * shortcut: only ids published from the first run on; older partner fact-checks need the
     * Yudistira API (or cekfakta.com's search, when it answers).
     *
     * @param  list<int>  $known
     */
    private function scanNewIds(array $known): int
    {
        $latest = max(array_keys(TurnBackHoax::listingArticles($this->get(TurnBackHoax::BASE_URL.TurnBackHoax::ALL_PATH.'1') ?? '')) ?: [0]);
        $from = (int) Cache::get(self::SCAN_CURSOR, max($known ?: [0]));
        $to = min($latest, $from + self::MAX_SCAN);

        $added = 0;
        for ($id = $from + 1; $id <= $to; $id++) {
            if (! in_array($id, $known, true)) {
                $added += $this->store($id, TurnBackHoax::BASE_URL.TurnBackHoax::ARTICLE_PATH.$id, true) ? 1 : 0;
            }
        }
        Cache::forever(self::SCAN_CURSOR, max($from, $to));

        return $added;
    }

    private function store(int $id, string $url, bool $checkTitle = false): bool
    {
        $html = $this->get($url);
        if (! $html) {
            return false;
        }

        try {
            $article = TurnBackHoax::parseArticle($html);
            if ($checkTitle && ! TurnBackHoax::isAboutJobs($article['title'])) {
                return false;
            }
            // Only debunked offers: "Klarifikasi" marks a genuine posting that was doubted
            if ($article['verdict'] !== 'Salah') {
                $this->line("Skipped {$url}: verdict {$article['verdict']}");

                return false;
            }
            if ($article['posting_text'] === '') {
                $this->warn("Skipped {$url}: no narrative");

                return false;
            }
            // A refresh keeps the review status: only what the article says is replaced
            ScamReport::updateOrCreate(['source' => self::SOURCE, 'external_id' => $id], [
                'url' => $url,
                ...collect($article)->except('image_urls')->all(),
                'images' => $this->downloadImages($id, $article['image_urls']),
            ]);

            return true;
        } catch (Throwable $error) {
            // One bad article must not stop the run; it is retried on the next one
            report($error);
            $this->warn("Skipped {$url}: {$error->getMessage()}");

            return false;
        }
    }

    /**
     * @param  list<array{url: string, stamped: bool}>  $images
     * @return list<array{url: string, stamped: bool, path: ?string}>
     */
    private function downloadImages(int $id, array $images): array
    {
        return array_map(function (array $image, int $index) use ($id) {
            $response = $this->fetch($image['url']);
            $type = $response?->header('Content-Type') ?? '';
            $extension = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][strtok($type, ';')] ?? null;
            $path = null;
            if ($extension && strlen($response->body()) <= self::MAX_IMAGE_BYTES) {
                $path = "scam-reports/{$id}/{$index}.{$extension}";
                // The disk does not throw: a failed write (e.g. a folder owned by root) records no path
                $path = Storage::disk('local')->put($path, $response->body()) ? $path : null;
            }

            return [...$image, 'path' => $path];
        }, $images, array_keys($images));
    }

    private function get(string $url): ?string
    {
        return $this->fetch($url)?->body();
    }

    private function fetch(string $url): ?Response
    {
        // One request at a time with a pause: a polite reader of a volunteer-run site
        usleep((int) config('services.scam_reports.request_delay_ms') * 1000);
        try {
            // The site sometimes takes 20 s or more for one page
            $response = Http::withUserAgent(self::USER_AGENT)->timeout(45)->get($url);

            return $response->successful() ? $response : null;
        } catch (Throwable $error) {
            $this->warn("Could not fetch {$url}: {$error->getMessage()}");

            return null;
        }
    }
}
