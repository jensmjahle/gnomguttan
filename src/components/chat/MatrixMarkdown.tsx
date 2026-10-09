import { useMemo } from 'react';
import { markdownHtml, sanitizeMatrixHtml } from '@/services/matrixMarkdown';
import styles from '@/pages/Chat2Page.module.css';

export function MatrixMarkdown({ source, formattedHtml }: { source: string; formattedHtml?: string }) {
  const html = useMemo(() => typeof formattedHtml === 'string' ? sanitizeMatrixHtml(formattedHtml) : markdownHtml(typeof source === 'string' ? source : ''), [source, formattedHtml]);
  return <div className={styles.markdown} dangerouslySetInnerHTML={{ __html: html }}/>;
}
