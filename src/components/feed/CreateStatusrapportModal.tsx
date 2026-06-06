import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/ui/Avatar';
import { vocechatService } from '@/services/vocechat';
import { useAuthStore } from '@/store/authStore';
import { postStatusrapport } from '@/services/feed';
import { prepareImageForUpload } from '@/utils/imageResize';
import styles from './CreateStatusrapportModal.module.css';

interface Props {
  onClose: () => void;
}

function PhotoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

const MAX_TEXT = 500;

export function CreateStatusrapportModal({ onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const avatarSrc = user != null
    ? vocechatService.avatarUrl(user.uid, user.avatarUpdatedAt)
    : undefined;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    try {
      const prepared = await prepareImageForUpload(file);
      setImageDataUrl(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste bildet.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await postStatusrapport(text.trim(), imageDataUrl ?? undefined);
      onClose();
    } catch {
      setError('Kunne ikke publisere. Prøv igjen.');
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Ny statusrapport">
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Ny statusrapport</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Lukk">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.composerRow}>
            <Avatar src={avatarSrc} name={user?.name} size="md" />
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Hva skjer?"
              maxLength={MAX_TEXT}
              rows={4}
            />
          </div>

          {imageDataUrl && (
            <div className={styles.previewWrap}>
              <img src={imageDataUrl} alt="Forhåndsvisning" className={styles.preview} />
              <button
                type="button"
                className={styles.removeImageBtn}
                onClick={() => setImageDataUrl(null)}
                aria-label="Fjern bilde"
              >
                ×
              </button>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.attachBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
              title="Legg til bilde"
            >
              <PhotoIcon />
            </button>
            <span className={`${styles.charCount} ${text.length > MAX_TEXT * 0.8 ? styles.charCountWarn : ''}`}>
              {text.length}/{MAX_TEXT}
            </span>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!text.trim() || submitting}
            >
              {submitting ? 'Publiserer…' : 'Publiser'}
            </button>
          </div>
        </form>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className={styles.fileInput}
          onChange={handleImageChange}
        />
      </div>
    </div>,
    document.body,
  );
}
