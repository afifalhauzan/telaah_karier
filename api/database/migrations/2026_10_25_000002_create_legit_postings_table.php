<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Genuine job postings from official portals (KarirHub Kemnaker first): the other half of the
     * classifier's training pool, next to scam_reports.
     */
    public function up(): void
    {
        Schema::create('legit_postings', function (Blueprint $table) {
            $table->id();
            $table->string('source', 30);
            // The portal's own posting id
            $table->string('external_id', 64);
            $table->string('url', 500);
            $table->string('title', 300);
            $table->string('company', 200)->nullable();
            $table->text('posting_text');
            $table->string('status', 20)->default('new');
            $table->timestamps();

            $table->unique(['source', 'external_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legit_postings');
    }
};
