<?php

namespace App\Support;

/**
 * Reads KarirHub (Kemnaker) job pages: the public listing and posting pages, which robots.txt allows
 * (only /api/ is disallowed). KarirHub carries postings reported to Kemnaker and postings from the
 * private portals integrated with it (Kitalulus, Glints, …), each named by its platform, so genuine
 * postings from licensed portals come through the government's own site.
 */
class KarirHub
{
    public const BASE_URL = 'https://karirhub.kemnaker.go.id';

    public const LISTING_PATH = '/lowongan-dalam-negeri/lowongan?page=';

    // Labels and filler the portal puts around the employer's text
    private const PORTAL_TEXT = ['Persyaratan Khusus', 'Cek deskripsi untuk kualifikasi dan benefit.'];

    /**
     * The postings on a listing page, from the data the page streams for its own script.
     *
     * @return array<string, array{url: string, title: string, company: ?string, platform: string, platform_type: ?string, platform_link: ?string, published_at: ?string}>
     */
    public static function listingPostings(string $html): array
    {
        $data = str_replace(['\\"', '\\\\'], ['"', '\\'], $html);
        preg_match_all(
            '~"(/lowongan-dalam-negeri/lowongan/[^"]*?-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))"~i',
            $data,
            $links,
            PREG_SET_ORDER
        );
        $urls = [];
        foreach ($links as [, $path, $id]) {
            $urls[strtolower($id)] ??= self::BASE_URL.html_entity_decode($path);
        }

        $postings = [];
        preg_match_all('~\{"id":"([0-9a-f-]{36})"(.*?)"platformType":"([^"]*)"~s', $data, $objects, PREG_SET_ORDER);
        foreach ($objects as [, $id, $fields, $platformType]) {
            $id = strtolower($id);
            if (! isset($urls[$id])) {
                continue;
            }
            $field = fn (string $name) => preg_match('~"'.$name.'":"((?:[^"\\\\]|\\\\.)*)"~', $fields, $m) ? json_decode('"'.$m[1].'"') : null;
            $published = preg_match('~"publishedAt":(\d+)~', $fields, $m) ? date('Y-m-d', (int) $m[1]) : null;
            $postings[$id] = [
                'url' => $urls[$id],
                'title' => (string) $field('title'),
                'company' => $field('companyName'),
                // KarirHub's own postings name no platform
                'platform' => $field('platformName') ?: 'Karirhub',
                'platform_type' => $platformType ?: null,
                'platform_link' => $field('platformLink'),
                'published_at' => $published,
            ];
        }

        return $postings;
    }

    /** The posting's text as a job seeker reads it: its title and description, without the portal around them. */
    public static function postingText(string $html, string $title): string
    {
        // Tags become spaces: the page's blocks would otherwise run into each other ("PekerjaanMencatat")
        $text = self::clean(preg_replace(['~<(script|style|noscript)\b[^>]*>.*?</\1>~is', '~<[^>]+>~'], ['', ' '], $html)) ?? '';
        $start = mb_strpos($text, 'Deskripsi Pekerjaan');
        $stop = $start !== false ? mb_strpos($text, 'Persyaratan Umum', $start) : false;
        if ($start === false || $stop === false) {
            return '';
        }
        $body = mb_substr($text, $start + mb_strlen('Deskripsi Pekerjaan'), $stop - $start - mb_strlen('Deskripsi Pekerjaan'));
        $body = trim(preg_replace('/\s+/u', ' ', str_replace(self::PORTAL_TEXT, ' ', $body)));
        // KarirHub's own postings repeat the title as their description's first line
        if (str_starts_with($body, $title)) {
            $body = trim(mb_substr($body, mb_strlen($title)));
        }

        return trim($title."\n".$body);
    }

    private static function clean(?string $text): ?string
    {
        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode((string) $text, ENT_QUOTES | ENT_HTML5, 'UTF-8')));

        return $text === '' ? null : $text;
    }
}
