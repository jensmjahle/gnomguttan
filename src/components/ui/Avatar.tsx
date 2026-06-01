import { useState } from 'react';
import styles from './Avatar.module.css';

interface Props {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function initials(name?: string) {
  const value = name?.trim();
  if (!value) return '?';

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || value.slice(0, 2).toUpperCase();
}

export function Avatar({ src, name, size = 'md', className }: Props) {
  const [imgError, setImgError] = useState(false);
  const cls = [styles.avatar, styles[size], className].filter(Boolean).join(' ');
  const fallbackName = name?.trim() || 'Unknown user';

  return (
    <span className={cls} title={fallbackName}>
      {src && !imgError ? (
        <img src={src} alt={fallbackName} onError={() => setImgError(true)} />
      ) : (
        <span className={styles.initials}>{initials(name)}</span>
      )}
    </span>
  );
}
