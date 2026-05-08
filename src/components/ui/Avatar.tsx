import { useState } from 'react';
import styles from './Avatar.module.css';

interface Props {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ src, name, size = 'md', className }: Props) {
  const [imgError, setImgError] = useState(false);
  const cls = [styles.avatar, styles[size], className].filter(Boolean).join(' ');

  return (
    <span className={cls} title={name}>
      {src && !imgError ? (
        <img src={src} alt={name} onError={() => setImgError(true)} />
      ) : (
        <span className={styles.initials}>{initials(name)}</span>
      )}
    </span>
  );
}
