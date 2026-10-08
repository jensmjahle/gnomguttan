import type { RefObject } from 'react';
import styles from '@/pages/Chat2Page.module.css';

export function MatrixFormatting({ input, value, onChange, preview, onPreview, disabled = false }: { input: RefObject<HTMLTextAreaElement>; value: string; onChange: (source: string) => void; preview: boolean; onPreview: () => void; disabled?: boolean }) {
  function wrap(before: string, after: string, placeholder: string) {
    const start = input.current?.selectionStart ?? value.length; const end = input.current?.selectionEnd ?? start;
    const selection = value.slice(start, end) || placeholder;
    onChange(value.slice(0, start) + before + selection + after + value.slice(end));
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + before.length, start + before.length + selection.length); });
  }
  return <div className={styles.formattingToolbar}>
    <button type="button" aria-label="Fet skrift" title="Fet skrift" disabled={disabled || preview} onClick={() => wrap('**', '**', 'tekst')}><b>B</b></button>
    <button type="button" aria-label="Kursiv skrift" title="Kursiv" disabled={disabled || preview} onClick={() => wrap('*', '*', 'tekst')}><i>I</i></button>
    <button type="button" aria-label="Gjennomstreking" title="Gjennomstreking" disabled={disabled || preview} onClick={() => wrap('~~', '~~', 'tekst')}><s>S</s></button>
    <button type="button" aria-label="Kode" title="Kode" disabled={disabled || preview} onClick={() => wrap('`', '`', 'kode')}>‹/›</button>
    <button type="button" aria-label="Kodeblokk" title="Kodeblokk" disabled={disabled || preview} onClick={() => wrap('\n```\n', '\n```\n', 'kode')}>☷</button>
    <button type="button" aria-label="Sitat" title="Sitat" disabled={disabled || preview} onClick={() => wrap('\n> ', '\n', 'sitat')}>❞</button>
    <button type="button" aria-label="Punktliste" title="Punktliste" disabled={disabled || preview} onClick={() => wrap('\n- ', '\n', 'punkt')}>≡</button>
    <button type="button" aria-label="Lenke" title="Lenke" disabled={disabled || preview} onClick={() => wrap('[', '](https://)', 'lenketekst')}>↗</button>
    <button type="button" className={styles.previewToggle} aria-pressed={preview} disabled={disabled} onClick={onPreview}>{preview ? 'Rediger' : 'Forhåndsvis'}</button>
  </div>;
}
