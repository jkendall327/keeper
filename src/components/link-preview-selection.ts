import type { NoteWithTags } from '../db/types.ts';
import { getImageUrl } from '../utils/image-url.ts';
import { isPublicHttpUrlByProtocolAndHost } from '../utils/url-safety.ts';

export interface SelectedPreviewImage {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

const NON_IMAGE_EXTENSIONS = new Set([
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ogv',
  '.webm',
  '.wmv',
]);

export function isLikelyRenderableImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isPublicHttpUrlByProtocolAndHost(parsed)) return false;
    const { pathname } = parsed;
    const extension = /\.[a-z0-9]+$/i.exec(pathname)?.[0]?.toLowerCase();
    return extension === undefined || !NON_IMAGE_EXTENSIONS.has(extension);
  } catch {
    return false;
  }
}

export function selectNotePreviewImage(
  note: NoteWithTags,
  body: string,
  showLinkPreviews: boolean,
  title: string,
): SelectedPreviewImage | null {
  const directImageUrl = getImageUrl(body);
  if (directImageUrl !== null) {
    return {
      url: directImageUrl,
      alt: title !== '' ? title : 'Image note',
      width: null,
      height: null,
    };
  }

  if (!showLinkPreviews) return null;

  const metadata = note.link_metadata.find(
    (item) => item.status === 'found' && item.image_url !== null && isLikelyRenderableImageUrl(item.image_url),
  );
  if (metadata?.image_url === undefined || metadata.image_url === null) return null;

  return {
    url: metadata.image_url,
    alt: metadata.image_alt ?? metadata.title ?? (title !== '' ? title : 'Link preview image'),
    width: metadata.image_width,
    height: metadata.image_height,
  };
}
