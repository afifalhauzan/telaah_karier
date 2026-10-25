<?php

namespace App\Support;

use GdImage;
use Illuminate\Support\Facades\Storage;

/**
 * Cuts the scam poster out of a TurnBackHoax article header. Since 2026 Mafindo frames the poster in
 * one template: a 1600x900 picture with a yellow or purple frame, hands and badges around a plain
 * "screen", and the verdict label ("FABRICATED CONTENT") over the bottom of the screen. The poster is
 * the screen's non-plain columns above that label, so the cut keeps no stamp, badge, or frame.
 * shortcut: about the bottom tenth of the poster is lost under the label, a dark poster on the
 * dark screen loses a few edge pixels, and a poster reaching the screen's border line would lose up
 * to 40 px (the widest seen starts at x=469). A dark-mode screenshot on the dark screen cannot be told
 * from it and yields no poster (3 of 102 headers in Oct 2026), as does a new template.
 */
class MafindoHeader
{
    private const WIDTH = 1600;

    private const HEIGHT = 900;

    // The screen inside the frame, and the line above the label and its tape
    private const SCREEN_LEFT = 250;

    private const SCREEN_RIGHT = 1350;

    private const SCREEN_TOP = 50;

    private const LABEL_TOP = 650;

    // The screen's border line, kept out of the background sample and the column scan
    private const BORDER = 40;

    // Points that are always the frame, and the skin of the lower right hand, in every variant seen
    private const FRAME_POINTS = [[240, 450], [240, 100], [800, 860], [240, 800]];

    // Yellow, purple, and light blue frames
    private const FRAME_COLOURS = [[251, 195, 0], [101, 51, 137], [150, 182, 241]];

    private const HAND_POINT = [1360, 800];

    private const HAND_COLOUR = [248, 177, 167];

    // Wide enough for the hand's shading where a header is drawn a few pixels off
    private const HAND_TOLERANCE = 140;

    private const MIN_POSTER_WIDTH = 200;

    /**
     * Cuts the poster out of a stored image and stores it next to it ("…/0.png" → "…/0.poster.png").
     * Returns the poster's path, or null when the image is not the header template.
     */
    public static function storePoster(string $path): ?string
    {
        $poster = Storage::disk('local')->exists($path) ? self::poster(Storage::disk('local')->get($path)) : null;
        if ($poster === null) {
            return null;
        }
        $posterPath = preg_replace('/\.[a-z]+$/i', '.poster.png', $path);

        return Storage::disk('local')->put($posterPath, $poster) ? $posterPath : null;
    }

    /** The poster as PNG bytes, or null when the image is not Mafindo's header template. */
    public static function poster(string $image): ?string
    {
        // GD warns on anything that is no image, so the file signature is checked first (PNG, JPEG, WebP),
        // then the size: only a 1600x900 picture is decoded at all
        $isImage = str_starts_with($image, "\x89PNG") || str_starts_with($image, "\xFF\xD8") || (str_starts_with($image, 'RIFF') && substr($image, 8, 4) === 'WEBP');
        if (! $isImage) {
            return null;
        }
        $size = getimagesizefromstring($image);
        if (! $size || $size[0] !== self::WIDTH || $size[1] !== self::HEIGHT) {
            return null;
        }
        $gd = imagecreatefromstring($image);
        if (! $gd) {
            return null;
        }
        try {
            if (! self::isTemplate($gd)) {
                return null;
            }
            [$left, $right] = self::posterColumns($gd);
            if ($right - $left + 1 < self::MIN_POSTER_WIDTH) {
                return null;
            }
            $crop = imagecrop($gd, ['x' => $left, 'y' => self::SCREEN_TOP, 'width' => $right - $left + 1, 'height' => self::LABEL_TOP - self::SCREEN_TOP]);
            ob_start();
            imagepng($crop);

            return ob_get_clean() ?: null;
        } finally {
            imagedestroy($gd);
        }
    }

    private static function isTemplate(GdImage $gd): bool
    {
        $frame = self::rgb($gd, ...self::FRAME_POINTS[0]);
        $isFrameColour = fn (array $rgb) => array_filter(self::FRAME_COLOURS, fn ($colour) => self::distance($rgb, $colour) < 30) !== [];

        return $isFrameColour($frame)
            && array_filter(self::FRAME_POINTS, fn ($point) => self::distance(self::rgb($gd, ...$point), $frame) >= 30) === []
            && self::distance(self::rgb($gd, ...self::HAND_POINT), self::HAND_COLOUR) < self::HAND_TOLERANCE;
    }

    /** @return array{int, int} the poster's first and last column */
    private static function posterColumns(GdImage $gd): array
    {
        $background = self::rgb($gd, self::SCREEN_LEFT + 50, 400);
        $isPoster = function (int $x) use ($gd, $background): bool {
            $hits = 0;
            $samples = 0;
            for ($y = self::SCREEN_TOP; $y < self::LABEL_TOP; $y += 5, $samples++) {
                $hits += self::distance(self::rgb($gd, $x, $y), $background) > 40 ? 1 : 0;
            }

            return $hits / $samples > 0.5;
        };

        // From inside the border line outwards: the first plain-background column on each side
        $innerLeft = self::SCREEN_LEFT + self::BORDER;
        $innerRight = self::SCREEN_RIGHT - self::BORDER;
        $left = $innerLeft;
        while ($left < $innerRight && ! $isPoster($left)) {
            $left++;
        }
        $right = $innerRight;
        while ($right > $left && ! $isPoster($right)) {
            $right--;
        }

        return [$left, $right];
    }

    /** @return array{int, int, int} */
    private static function rgb(GdImage $gd, int $x, int $y): array
    {
        $colour = imagecolorat($gd, $x, $y);

        return [($colour >> 16) & 0xFF, ($colour >> 8) & 0xFF, $colour & 0xFF];
    }

    private static function distance(array $a, array $b): int
    {
        return abs($a[0] - $b[0]) + abs($a[1] - $b[1]) + abs($a[2] - $b[2]);
    }
}
