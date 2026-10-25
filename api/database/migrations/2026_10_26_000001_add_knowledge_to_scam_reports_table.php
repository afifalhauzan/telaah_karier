<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scam_reports', function (Blueprint $table) {
            // The case card the analysis reads (web/langchain/agents/knowledge/case-card.ts)
            $table->json('card')->nullable();
            // The impersonated company or institution, lowercased, to count how often it is used
            $table->string('entity')->nullable()->index();
            // 768 floats; compared in PHP, as the base holds hundreds of cases, not millions
            $table->json('embedding')->nullable();
        });

        // The graph's edges: a phone, email, bank account, domain, or social account the case used
        Schema::create('scam_report_identifiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('scam_report_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 16);
            $table->string('value');
            $table->index(['kind', 'value']);
            $table->unique(['scam_report_id', 'kind', 'value']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scam_report_identifiers');
        Schema::table('scam_reports', function (Blueprint $table) {
            $table->dropColumn(['card', 'entity', 'embedding']);
        });
    }
};
