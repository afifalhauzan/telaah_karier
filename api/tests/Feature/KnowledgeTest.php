<?php

namespace Tests\Feature;

use App\Models\ScamReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class KnowledgeTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'test-internal-key';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.telaah.internal_key' => self::KEY]);
    }

    /** A unit vector pointing mostly along one axis, so similarities are easy to reason about. */
    private function vector(int $axis, float $lean = 0.0): array
    {
        $vector = array_fill(0, 768, 0.0);
        $vector[$axis] = 1.0;
        $vector[($axis + 1) % 768] = $lean;

        return $vector;
    }

    private function report(int $id, array $identifiers = [], ?array $embedding = null, array $extra = []): ScamReport
    {
        $report = ScamReport::create([
            'source' => 'turnbackhoax', 'external_id' => $id, 'url' => "https://turnbackhoax.id/articles/{$id}", 'title' => "Kasus {$id}",
            'posting_text' => 'p', 'narrative' => 'n', 'source_links' => [], 'archive_links' => [], 'reference_links' => [], 'images' => [],
            'card' => ['modus' => ['impersonasi'], 'entitas' => 'PT Contoh', 'kanal' => [], 'ciri' => [], 'kutipan' => 'k'],
            'entity' => 'pt contoh', 'embedding' => $embedding, ...$extra,
        ]);
        $report->identifiers()->createMany($identifiers);

        return $report;
    }

    private function search(array $body)
    {
        return $this->withHeaders(['X-Internal-Key' => self::KEY])
            ->postJson('/api/knowledge/search', ['identifiers' => [], ...$body]);
    }

    public function test_cards_are_written_from_the_web_app_with_their_identifiers(): void
    {
        $this->report(1, [['kind' => 'social', 'value' => 'old']], extra: ['card' => null]);
        Http::preventStrayRequests();
        Http::fake(['web:3000/api/internal/case-card' => Http::response([
            'card' => ['modus' => ['impersonasi'], 'entitas' => ' PT Komatsu Indonesia ', 'kanal' => ['TikTok'], 'ciri' => [], 'kutipan' => 'k'],
            'identifiers' => [['kind' => 'social', 'value' => 'infoloker378'], ['kind' => 'social', 'value' => 'infoloker378'], ['kind' => 'nope', 'value' => 'x']],
            'embedding' => $this->vector(0),
        ])]);

        $this->artisan('scam-reports:cards')->expectsOutput('Carded 1 of 1 reports.')->assertSuccessful();

        $report = ScamReport::sole();
        $this->assertSame(['pt komatsu indonesia', ['social:infoloker378']], [
            $report->entity, $report->identifiers()->get()->map(fn ($i) => "{$i->kind}:{$i->value}")->all(),
        ]);
        Http::assertSent(fn ($request) => $request->header('X-Internal-Key') === [self::KEY]);
        $this->artisan('scam-reports:cards')->expectsOutput('Carded 0 of 0 reports.');
    }

    public function test_a_shared_identifier_returns_the_whole_network_and_similar_cases_besides_it(): void
    {
        // 10 and 11 share an account; 11 and 12 share a number: one operation across three cases
        $this->report(10, [['kind' => 'social', 'value' => 'infoloker378']], $this->vector(0));
        $this->report(11, [['kind' => 'social', 'value' => 'infoloker378'], ['kind' => 'phone', 'value' => '6281234567890']], $this->vector(1));
        $this->report(12, [['kind' => 'phone', 'value' => '6281234567890']], $this->vector(2));
        $this->report(20, [], $this->vector(5, 0.1));
        $this->report(21, [], $this->vector(6));
        $this->report(22, [['kind' => 'social', 'value' => 'infoloker378']], $this->vector(0), ['status' => 'rejected']);

        $response = $this->search(['identifiers' => [['kind' => 'social', 'value' => 'infoloker378']], 'embedding' => $this->vector(5)])->assertOk();

        $this->assertSame([10, 11, 12], $response->json('data.identity.*.id'));
        $this->assertSame([['kind' => 'social', 'value' => 'infoloker378']], $response->json('data.identity.0.shared'));
        $this->assertSame([], $response->json('data.identity.2.shared'));
        // Only the close one; 21 is orthogonal, and the network's cases are not repeated
        $this->assertSame([20], $response->json('data.similar.*.id'));
        $this->assertSame([['entity' => 'pt contoh', 'count' => 5, 'latest' => null]], $response->json('data.entities'));
    }

    public function test_an_evaluation_leaves_out_the_cases_of_its_own_dataset(): void
    {
        $this->report(30, [['kind' => 'domain', 'value' => 'rekrutmen-kpc.online']], $this->vector(0));
        $this->report(31, [], $this->vector(0, 0.2));

        $response = $this->search([
            'identifiers' => [['kind' => 'domain', 'value' => 'rekrutmen-kpc.online']],
            'embedding' => $this->vector(0),
            'exclude_urls' => ['https://turnbackhoax.id/articles/30'],
            'exclude_above' => 0.99,
        ])->assertOk();

        $this->assertSame([], $response->json('data.identity'));
        $this->assertSame([31], $response->json('data.similar.*.id'));
    }

    public function test_the_search_is_for_the_web_server_only(): void
    {
        $this->postJson('/api/knowledge/search', ['identifiers' => []])->assertForbidden();
    }
}
