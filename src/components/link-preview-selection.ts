import type { NoteWithTags } from '../db/types.ts';
import { getImageUrl } from '../utils/image-url.ts';

export interface SelectedPreviewImage {
  url: string;
  alt: string;
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
    };
  }

  if (!showLinkPreviews) return null;

  const metadata = note.link_metadata.find(
    (item) => item.status === 'found' && item.image_url !== null,
  );
  if (metadata?.image_url === undefined || metadata.image_url === null) return null;

  return {
    url: metadata.image_url,
    alt: metadata.image_alt ?? metadata.title ?? (title !== '' ? title : 'Link preview image'),
  };
}
