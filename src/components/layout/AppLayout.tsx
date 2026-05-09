import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import styles from './AppLayout.module.css';

interface Props {
  children: ReactNode;
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.48 0-.24-.01-.88-.01-1.72-2.78.62-3.37-1.37-3.37-1.37-.46-1.2-1.12-1.52-1.12-1.52-.92-.65.07-.64.07-.64 1.02.08 1.56 1.07 1.56 1.07.9 1.58 2.36 1.13 2.94.87.09-.67.35-1.13.64-1.39-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.32 9.32 0 0 1 12 7.7c.85 0 1.71.12 2.51.35 1.91-1.32 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.95-2.34 4.82-4.57 5.08.36.32.68.94.68 1.89 0 1.37-.01 2.48-.01 2.82 0 .26.18.58.69.48A10.01 10.01 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function AppLayout({ children }: Props) {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerCopy}>
          <span className={styles.footerTitle}>Gnomguttan</span>
          <span className={styles.footerText}>VoceChat, kalender, galleri og kinooversikt.</span>
        </div>
        <a
          className={styles.footerLink}
          href="https://github.com/jensmjahle/gnomguttan"
          target="_blank"
          rel="noreferrer"
        >
          <GithubIcon />
          <span>GitHub repo</span>
        </a>
      </footer>
    </div>
  );
}
