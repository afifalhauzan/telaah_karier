<?php

namespace Tests\Unit;

use App\Support\MafindoHeader;
use PHPUnit\Framework\TestCase;

class MafindoHeaderTest extends TestCase
{
    /** Mafindo's header template as measured on the 2026 headers: frame, plain screen, poster, hand */
    private function header(int $posterLeft, int $posterRight, array $frame = [251, 195, 0]): string
    {
        $gd = imagecreatetruecolor(1600, 900);
        imagefill($gd, 0, 0, imagecolorallocate($gd, ...$frame));
        imagefilledrectangle($gd, 250, 50, 1350, 745, imagecolorallocate($gd, 222, 228, 236));
        // Stripes, so every poster column differs from the screen
        for ($y = 50; $y <= 745; $y++) {
            imageline($gd, $posterLeft, $y, $posterRight, $y, imagecolorallocate($gd, ($y * 7) % 200, 40, 90));
        }
        imagefilledrectangle($gd, 1355, 790, 1380, 820, imagecolorallocate($gd, 248, 177, 167));
        ob_start();
        imagepng($gd);

        return ob_get_clean();
    }

    public function test_the_poster_is_cut_out_of_the_frame_above_the_verdict_label(): void
    {
        foreach ([[251, 195, 0], [101, 51, 137]] as $frame) {
            $poster = imagecreatefromstring(MafindoHeader::poster($this->header(500, 1100, $frame)));
            $this->assertSame([601, 600], [imagesx($poster), imagesy($poster)]);
        }
    }

    public function test_a_wide_poster_keeps_its_edges(): void
    {
        // As wide as the widest seen (Komatsu, x=469-1130), and wider
        $poster = imagecreatefromstring(MafindoHeader::poster($this->header(400, 1250)));
        $this->assertSame(851, imagesx($poster));
    }

    public function test_other_pictures_are_left_alone(): void
    {
        $plain = imagecreatetruecolor(1600, 900);
        ob_start();
        imagepng($plain);
        $this->assertNull(MafindoHeader::poster(ob_get_clean()));
        $this->assertNull(MafindoHeader::poster('png-bytes'));
    }
}
