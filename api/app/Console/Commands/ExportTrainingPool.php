<?php

namespace App\Console\Commands;

use App\Models\LegitPosting;
use App\Models\ScamReport;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('training-pool:export {path : JSON Lines file to write}')]
#[Description('Write the collected scams and genuine postings as JSON Lines for training the classifier')]
class ExportTrainingPool extends Command
{
    public function handle(): int
    {
        $file = fopen($this->argument('path'), 'w');
        $write = fn (array $row) => fwrite($file, json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
        $counts = ['penipuan' => 0, 'asli' => 0];

        // In chunks: the pool only grows
        ScamReport::trainable()->orderBy('id')->chunk(200, function ($reports) use ($write, &$counts) {
            foreach ($reports as $report) {
                $write([
                    'id' => "{$report->source}:{$report->external_id}",
                    'label' => 'penipuan',
                    'text' => $report->posting_text,
                    'url' => $report->url,
                    'published_at' => $report->published_at?->toDateString(),
                    'collected_at' => $report->created_at->toDateString(),
                    'platform' => $report->platform,
                    'source_links' => $report->source_links,
                    // Only images without the fact-checker's stamp are fit for image training
                    'images' => array_values(array_filter($report->images, fn ($image) => $image['path'] && ! $image['stamped'])),
                ]);
                $counts['penipuan']++;
            }
        });
        LegitPosting::where('status', '!=', 'rejected')->orderBy('id')->chunk(200, function ($postings) use ($write, &$counts) {
            foreach ($postings as $posting) {
                $write([
                    'id' => "{$posting->source}:{$posting->external_id}",
                    'label' => 'asli',
                    'text' => $posting->posting_text,
                    'url' => $posting->url,
                    'published_at' => null,
                    'collected_at' => $posting->created_at->toDateString(),
                    'platform' => 'web',
                    'source_links' => [$posting->url],
                    'images' => [],
                ]);
                $counts['asli']++;
            }
        });
        fclose($file);

        $this->info("Exported {$counts['penipuan']} scams and {$counts['asli']} genuine postings.");

        return self::SUCCESS;
    }
}
