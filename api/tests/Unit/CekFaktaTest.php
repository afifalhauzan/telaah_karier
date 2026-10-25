<?php

namespace Tests\Unit;

use App\Support\CekFakta;
use PHPUnit\Framework\TestCase;

require_once __DIR__.'/../Fixtures/turnbackhoax.php';

class CekFaktaTest extends TestCase
{
    public function test_the_search_page_gives_its_article_ids(): void
    {
        $this->assertSame([37243, 36106], CekFakta::searchArticleIds(cekfakta_search([37243, 36106, 37243])));
        $this->assertSame([], CekFakta::searchArticleIds('<html>502 Server Error</html>'));
    }
}
