<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'source', 'external_id', 'url', 'title', 'published_at', 'category', 'verdict', 'posting_text', 'narrative',
    'explanation', 'conclusion', 'platform', 'source_links', 'archive_links', 'reference_links', 'images', 'status',
])]
class ScamReport extends Model
{
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
