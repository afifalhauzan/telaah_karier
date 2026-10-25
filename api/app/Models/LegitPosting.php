<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'source', 'external_id', 'url', 'title', 'company', 'platform', 'platform_type', 'platform_link', 'published_at',
    'posting_text', 'status',
])]
class LegitPosting extends Model
{
    protected function casts(): array
    {
        return ['published_at' => 'date'];
    }
}
