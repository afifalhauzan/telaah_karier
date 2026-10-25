<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'source', 'external_id', 'url', 'title', 'published_at', 'category', 'verdict', 'posting_text', 'narrative',
    'explanation', 'conclusion', 'platform', 'source_links', 'archive_links', 'reference_links', 'images', 'status',
])]
class ScamReport extends Model
{
    /**
     * Reports fit for training: not rejected, and quoting the posting itself. A narrative is the
     * fact-checker's voice ("Beredar unggahan…", "Tim Pemeriksa Fakta Mafindo"), which a model would
     * learn instead of the scam.
     */
    #[Scope]
    protected function trainable(Builder $query): void
    {
        $query->where('status', '!=', 'rejected')->whereColumn('posting_text', '!=', 'narrative');
    }

    protected function casts(): array
    {
        return [
            'external_id' => 'integer',
            'published_at' => 'date',
            'source_links' => 'array',
            'archive_links' => 'array',
            'reference_links' => 'array',
            'images' => 'array',
        ];
    }
}
