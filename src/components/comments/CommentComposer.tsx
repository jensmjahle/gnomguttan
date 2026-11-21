import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { AppApiError } from '@/services/appApi';
import { useAuthStore } from '@/store/authStore';
import { activeMentions } from '@/utils/comments';
import { prepareImageForUpload } from '@/utils/imageResize';
import { getPersonAvatar } from '@/utils/people';
import type { CommentInput } from '@/services/comments';
import type { CommentMention } from '@/types';
import { MentionTextarea } from './MentionTextarea';
import styles from './CommentComposer.module.css';

const MAX_LENGTH = 2000;

interface Props {
  placeholder: string;
  onSubmit: (input: CommentInput) => Promise<void>;
  initialText?: string;
  initialMentions?: CommentMention[];
  submitLabel?: string;
  /** Shows an "Avbryt" button (used when editing). */
  onCancel?: () => void;
  showAvatar?: boolean;
  autoFocus?: boolean;
  /** Allow attaching a photo or GIF (button or paste). */
  allowImages?: boolean;
  /** Shows "↩ Svarer <name> ✕" above the box while replying. */
  replyTo?: { name: string };
  onCancelReply?: () => void;
  /** Bump `key` to focus the box, optionally adding an @mention (e.g. when "Svar" is clicked). */
  prefill?: { key: number; mention?: CommentMention };
  /** Called while the user types, for the "skriver…" indicator. */
  onTyping?: () => void;
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

/** Text box with @mentions and attachments; Enter sends, Shift+Enter adds a line. Also used for inline editing. */
export function CommentComposer({
  placeholder,
  onSubmit,
  initialText = '',
  initialMentions = [],
  submitLabel = 'Send',
  onCancel,
  showAvatar = true,
  autoFocus = false,
  allowImages = false,
  replyTo,
  onCancelReply,
  prefill,
  onTyping,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const [text, setText] = useState(initialText);
  const [mentions, setMentions] = useState<CommentMention[]>(initialMentions);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // "Svar" clicked: focus this box and, for replies to a reply, add the @mention up front.
  const prefillKey = prefill?.key;
  const prefillMention = prefill?.mention;
  useEffect(() => {
    if (prefillKey === undefined) return;
    if (prefillMention) {
      const tag = `@${prefillMention.name}`;
      setText((current) => (current.includes(tag) ? current : `${tag} ${current}`));
      setMentions((current) => [...current.filter((m) => m.uid !== prefillMention.uid), prefillMention]);
    }
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [prefillKey, prefillMention]);

  async function attach(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setError('');
    setPreparingImage(true);
    try {
      setImageDataUrl(await prepareImageForUpload(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste bildet.');
    } finally {
      setPreparingImage(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLFormElement>) {
    if (!allowImages) return;
    const file = [...event.clipboardData.files].find((entry) => entry.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    void attach(file);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !imageDataUrl) || sending || preparingImage) return;

    setSending(true);
    setError('');
    try {
      await onSubmit({
        text: trimmed,
        mentions: activeMentions(trimmed, mentions),
        ...(imageDataUrl ? { imageDataUrl } : {}),
      });
      setText('');
      setMentions([]);
      setImageDataUrl(null);
    } catch (err) {
      setError(err instanceof AppApiError && err.status === 429
        ? 'Du er litt for rask — vent et øyeblikk og prøv igjen.'
        : 'Kunne ikke lagre. Prøv igjen.');
    } finally {
      setSending(false);
    }
  }

  const canSend = (Boolean(text.trim()) || Boolean(imageDataUrl)) && !sending && !preparingImage;

  return (
    <form ref={formRef} className={styles.composer} onSubmit={submit} onPaste={handlePaste}>
      {showAvatar && user && (
        <Avatar src={getPersonAvatar(user)} name={user.name} size="sm" className={styles.avatar} />
      )}
      <div className={styles.field}>
        {replyTo && (
          <div className={styles.replyTag}>
            <span>↩ Svarer <strong>{replyTo.name}</strong></span>
            <button type="button" className={styles.replyTagClose} onClick={onCancelReply} aria-label="Avbryt svar">
              ✕
            </button>
          </div>
        )}
        {(imageDataUrl || preparingImage) && (
          <div className={styles.attachment}>
            {imageDataUrl ? <img src={imageDataUrl} alt="Vedlagt bilde" /> : <span className={styles.attachmentLoading}>Laster bilde…</span>}
            {imageDataUrl && (
              <button type="button" className={styles.attachmentRemove} onClick={() => setImageDataUrl(null)} aria-label="Fjern bildet">
                ✕
              </button>
            )}
          </div>
        )}
        <div className={styles.inputRow}>
          <MentionTextarea
            textareaRef={textareaRef}
            value={text}
            mentions={mentions}
            onChange={(nextText, nextMentions) => {
              setText(nextText);
              setMentions(nextMentions);
              if (nextText.trim()) onTyping?.();
            }}
            onSubmit={() => void submit()}
            onEscape={replyTo ? onCancelReply : onCancel}
            placeholder={placeholder}
            disabled={sending}
            autoFocus={autoFocus}
            maxLength={MAX_LENGTH}
          />
          {allowImages && (
            <>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || preparingImage}
                aria-label="Legg ved bilde eller GIF"
                title="Bilde eller GIF"
              >
                <ImageIcon />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void attach(file);
                }}
              />
            </>
          )}
          {!onCancel && (
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!canSend}
              aria-label={submitLabel}
              title={submitLabel}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </button>
          )}
        </div>
        {onCancel && (
          <div className={styles.editActions}>
            <button type="button" className={styles.linkBtn} onClick={onCancel} disabled={sending}>
              Avbryt
            </button>
            <button type="submit" className={styles.saveBtn} disabled={!canSend}>
              {sending ? 'Lagrer…' : submitLabel}
            </button>
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </form>
  );
}
