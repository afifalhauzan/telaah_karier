<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['scam_report_id', 'kind', 'value'])]
class ScamReportIdentifier extends Model
{
    // TelaahIdentifier's kinds, plus the social account that spread the posting
    public const KINDS = ['phone', 'email', 'account', 'domain', 'social'];

    public $timestamps = false;

    public function report(): BelongsTo
    {
        return $this->belongsTo(ScamReport::class, 'scam_report_id');
    }
}
