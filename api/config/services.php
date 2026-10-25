<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'telaah' => [
        // Shared with the web app's server only; TelaahBareng writes are accepted from there, never
        // straight from a browser. Local development gets a fixed key so no setup is needed.
        'internal_key' => env('TELAAH_INTERNAL_KEY', env('APP_ENV') === 'local' ? 'dev-telaah-internal-key' : null),
    ],

    // TelaahLoker usage limits. The per-session token budget lives in the web app (QUOTA_SESSION_TOKENS),
    // which meters the model calls; guests get one session per browser there.
    'quota' => [
        'daily_sessions' => (int) env('QUOTA_DAILY_SESSIONS', 5),
        // New guest sessions per IP per day: loose, as a campus or internet cafe shares one IP
        'guest_sessions_per_ip' => (int) env('QUOTA_GUEST_SESSIONS_PER_IP', 10),
        // Accounts without limits, e.g. for the final's demo (comma-separated emails)
        'exempt_emails' => array_values(array_filter(array_map('trim', explode(',', strtolower((string) env('QUOTA_EXEMPT_EMAILS', '')))))),
        'signups_per_ip_hour' => (int) env('QUOTA_SIGNUPS_PER_IP_HOUR', 5),
        'signups_per_ip_day' => (int) env('QUOTA_SIGNUPS_PER_IP_DAY', 20),
    ],

    // scam-reports:sync reads public fact-check pages one at a time with this pause between requests
    'scam_reports' => [
        'request_delay_ms' => (int) env('SCAM_REPORTS_REQUEST_DELAY_MS', 1000),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
