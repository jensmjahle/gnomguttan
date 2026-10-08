import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { loadMatrixAvatar } from '@/services/matrixMedia';
import styles from '@/pages/Chat2Page.module.css';

export function MatrixIcon({ name, size = 20 }: { name: 'search' | 'plus' | 'settings' | 'send' | 'smile' | 'file' | 'poll' | 'sticker' | 'close' | 'back' | 'lock' | 'logout' | 'chat' | 'location' | 'mic' | 'format' | 'edit'; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    settings: <><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></>,
    send: <><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/></>,
    smile: <><circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/></>,
    file: <path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8M7 14l7-7"/>,
    poll: <><path d="M5 20V10M12 20V4M19 20v-7"/><path d="M2 20h20"/></>,
    sticker: <><path d="M14 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8l-7 7Z"/><path d="M14 21v-4a3 3 0 0 1 3-3h4M8 8h.01M15 8h.01M8 11a4 4 0 0 0 7 0"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    back: <path d="m14 5-7 7 7 7"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    logout: <><path d="M10 4H4v16h6M10 12h11m-4-4 4 4-4 4"/></>,
    chat: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/>,
    location: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
    format: <><path d="m3 18 5-12 5 12M5 14h6M15 9h6M18 9v12M15 21h6"/></>,
    edit: <><path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/><path d="m13 6 5 5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function MatrixAvatar({ client, name, mxc, large = false }: { client: MatrixClient; name: string; mxc?: string; large?: boolean }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let disposed = false; let objectUrl = '';
    setSrc('');
    if (mxc?.startsWith('mxc://')) void loadMatrixAvatar(client, mxc).then(blob => {
      if (disposed || !blob.type.startsWith('image/') || blob.type === 'image/svg+xml') return;
      objectUrl = URL.createObjectURL(blob); setSrc(objectUrl);
    }).catch(() => undefined);
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, mxc]);
  const color = [...name].reduce((hash, letter) => hash + letter.charCodeAt(0), 0) % 360;
  return <span className={`${styles.avatar} ${large ? styles.avatarLarge : ''}`} style={{ backgroundColor: `hsl(${color} 40% 86%)`, color: `hsl(${color} 55% 25%)` }}>{src ? <img src={src} alt="" /> : name.replace(/^[@#!]/, '').slice(0, 2).toUpperCase()}</span>;
}

export function MatrixModal({ title, children, onClose, open = true }: { title: string; children: ReactNode; onClose: () => void; open?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const dialog = ref.current!; if (open) dialog.showModal(); else dialog.close(); return () => { dialog.close(); }; }, [open]);
  return <dialog ref={ref} className={styles.modal} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className={styles.modalInner}><header><h2 id={id}>{title}</h2><button type="button" className={styles.iconButton} aria-label="Lukk" onClick={onClose}><MatrixIcon name="close"/></button></header>{children}</div></dialog>;
}

export const MATRIX_EMOJIS = ['😀', '😄', '😂', '🥹', '😍', '😎', '🤔', '😭', '😮', '🥳', '❤️', '🔥', '👍', '👎', '👏', '🙌', '💯', '✅', '🍺', '🍻', '🎉', '🎮', '🧙', '🐈', '🫶', '💪', '👀', '🙏', '🤝', '💚', '☕', '🍕'];
export function MatrixEmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return <div className={styles.emojiGrid}>{MATRIX_EMOJIS.map(emoji => <button type="button" key={emoji} aria-label={emoji} onClick={() => onSelect(emoji)}>{emoji}</button>)}</div>;
}
