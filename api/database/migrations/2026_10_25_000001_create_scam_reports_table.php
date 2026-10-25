<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fact-checked job scams collected from public fact-checkers (TurnBackHoax first), as the growing
     * pool the classifier is trained from. Separate from the hand-curated evaluation dataset.
     */
    public function up(): void
    {
        Schema::create('scam_reports', function (Blueprint $table) {
            $table->id();
            $table->string('source', 30);
            // The fact-checker's own article id
            $table->unsignedBigInteger('external_id');
            $table->string('url', 500);
            $table->string('title', 300);
            $table->date('published_at')->nullable();
            $table->string('category', 60)->nullable();
            // The fact-checker's verdict as written, e.g. "Salah"
            $table->string('verdict', 60)->nullable();
            // The scam's own wording as the article quotes it; the training text
            $table->text('posting_text');
            $table->text('narrative');
            $table->text('explanation')->nullable();
            $table->text('conclusion')->nullable();
            // Where the scam was posted (tiktok, facebook, web, ...), from its original link
            $table->string('platform', 30)->nullable();
            $table->json('source_links');
            $table->json('archive_links');
            $table->json('reference_links');
            // Images inside the article: stored path, original URL, and whether it likely carries the
            // fact-checker's stamp (then it is kept out of image training)
            $table->json('images');
            // new: not reviewed; reviewed: checked by a person; rejected: not a job scam after all
            $table->string('status', 20)->default('new');
            $table->timestamps();

            $table->unique(['source', 'external_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scam_reports');
    }
};
