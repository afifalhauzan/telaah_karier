<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;

#[Signature('classifier:retrain')]
#[Description('Export the training pool where the ml service reads it, and ask it to train a challenger')]
class RetrainClassifier extends Command
{
    /** Relative to storage/, which the ml service mounts read-only (docker-compose) */
    public const POOL_PATH = 'app/ml/training-pool.jsonl';

    public function handle(): int
    {
        $path = storage_path(self::POOL_PATH);
        @mkdir(dirname($path), 0775, true);
        Artisan::call('training-pool:export', ['path' => $path], $this->output);

        // The ml service promotes the new model only if it is no worse than the one in use
        $response = Http::timeout(10)
            ->withHeaders(['X-Internal-Key' => (string) config('services.telaah.internal_key')])
            ->post(rtrim((string) config('services.ml.url'), '/').'/train');
        if ($response->failed()) {
            $this->error("The ml service answered {$response->status()}.");

            return self::FAILURE;
        }
        $this->info('Training: '.$response->json('status'));

        return self::SUCCESS;
    }
}
