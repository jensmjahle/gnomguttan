import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import styles from './AppLayout.module.css';

interface Props {
  children: ReactNode;
}

export function AppLayout({ children }: Props) {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
