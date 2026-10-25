<?php

namespace App\Support;

use DOMDocument;
use DOMXPath;

/**
 * Reads KarirHub (Kemnaker) job pages: the public listing and posting pages, which robots.txt allows
 * (only /api/ is disallowed).
 * shortcut: postings from an official portal share its format, so a classifier could learn "portal
 * layout = genuine"; hand-collected genuine posts from chat apps (UMKM on WhatsApp) must be added to
 * the pool before the model is trusted on such posts.
 */
class KarirHub
{
    public const BASE_URL = 'https://karirhub.kemnaker.go.id';

    public const LISTING_PATH = '/lowongan-dalam-negeri/lowongan?page=';

    /**
     * Posting ids and URLs on a listing page.
     *
     * @return array<string, string> id => absolute URL
     */
    public static function listingPostings(string $html): array
    {
        preg_match_all(
            '~"(/lowongan-dalam-negeri/lowongan/[^"]*?-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))"~i',
            $html,
            $matches,
            PREG_SET_ORDER
        );
        $postings = [];
        foreach ($matches as [, $path, $id]) {
            $postings[strtolower($id)] ??= self::BASE_URL.html_entity_decode($path);
        }

        return $postings;
    }

    /**
     * The posting's title, company and text as a job seeker reads it.
     *
     * @return array{title: string, company: ?string, posting_text: string}
     */
    public static function parsePosting(string $html): array
    {
        $dom = new DOMDocument;
        @$dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NOERROR | LIBXML_NOWARNING);
        $title = self::clean((new DOMXPath($dom))->query('//h1')->item(0)?->textContent) ?? '';
        // Tags become spaces: the page's blocks would otherwise run into each other ("PekerjaanMencatat")
        $text = self::clean(preg_replace(['~<(script|style|noscript)\b[^>]*>.*?</\1>~is', '~<[^>]+>~'], ['', ' '], $html)) ?? '';

        // Only what the employer wrote ("Persyaratan Khusus"); the portal's labels and form fields
        // around it (education, marital status, disability) are the same on every posting
        $start = mb_strpos($text, 'Persyaratan Khusus');
        $end = mb_strpos($text, 'Lihat Profil Perusahaan');
        $stop = $start !== false ? mb_strpos($text, 'Persyaratan Umum', $start) : false;
        $body = $start !== false && $stop !== false
            ? trim(mb_substr($text, $start + mb_strlen('Persyaratan Khusus'), $stop - $start - mb_strlen('Persyaratan Khusus')))
            : '';
        // The company name sits right before its profile link, after the last requirement
        $company = $end !== false && preg_match('/.*(?:disabilitas)\s+(.{2,120})$/iu', mb_substr($text, 0, $end), $m)
            ? trim($m[1])
            : null;

        return [
            'title' => $title,
            'company' => $company,
            'posting_text' => trim($title."\n".$body),
        ];
    }

    private static function clean(?string $text): ?string
    {
        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode((string) $text, ENT_QUOTES | ENT_HTML5, 'UTF-8')));

        return $text === '' ? null : $text;
    }
}
