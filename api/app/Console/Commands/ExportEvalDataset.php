<?php

namespace App\Console\Commands;

use App\Models\LegitPosting;
use App\Models\ScamReport;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * The time-split evaluation set (docs/wiki/ai/05-DATASET-EVALUASI.md): the newest fact-checked scams
 * are the test cases, and the knowledge base keeps only the older ones (--kb-before in web/eval/run.ts).
 * Two arms, as the posting reaches the user: its text, or the poster cut out of the article header.
 * Genuine postings come from legit_postings. Written in the columns of web/eval/lib/dataset.ts.
 */
#[Signature('eval:export {--test-share=0.2 : Share of the newest cases that are test cases} {--legit= : Genuine postings to add, by default as many as the text arm}')]
#[Description('Write the time-split evaluation set and its posters to storage/app/private/eval')]
class ExportEvalDataset extends Command
{
    private const COLUMNS = [
        'id', 'split', 'label', 'modus', 'kasus_sulit', 'input_type', 'text', 'image_file', 'platform',
        'sumber_label', 'sumber_asli', 'tanggal_kasus', 'pasangan_id', 'dikumpulkan_oleh', 'diverifikasi_oleh', 'catatan',
    ];

    private const MODUS = ['impersonasi', 'biaya', 'tugas_deposit', 'data_sensitif', 'tppo', 'gaji_tidak_wajar', 'lainnya'];

    private const PLATFORMS = ['tiktok', 'instagram', 'facebook', 'whatsapp', 'telegram', 'x', 'website', 'linkedin'];

    public function handle(): int
    {
        $reports = ScamReport::whereNotNull('published_at')->where('status', '!=', 'rejected')->orderBy('published_at')->orderBy('id')->get();
        if ($reports->isEmpty()) {
            $this->error('No dated scam reports to split.');

            return self::FAILURE;
        }
        $test = $reports->slice((int) floor($reports->count() * (1 - (float) $this->option('test-share'))))->values();
        $cutoff = $test->first()->published_at->toDateString();

        $disk = Storage::disk('local');
        $disk->deleteDirectory('eval');
        $rows = [];
        foreach ($test as $index => $report) {
            if (trim((string) $report->posting_text) !== '') {
                $rows[] = $this->scamRow($report, sprintf('T%03d', $index + 1), 'teks', $report->posting_text, '');
            }
            $poster = collect($report->images ?? [])->pluck('poster')->filter(fn ($path) => $path && $disk->exists($path))->first();
            if ($poster) {
                $file = sprintf('G%03d.png', $index + 1);
                $disk->put("eval/images/{$file}", $disk->get($poster));
                $rows[] = $this->scamRow($report, sprintf('G%03d', $index + 1), 'gambar', '', $file);
            }
        }
        $textArm = count(array_filter($rows, fn ($row) => $row['input_type'] === 'teks'));
        $legit = LegitPosting::where('posting_text', '!=', '')->latest('published_at')->limit((int) ($this->option('legit') ?: $textArm))->get();
        foreach ($legit->values() as $index => $posting) {
            $rows[] = [
                'id' => sprintf('A%03d', $index + 1), 'split' => 'test', 'label' => 'asli', 'modus' => '', 'kasus_sulit' => '',
                'input_type' => 'teks', 'text' => $this->legitText($posting), 'image_file' => '', 'platform' => 'portal_kerja',
                'sumber_label' => $posting->url, 'sumber_asli' => $posting->platform_link ?? '', 'tanggal_kasus' => $posting->published_at?->format('Y-m') ?? '',
                'pasangan_id' => '', 'dikumpulkan_oleh' => 'legit-postings:sync', 'diverifikasi_oleh' => $posting->platform ?: 'KarirHub', 'catatan' => '',
            ];
        }

        $csv = fopen('php://temp', 'r+');
        fputcsv($csv, self::COLUMNS);
        foreach ($rows as $row) {
            fputcsv($csv, array_map(fn ($column) => $row[$column], self::COLUMNS));
        }
        rewind($csv);
        $disk->put('eval/dataset.csv', stream_get_contents($csv));

        $posterArm = count($rows) - $textArm - $legit->count();
        $this->info("Test cases from {$cutoff} ({$test->count()} of {$reports->count()} reports): {$textArm} text, {$posterArm} poster, {$legit->count()} genuine.");
        $this->info("Run with --kb-before {$cutoff}");

        return self::SUCCESS;
    }

    /**
     * A genuine posting as a user would paste it: its title, employer, description, and where to
     * apply. The stored text is the description alone, which names neither employer nor channel.
     */
    private function legitText(LegitPosting $posting): string
    {
        return implode("\n\n", array_filter([
            $posting->title,
            $posting->company,
            $posting->posting_text,
            'Lamar melalui: '.($posting->platform_link ?: $posting->url),
        ]));
    }

    private function scamRow(ScamReport $report, string $id, string $inputType, string $text, string $image): array
    {
        $card = $report->card ?? [];
        $modus = $card['modus'][0] ?? 'lainnya';
        $channel = strtolower($card['kanal'][0] ?? '');

        return [
            'id' => $id, 'split' => 'test', 'label' => 'penipuan', 'modus' => in_array($modus, self::MODUS, true) ? $modus : 'lainnya',
            'kasus_sulit' => '', 'input_type' => $inputType, 'text' => $text, 'image_file' => $image,
            'platform' => collect(self::PLATFORMS)->first(fn ($platform) => str_contains($channel, $platform)) ?? 'lainnya',
            'sumber_label' => $report->url, 'sumber_asli' => $report->archive_links[0] ?? '', 'tanggal_kasus' => $report->published_at->format('Y-m'),
            'pasangan_id' => '', 'dikumpulkan_oleh' => 'scam-reports:sync', 'diverifikasi_oleh' => $report->source === 'cekfakta' ? 'CekFakta' : 'TurnBackHoax',
            'catatan' => $report->title,
        ];
    }
}
