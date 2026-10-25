<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMXPath;

/**
 * Reads TurnBackHoax (Mafindo) pages: the "Lowongan" category listing and its articles. Mafindo's
 * Yudistira API serves the same data once we have a key; until then the public pages are read slowly,
 * as robots.txt allows.
 * shortcut: HTML parsing tied to the site's current markup; switch to the Yudistira API when a key
 * arrives, or update the XPath queries if the layout changes (the parser test will fail first).
 */
class TurnBackHoax
{
    public const BASE_URL = 'https://turnbackhoax.id';

    public const LISTING_PATH = '/articles?category=lowongan&page=';

    // Older job fact-checks sit outside the "Lowongan" category; the site search finds them
    public const SEARCH_PATH = '/search?query=lowongan&page=';

    // Every category, newest first: its first page gives the latest article id
    public const ALL_PATH = '/articles?page=';

    // Partner media's fact-checks (shown on cekfakta.com) are in no listing, but served here by id
    public const ARTICLE_PATH = '/articles/';

    // A title about a job offer, for articles that do not come from the "Lowongan" category
    private const JOB_TITLE = '/lowongan|loker|rekrutmen|recruitment|perekrutan|magang|cpns|pppk|calon (karyawan|pegawai)|seleksi (pegawai|karyawan)|tenaga kerja|pendaftaran kerja|kerja (di|ke) luar negeri/i';

    /** Whether a fact-check's title is about a job offer. */
    public static function isAboutJobs(string $title): bool
    {
        return (bool) preg_match(self::JOB_TITLE, $title);
    }

    private const ARCHIVE_HOSTS = ['archive.ph', 'archive.today', 'archive.is', 'archive.li', 'archive.org', 'ghostarchive.org', 'perma.cc'];

    private const PLATFORMS = [
        'tiktok.com' => 'tiktok', 'facebook.com' => 'facebook', 'fb.com' => 'facebook', 'instagram.com' => 'instagram',
        'x.com' => 'x', 'twitter.com' => 'x', 'youtube.com' => 'youtube', 'threads.net' => 'threads', 't.me' => 'telegram',
        'wa.me' => 'whatsapp', 'whatsapp.com' => 'whatsapp',
    ];

    // Quoted wording of at least this length is taken as the scam's own text
    private const MIN_QUOTE = 40;

    /**
     * Article ids and URLs on a listing page, newest first.
     *
     * @return array<int, string> id => absolute URL
     */
    public static function listingArticles(string $html): array
    {
        preg_match_all('~href="(?:https://turnbackhoax\.id)?(/articles/(\d+)-[a-z0-9-]+)"~i', $html, $matches, PREG_SET_ORDER);
        $articles = [];
        foreach ($matches as [, $path, $id]) {
            $articles[(int) $id] ??= self::BASE_URL.$path;
        }

        return $articles;
    }

    /**
     * The parts of an article the dataset keeps.
     *
     * @return array{title: string, published_at: ?string, category: ?string, verdict: ?string, posting_text: string, narrative: string, explanation: ?string, conclusion: ?string, platform: ?string, source_links: list<string>, archive_links: list<string>, reference_links: list<string>, image_urls: list<array{url: string, stamped: bool}>}
     */
    public static function parseArticle(string $html): array
    {
        $dom = new DOMDocument;
        // The pages are UTF-8; the prefix keeps DOMDocument from reading them as Latin-1
        @$dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NOERROR | LIBXML_NOWARNING);
        $xpath = new DOMXPath($dom);
        $article = $xpath->query('//article')->item(0) ?? $dom->documentElement;

        $text = fn (string $query) => self::clean($xpath->query($query, $article)->item(0)?->textContent);
        $section = fn (string $heading) => $xpath->query(
            ".//section[strong[normalize-space()='{$heading}']]/div",
            $article
        )->item(0);

        $narrativeNode = $section('Narasi');
        $narrative = self::clean($narrativeNode?->textContent);
        $narrativeLinks = $narrativeNode ? self::links($xpath, $narrativeNode) : [];
        [$archives, $sources] = self::splitArchives($narrativeLinks);
        $linksIn = fn (string $class) => ($node = $xpath->query(".//section[contains(@class,'{$class}')]", $article)->item(0))
            ? self::links($xpath, $node)
            : [];
        $references = $linksIn('article-references');
        // The fact-check's own "Sumber" points to an archive, which the narrative may not link
        [$referenceArchives] = self::splitArchives([...$linksIn('article-factcheck'), ...$references]);

