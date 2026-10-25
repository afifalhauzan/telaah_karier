<?php

namespace App\Console\Commands;

use App\Models\ScamReport;
use App\Support\MafindoHeader;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('scam-reports:posters {--all : Cut every stored header again, e.g. after the cut changed}')]
#[Description('Cut the scam poster out of the stored Mafindo headers, without downloading anything')]
class CutScamPosters extends Command
{
    public function handle(): int
    {
        $cut = 0;
        foreach (ScamReport::whereNotNull('images')->lazyById() as $report) {
            $images = $report->images;
            foreach ($images as $index => $image) {
                if ($image['path'] && ($this->option('all') || ! array_key_exists('poster', $image))) {
                    $images[$index]['poster'] = MafindoHeader::storePoster($image['path']);
                    $cut += $images[$index]['poster'] ? 1 : 0;
                }
            }
            if ($images !== $report->images) {
                $report->update(['images' => $images]);
            }
        }
        $this->info("Cut {$cut} posters.");

        return self::SUCCESS;
    }
}
