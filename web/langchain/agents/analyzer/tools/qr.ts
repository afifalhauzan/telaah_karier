import jsQR from "jsqr";
import sharp from "sharp";
import type { AnalyzeImage } from "../analyze";

// QR codes on posters, decoded here rather than by the vision model: a model asked to "read" a QR
// code invents an address, and an invented address would then be traced and judged as real.

// Scanned at this width: a poster's QR code is decodable well below the photo's full size, and
// jsQR's cost grows with the pixel count
const SCAN_WIDTH = 1200;
const MAX_IMAGES = 4;

export async function decodeQr(image: Buffer): Promise<string | null> {
  const { data, info } = await sharp(image)
    .rotate()
    .resize({ width: SCAN_WIDTH, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height)?.data ?? null;
}

/** Web addresses in the QR codes of the attached images; PDFs and unreadable images are skipped. */
export async function decodeQrLinks(images: AnalyzeImage[]): Promise<string[]> {
  const links = await Promise.all(
    images
      .filter((image) => image.mediaType.startsWith("image/") && image.url.startsWith("data:"))
      .slice(0, MAX_IMAGES)
      .map(async (image) => {
        try {
          const content = await decodeQr(Buffer.from(image.url.slice(image.url.indexOf(",") + 1), "base64"));
          return content && /^https?:\/\/\S+$/i.test(content.trim()) ? content.trim() : null;
        } catch (error) {
          console.error("[QR] Decode failed:", error instanceof Error ? error.message : error);
          return null;
        }
      })
  );
  return [...new Set(links.filter((link): link is string => link !== null))];
}