        return [
            'title' => $text('.//h1') ?? '',
            'published_at' => $xpath->query('.//time/@datetime', $article)->item(0)?->nodeValue,
            'category' => $text(".//a[contains(@href,'category=')]"),
            'verdict' => $text(".//*[contains(@class,'factcheck-result')]"),
            'posting_text' => self::quotedText($narrative) ?? $narrative,
            'narrative' => $narrative ?? '',
            'explanation' => self::clean($section('Penjelasan')?->textContent),
            'conclusion' => self::clean($section('Kesimpulan')?->textContent),
            'platform' => $sources ? self::platform($sources[0]) : null,
            'source_links' => $sources,
            'archive_links' => array_values(array_unique([...$archives, ...$referenceArchives])),
            'reference_links' => $references,
            'image_urls' => self::images($xpath, $article),
        ];
    }

    public static function platform(string $url): string
    {
        $host = preg_replace('/^(www|m|web|vt|vm)\./', '', strtolower((string) parse_url($url, PHP_URL_HOST)));
        foreach (self::PLATFORMS as $domain => $platform) {
            if ($host === $domain || str_ends_with($host, ".{$domain}")) {
                return $platform;
            }
        }

        return 'web';
    }

    /** The scam's wording: the quoted passages of the narrative, which otherwise describes the post. */
    private static function quotedText(?string $narrative): ?string
    {
        if (! $narrative) {
            return null;
        }
        preg_match_all('/[“"]([^”"]{'.self::MIN_QUOTE.',})[”"]/u', $narrative, $matches);

        return $matches[1] ? implode("\n\n", array_map('trim', $matches[1])) : null;
    }

    /** @return list<string> */
    private static function links(DOMXPath $xpath, DOMElement $node): array
    {
        $links = [];
        foreach ($xpath->query('.//a/@href', $node) as $href) {
            $url = trim($href->nodeValue);
            if (str_starts_with($url, 'http') && ! str_contains($url, 'turnbackhoax.id')) {
                $links[] = $url;
            }
        }

        return array_values(array_unique($links));
    }

    /**
     * @param  list<string>  $links
     * @return array{0: list<string>, 1: list<string>} archives, others
     */
    private static function splitArchives(array $links): array
    {
        $isArchive = function (string $url) {
            $host = strtolower((string) parse_url($url, PHP_URL_HOST));
            foreach (self::ARCHIVE_HOSTS as $archive) {
                if ($host === $archive || str_ends_with($host, ".{$archive}")) {
                    return true;
                }
            }

            return false;
        };

        return [
            array_values(array_filter($links, $isArchive)),
            array_values(array_filter($links, fn ($url) => ! $isArchive($url))),
        ];
    }

    /**
     * Images in the article body, the header included: in newer articles the header is the scam poster
     * itself in Mafindo's frame, and often the only image. Images the fact-checker made carry its
     * verdict stamp or frame, so they are marked.
     *
     * @return list<array{url: string, stamped: bool}>
     */
    private static function images(DOMXPath $xpath, DOMElement|\DOMNode $article): array
    {
        $images = [];
        // Not the "Artikel terbaru" sidebar, which shows other articles' headers
        foreach ($xpath->query(".//section//img[not(ancestor::section[contains(@class,'sidebar')])]/@src", $article) as $src) {
            $url = trim($src->nodeValue);
            // Partner media's articles carry a dummyimage.com placeholder instead of the poster
            if (! str_starts_with($url, 'http') || preg_match('/logo|icon|avatar|dummyimage\.com/i', $url)) {
                continue;
            }
            $images[] = ['url' => $url, 'stamped' => str_contains($url, 'turnbackhoax.id')];
        }

        return array_values(array_unique($images, SORT_REGULAR));
    }

    private static function clean(?string $text): ?string
    {
        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode((string) $text, ENT_QUOTES | ENT_HTML5, 'UTF-8')));

        return $text === '' ? null : $text;
    }
}
