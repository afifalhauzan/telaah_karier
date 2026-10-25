<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// The knowledge base of fact-checked job scams, run by the scheduler (supervisord.conf)
Schedule::command('scam-reports:sync')->dailyAt('03:00')->timezone('Asia/Jakarta')->withoutOverlapping();
// Genuine postings, the other side of the evaluation (KarirHub and its licensed partner portals)
Schedule::command('legit-postings:sync')->dailyAt('03:30')->timezone('Asia/Jakarta')->withoutOverlapping();
// After the sync, which can take an hour on a slow night: cards the new reports for the analysis
Schedule::command('scam-reports:cards')->dailyAt('04:30')->timezone('Asia/Jakarta')->withoutOverlapping();
