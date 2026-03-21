'use no memo';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?[^\s]*)?$/i;
const URL_PATTERN = /^https?:\/\/\S+$/;

/**
 * If the note body is nothing but a single image URL, return that URL.
 * Otherwise return null.
 */
export function getImageUrl(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed === '' || trimmed.includes('\n')) return null;
  if (!URL_PATTERN.test(trimmed)) return null;
  if (!IMAGE_EXTENSIONS.test(trimmed)) return null;
  return trimmed;
}
