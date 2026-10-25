<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// The knowledge base of fact-checked job scams, run by the scheduler (supervisord.conf)
Schedule::command('scam-reports:sync')->dailyAt('03:00')->timezone('Asia/Jakarta')->withoutOverlapping();
