<?php

namespace App\Console\Commands;

use App\Models\ScamReport;
use App\Models\ScamReportIdentifier;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

#[Signature('scam-reports:cards {--all : Write every card again, e.g. after the card prompt changed} {--limit=500 : Most reports to card in one run}')]
#[Description('Turn fact-checks into case cards for the knowledge base: card, identifiers, and embedding')]
class BuildCaseCards extends Command
{
    public function handle(): int
    {
        $reports = ScamReport::query()
            ->where('status', '!=', 'rejected')
            ->when(! $this->option('all'), fn ($query) => $query->whereNull('card'))
            ->orderByDesc('published_at')
            ->limit((int) $this->option('limit'))
            ->get();

        $carded = 0;
        foreach ($reports as $report) {
            $carded += $this->card($report) ? 1 : 0;
        }
        $this->info("Carded {$carded} of {$reports->count()} reports.");

        return self::SUCCESS;
    }

    private function card(ScamReport $report): bool
    {
        try {
            $response = Http::withHeaders(['X-Internal-Key' => (string) config('services.telaah.internal_key')])
                ->timeout(60)
                ->post(rtrim((string) config('services.web.url'), '/').'/api/internal/case-card', [
                    'title' => $report->title,
                    'posting_text' => $report->posting_text,
                    'narrative' => $report->narrative,
                    'explanation' => $report->explanation,
                    'conclusion' => $report->conclusion,
                    'source_links' => $report->source_links,
                ]);
            if ($response->failed()) {
                $this->warn("Skipped {$report->external_id}: the web app answered {$response->status()}");

                return false;
            }

            DB::transaction(function () use ($report, $response) {
                $card = $response->json('card');
                $report->update([
                    'card' => $card,
                    'entity' => isset($card['entitas']) ? mb_strtolower(trim($card['entitas'])) : null,
                    'embedding' => $response->json('embedding'),
                ]);
                $report->identifiers()->delete();
                $report->identifiers()->createMany(
                    collect($response->json('identifiers'))
                        ->filter(fn ($item) => in_array($item['kind'] ?? null, ScamReportIdentifier::KINDS, true) && ($item['value'] ?? '') !== '')
                        ->unique(fn ($item) => "{$item['kind']}|{$item['value']}")
                        ->map(fn ($item) => ['kind' => $item['kind'], 'value' => mb_substr($item['value'], 0, 255)])
                        ->all()
                );
            });

            return true;
        } catch (Throwable $error) {
            report($error);
            $this->warn("Skipped {$report->external_id}: {$error->getMessage()}");

            return false;
        }
    }
}
