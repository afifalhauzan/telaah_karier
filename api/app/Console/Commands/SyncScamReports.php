<?php

namespace App\Console\Commands;

use App\Models\ScamReport;
use App\Support\TurnBackHoax;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Throwable;

#[Signature('scam-reports:sync {--all : Walk the whole category instead of stopping at known articles} {--pages=40 : Most listing pages to read}')]
#[Description('Collect new job-scam fact-checks from TurnBackHoax into scam_reports')]
class SyncScamReports extends Command
{
    private const SOURCE = 'turnbackhoax';

    private const USER_AGENT = 'TelaahKarier/1.0 (+https://telaahkarier.com; dataset riset pencegahan penipuan kerja)';

    private const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

    public function handle(): int
    {
        $known = ScamReport::where('source', self::SOURCE)->pluck('external_id')->all();
        $added = 0;

        for ($page = 1; $page <= (int) $this->option('pages'); $page++) {
            $listing = $this->get(TurnBackHoax::BASE_URL.TurnBackHoax::LISTING_PATH.$page);
            $articles = $listing ? TurnBackHoax::listingArticles($listing) : [];
            if (! $articles) {
                break;
            }

            $new = array_diff_key($articles, array_flip($known));
            foreach ($new as $id => $url) {
                $added += $this->store($id, $url) ? 1 : 0;
                $known[] = $id;
            }
            // Daily runs stop at the first page with nothing new; the listing is newest first
            if (! $new && ! $this->option('all')) {
                break;
            }
        }

        $this->info("Added {$added} new reports.");

        return self::SUCCESS;
    }

    private function store(int $id, string $url): bool
    {
        $html = $this->get($url);
        if (! $html) {
            return false;
        }

        try {
            $article = TurnBackHoax::parseArticle($html);
            if ($article['posting_text'] === '') {
                $this->warn("Skipped {$url}: no narrative");

                return false;
            }
            ScamReport::create([
                'source' => self::SOURCE,
                'external_id' => $id,
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
            $response = Http::withUserAgent(self::USER_AGENT)->timeout(20)->get($url);

            return $response->successful() ? $response : null;
        } catch (Throwable $error) {
            $this->warn("Could not fetch {$url}: {$error->getMessage()}");

            return null;
        }
    }
}
