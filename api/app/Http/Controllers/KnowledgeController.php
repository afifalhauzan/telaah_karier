<?php

namespace App\Http\Controllers;

use App\Models\ScamReport;
use App\Models\ScamReportIdentifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The knowledge base of fact-checked job scams, asked once per analysis (web/langchain/agents/
 * analyzer/tools/knowledge.ts): cases sharing an identifier with the posting and the network they
 * belong to, the most similar cases by embedding, and how often each impersonated name was used.
 */
class KnowledgeController extends Controller
{
    private const DIMENSIONS = 768;

    // A network grows through shared identifiers; past this it says little more
    private const MAX_NETWORK = 20;

    private const SIMILAR = 3;

    // Below this a "similar" case only shares the genre (any job posting)
    private const MIN_SIMILARITY = 0.6;

    public function search(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifiers' => ['present', 'array', 'max:40'],
            'identifiers.*.kind' => ['required', Rule::in(ScamReportIdentifier::KINDS)],
            'identifiers.*.value' => ['required', 'string', 'max:255'],
            'embedding' => ['nullable', 'array', 'size:'.self::DIMENSIONS],
            'embedding.*' => ['numeric'],
            'exclude_urls' => ['sometimes', 'array', 'max:10'],
            'exclude_urls.*' => ['string', 'max:2000'],
            // Evaluation only: a case this close to the posting is the posting's own fact-check
            'exclude_above' => ['sometimes', 'nullable', 'numeric', 'between:0,1'],
            // Evaluation only: the knowledge base as it stood before the test cases were published
            'before' => ['sometimes', 'nullable', 'date'],
        ]);
        $before = $data['before'] ?? null;

        $scores = $data['embedding'] ? $this->similarities($data['embedding']) : [];
        $excluded = ScamReport::whereIn('url', $data['exclude_urls'] ?? [])
            ->when($before, fn ($query) => $query->orWhere('published_at', '>=', $before)->orWhereNull('published_at'))
            ->pluck('id')->all();
        if (isset($data['exclude_above'])) {
            $excluded = [...$excluded, ...array_keys(array_filter($scores, fn ($score) => $score >= $data['exclude_above']))];
        }

        // 1. The same phone, account, domain, or spreading account: the same operation, already debunked
        $direct = $data['identifiers'] ? $this->sharing($data['identifiers'], $excluded) : [];
        $network = $this->network(array_keys($direct), $excluded);

        // 2. The closest cases by meaning, other than those already in the network
        $similar = array_slice(array_filter(
            array_diff_key($scores, array_flip([...$excluded, ...$network])),
            fn ($score) => $score >= self::MIN_SIMILARITY
        ), 0, self::SIMILAR, true);

        $reports = ScamReport::with('identifiers:scam_report_id,kind,value')
            ->whereIn('id', [...$network, ...array_keys($similar)])
            ->get()
            ->keyBy('id');

        return response()->json(['data' => [
            'identity' => collect($network)->filter(fn ($id) => $reports->has($id))->map(fn ($id) => [
                ...$this->present($reports[$id]),
                // Empty for a case reached only through the network
                'shared' => $direct[$id] ?? [],
            ])->values(),
            'similar' => collect($similar)->filter(fn ($score, $id) => $reports->has($id))->map(fn ($score, $id) => [
                ...$this->present($reports[$id]),
                'score' => round($score, 3),
            ])->values(),
            'entities' => $this->entityCounts($reports->pluck('entity')->filter()->unique()->values()->all(), $before),
        ]]);
    }

    /**
     * Cosine similarity of the posting to every carded case, highest first.
     * shortcut: every embedding is read and compared in PHP, fine for the few thousand cases a
     * year of fact-checks gives; move to pgvector past tens of thousands.
     *
     * @return array<int, float> report id => similarity
     */
    private function similarities(array $query): array
    {
        $queryNorm = sqrt(array_sum(array_map(fn ($x) => $x * $x, $query))) ?: 1.0;
        $scores = [];
        foreach (ScamReport::whereNotNull('embedding')->where('status', '!=', 'rejected')->get(['id', 'embedding']) as $report) {
            $dot = 0.0;
            $norm = 0.0;
            foreach ($report->embedding as $i => $value) {
                $dot += $value * ($query[$i] ?? 0);
                $norm += $value * $value;
            }
            $scores[$report->id] = $dot / ($queryNorm * (sqrt($norm) ?: 1.0));
        }
        arsort($scores);

        return $scores;
    }

    /** @return array<int, list<array{kind: string, value: string}>> report id => identifiers it shares */
    private function sharing(array $identifiers, array $excluded): array
    {
        $shared = [];
        $rows = ScamReportIdentifier::query()
            ->where(function ($query) use ($identifiers) {
                foreach ($identifiers as $identifier) {
                    $query->orWhere(fn ($q) => $q->where('kind', $identifier['kind'])->where('value', $identifier['value']));
                }
            })
            ->whereNotIn('scam_report_id', $excluded)
            ->whereHas('report', fn ($q) => $q->where('status', '!=', 'rejected'))
            ->get(['scam_report_id', 'kind', 'value']);
        foreach ($rows as $row) {
            $shared[$row->scam_report_id][] = ['kind' => $row->kind, 'value' => $row->value];
        }

        return $shared;
    }

    /**
     * The cases reachable from the matched ones through shared identifiers: one account that ran
     * several impersonations, or two accounts that used the same number.
     *
     * @return list<int>
     */
    private function network(array $seed, array $excluded): array
    {
        $ids = $seed;
        $frontier = $seed;
        while ($frontier && count($ids) < self::MAX_NETWORK) {
            $edges = ScamReportIdentifier::whereIn('scam_report_id', $frontier)->get(['kind', 'value']);
            $next = $edges->isEmpty() ? [] : ScamReportIdentifier::query()
                ->where(function ($query) use ($edges) {
                    foreach ($edges as $edge) {
                        $query->orWhere(fn ($q) => $q->where('kind', $edge->kind)->where('value', $edge->value));
                    }
                })
                ->whereNotIn('scam_report_id', [...$ids, ...$excluded])
                ->whereHas('report', fn ($q) => $q->where('status', '!=', 'rejected'))
                ->distinct()
                ->pluck('scam_report_id')
                ->all();
            $ids = [...$ids, ...$next];
            $frontier = $next;
        }

        return array_slice($ids, 0, self::MAX_NETWORK);
    }

    /** @return list<array{entity: string, count: int, latest: ?string}> */
    private function entityCounts(array $entities, ?string $before): array
    {
        return ScamReport::whereIn('entity', $entities)
            ->where('status', '!=', 'rejected')
            ->when($before, fn ($query) => $query->where('published_at', '<', $before))
            ->groupBy('entity')
            ->get(['entity', DB::raw('count(*) as count'), DB::raw('max(published_at) as latest')])
            ->map(fn ($row) => ['entity' => $row->entity, 'count' => (int) $row->count, 'latest' => $row->latest ? substr((string) $row->latest, 0, 10) : null])
            ->all();
    }

    private function present(ScamReport $report): array
    {
        return [
            'id' => $report->external_id,
            'url' => $report->url,
            'title' => $report->title,
            'published_at' => $report->published_at?->toDateString(),
            'card' => $report->card,
            'identifiers' => $report->identifiers->map(fn ($item) => ['kind' => $item->kind, 'value' => $item->value])->values(),
        ];
    }
}
