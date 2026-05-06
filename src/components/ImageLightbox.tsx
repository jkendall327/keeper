import { Icon } from './Icon.tsx';
import styles from './ImageLightbox.module.css';

interface ImageLightboxProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
}

export function ImageLightbox({
  imageUrl,
  title,
  onClose,
}: ImageLightboxProps) {
  const altText = title !== '' ? title : 'Image note';

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close image preview"
          autoFocus
        >
          <Icon name="close" size={22} />
        </button>
        <img src={imageUrl} alt={altText} />
      </div>
    </div>
  );
}
