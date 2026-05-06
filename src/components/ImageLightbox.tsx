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
        <img src={imageUrl} alt={altText} />
      </div>
    </div>
  );
}
