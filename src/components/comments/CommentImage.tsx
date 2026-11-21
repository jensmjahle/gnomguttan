import { useState } from 'react';
import { Lightbox } from '@/components/ui/Lightbox';
import { commentImageUrl } from '@/services/comments';
import { useAuthStore } from '@/store/authStore';
import styles from './CommentImage.module.css';

interface Props {
  imageId: string;
}

/** An attached photo or GIF; opens full size on click. */
export function CommentImage({ imageId }: Props) {
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const src = commentImageUrl(imageId, token);

  return (
    <>
      <button type="button" className={styles.thumbButton} onClick={() => setOpen(true)} aria-label="Vis bildet">
        <img className={styles.thumb} src={src} alt="" loading="lazy" />
      </button>
      {open && <Lightbox src={src} alt="Bilde i kommentar" onClose={() => setOpen(false)} />}
    </>
  );
}
