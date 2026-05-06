import type { NoteWithTags } from '../../db/types.ts';
import { getImageUrl } from '../../utils/image-url.ts';
import styles from '../NoteModal.module.css';

interface NoteModalImagePreviewProps {
  body: string;
  note: NoteWithTags;
  showLinkPreviews: boolean;
  title: string;
  onOpen: (imageUrl: string) => void;
}

export function NoteModalImagePreview({
  body,
  note,
  showLinkPreviews,
  title,
  onOpen,
}: NoteModalImagePreviewProps) {
  const imageUrl =
    getImageUrl(body) ??
    (showLinkPreviews && note.link_preview?.status === 'found' && note.link_preview.url === body.trim()
      ? note.link_preview.image_url
      : null);

  if (imageUrl === null) return null;

  return (
    <div className={styles.livePreview}>
      <button
        type="button"
        className={styles.imagePreviewButton}
        onClick={() => { onOpen(imageUrl); }}
        aria-label="Open image preview"
      >
        <img src={imageUrl} alt={title !== '' ? title : 'Image note'} />
      </button>
    </div>
  );
}
