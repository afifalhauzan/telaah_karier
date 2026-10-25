<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['source', 'external_id', 'url', 'title', 'company', 'posting_text', 'status'])]
class LegitPosting extends Model {}
