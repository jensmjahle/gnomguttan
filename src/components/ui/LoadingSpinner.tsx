import styles from './LoadingSpinner.module.css';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  center?: boolean;
}

export function LoadingSpinner({ size = 'md', center = false }: Props) {
  return (
    <div className={[styles.wrapper, center ? styles.center : ''].filter(Boolean).join(' ')}>
      <span className={[styles.spinner, styles[size]].join(' ')} aria-label="Loading" />
    </div>
  );
}
