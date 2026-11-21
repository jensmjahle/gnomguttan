import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/ui/Avatar';
import { refreshAppUsers, useAppUsers } from '@/hooks/useAppUsers';
import { useAuthStore } from '@/store/authStore';
import { activeMentions } from '@/utils/comments';
import { getPersonAvatar } from '@/utils/people';
import type { CommentMention, CommunityEventPerson } from '@/types';
import styles from './MentionTextarea.module.css';

const MAX_SUGGESTIONS = 6;
// "@" at the start or after whitespace, followed by up to two words of a name.
const MENTION_QUERY = /(?:^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/;

interface Props {
  value: string;
  mentions: CommentMention[];
  onChange: (value: string, mentions: CommentMention[]) => void;
  /** Called on Enter (without Shift). When omitted, Enter inserts a newline. */
  onSubmit?: () => void;
  onEscape?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  rows?: number;
  className?: string;
  textareaRef?: RefObject<HTMLTextAreaElement>;
}

interface ActiveQuery {
  text: string;
  start: number;
  end: number;
}

function findQuery(value: string, caret: number): ActiveQuery | null {
  const match = MENTION_QUERY.exec(value.slice(0, caret));
  if (!match) return null;
  const text = match[1];
  return { text, start: caret - text.length - 1, end: caret };
}

function matchesQuery(person: CommunityEventPerson, query: string) {
  const name = person.name.toLowerCase();
  const needle = query.toLowerCase();
  return name.startsWith(needle) || name.split(/\s+/).some((word) => word.startsWith(needle));
}

/** A textarea that suggests users after "@" and tracks who was mentioned. */
export function MentionTextarea({
  value,
  mentions,
  onChange,
  onSubmit,
  onEscape,
  placeholder,
  disabled,
  autoFocus,
  maxLength,
  rows = 1,
  className,
  textareaRef,
}: Props) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;
  const { users } = useAppUsers();
  const myUid = useAuthStore((s) => s.user?.uid ?? null);
  const [query, setQuery] = useState<ActiveQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const suggestions = useMemo(() => {
    if (!query) return [];
    return users
      .filter((person) => person.uid !== myUid && matchesQuery(person, query.text))
      .slice(0, MAX_SUGGESTIONS);
  }, [users, query, myUid]);
  const open = suggestions.length > 0 && anchor !== null;

  // Grow with the content.
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, ref]);

  useEffect(() => {
    const textarea = ref.current;
    if (!autoFocus || !textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [autoFocus, ref]);

  // The list is positioned once; close it rather than chase the textarea around.
  useEffect(() => {
    if (!query) return;
    const close = () => setQuery(null);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [query]);

  function updateQuery(nextValue: string, caret: number) {
    const next = findQuery(nextValue, caret);
    // Opening the list is a good moment to pick up people who joined since the page loaded.
    if (next && !query) void refreshAppUsers(60_000);
    setQuery(next);
    setActiveIndex(0);
    setAnchor(next && ref.current ? ref.current.getBoundingClientRect() : null);
  }

  function pick(person: CommunityEventPerson) {
    if (!query) return;
    const inserted = `@${person.name} `;
    const nextValue = value.slice(0, query.start) + inserted + value.slice(query.end);
    const nextMentions = [...mentions.filter((mention) => mention.uid !== person.uid), { uid: person.uid, name: person.name }];
    onChange(nextValue, activeMentions(nextValue, nextMentions));
    setQuery(null);

    const caret = query.start + inserted.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;

    if (open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => (index + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(suggestions[activeIndex] ?? suggestions[0]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setQuery(null);
        return;
      }
    }

    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <>
      <textarea
        ref={ref}
        className={[styles.textarea, className].filter(Boolean).join(' ')}
        value={value}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue, activeMentions(nextValue, mentions));
          updateQuery(nextValue, event.target.selectionStart);
        }}
        onSelect={(event) => {
          const target = event.currentTarget;
          if (target.selectionStart === target.selectionEnd) updateQuery(target.value, target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setQuery(null)}
        aria-autocomplete="list"
        aria-expanded={open}
      />

      {open && anchor && createPortal(
        <ul
          className={styles.suggestions}
          role="listbox"
          aria-label="Nevn en bruker"
          style={{
            left: Math.max(8, Math.min(anchor.left, window.innerWidth - 248)),
            // Open upwards when the textarea sits low in the viewport.
            ...(anchor.bottom + 240 > window.innerHeight
              ? { bottom: window.innerHeight - anchor.top + 4 }
              : { top: anchor.bottom + 4 }),
          }}
        >
          {suggestions.map((person, index) => (
            <li key={person.uid} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`${styles.suggestion} ${index === activeIndex ? styles.suggestionActive : ''}`}
                // Keep focus in the textarea so the blur handler doesn't close the list first.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(person)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <Avatar src={getPersonAvatar(person)} name={person.name} size="sm" />
                <span className={styles.suggestionName}>{person.name}</span>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
