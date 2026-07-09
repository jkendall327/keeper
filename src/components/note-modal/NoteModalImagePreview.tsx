import type { NoteWithTags } from '../../db/types.ts';
import { selectNotePreviewImage } from '../link-preview-selection.ts';
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
  const previewImage = selectNotePreviewImage(note, body, showLinkPreviews, title);

  if (previewImage === null) return null;

  return (
    <div className={styles.livePreview}>
      <button
        type="button"
        className={styles.imagePreviewButton}
        onClick={() => { onOpen(previewImage.url); }}
        aria-label="Open image preview"
      >
        <img src={previewImage.url} alt={previewImage.alt} referrerPolicy="no-referrer" />
      </button>
    </div>
  );
}
