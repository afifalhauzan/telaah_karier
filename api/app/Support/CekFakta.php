<?php

namespace App\Support;

/**
 * Reads cekfakta.com's search, which also covers partner media's fact-checks (Liputan6, …) that
 * TurnBackHoax lists nowhere. Both sites share Yudistira's article ids, and TurnBackHoax serves
 * every id, so only the ids are taken here and the article is read the usual way.
 * shortcut: the search answers the latest 50 matches only (its page parameter is ignored); older
 * partner fact-checks need the Yudistira API.
 */
class CekFakta
{
    public const SEARCH_URL = 'https://cekfakta.com/api-search?search=lowongan';

    /**
     * Article ids in the search page, which embeds its results as `const responseData = [...]`.
     *
     * @return list<int>
     */
    public static function searchArticleIds(string $html): array
    {
        preg_match_all('~\{"id":"(\d+)","authors":~', $html, $matches);

        return array_values(array_unique(array_map('intval', $matches[1])));
    }
}
