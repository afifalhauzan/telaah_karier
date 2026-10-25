<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// The classifier's training pool, run by the scheduler (supervisord.conf): new fact-checked job
// scams, and a few pages of genuine postings to keep the two sides balanced
Schedule::command('scam-reports:sync')->dailyAt('03:00')->timezone('Asia/Jakarta')->withoutOverlapping();
Schedule::command('legit-postings:sync')->dailyAt('03:30')->timezone('Asia/Jakarta')->withoutOverlapping();
// Daily is cheap and safe: a challenger replaces the classifier in use only when it scores no worse
Schedule::command('classifier:retrain')->dailyAt('04:00')->timezone('Asia/Jakarta')->withoutOverlapping();
