import { useEffect, useState } from 'react';
import { loadNotificationSettings, saveNotificationSettings } from '@/services/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import type { NotificationSettings as Settings } from '@/types';
import styles from './NotificationSettings.module.css';

const SECTIONS: Array<{ heading: string; rows: Array<{ key: keyof Settings; label: string; hint: string }> }> = [
  {
    heading: 'Varsle meg når…',
    rows: [
      { key: 'mentions', label: 'noen nevner meg', hint: '@omtaler i kommentarer og statusrapporter' },
      { key: 'replies', label: 'noen svarer på kommentaren min', hint: 'Svar i tråder du har skrevet i' },
      { key: 'ownPosts', label: 'noen kommenterer innleggene mine', hint: 'Også arrangementer du har laget' },
      { key: 'threads', label: 'det kommer nye kommentarer der jeg har kommentert', hint: 'Kan bli mye — av som standard' },
      { key: 'reactions', label: 'noen reagerer på innleggene eller kommentarene mine', hint: 'Samles per innlegg/kommentar' },
      { key: 'newEvents', label: 'et nytt arrangement legges ut', hint: 'Til alle i gjengen' },
    ],
  },
  {
    heading: 'Visning',
    rows: [
      { key: 'toast', label: 'Vis popup ved nye varsler', hint: 'Et lite kort nederst i hjørnet' },
      { key: 'tabTitle', label: 'Vis antall uleste i fanetittelen', hint: 'F.eks. «(3) Gnomguttan»' },
    ],
  },
];

/** The "Varsler" view in the profile overlay. Each switch saves immediately. */
export function NotificationSettings() {
  const settings = useNotificationStore((s) => s.settings);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadNotificationSettings().catch(() => setError('Kunne ikke hente innstillingene.'));
  }, []);

  function toggle(key: keyof Settings) {
    setError('');
    void saveNotificationSettings({ [key]: !settings[key] }).catch(() => setError('Kunne ikke lagre. Prøv igjen.'));
  }

  return (
    <div className={styles.settings}>
      {SECTIONS.map((section) => (
        <section key={section.heading} className={styles.section}>
          <h2 className={styles.heading}>{section.heading}</h2>
          <div className={styles.rows}>
            {section.rows.map((row) => (
              <label key={row.key} className={styles.row}>
                <span className={styles.rowText}>
                  <span className={styles.label}>{row.label}</span>
                  <span className={styles.hint}>{row.hint}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className={styles.switch}
                  checked={settings[row.key]}
                  onChange={() => toggle(row.key)}
                />
              </label>
            ))}
          </div>
        </section>
      ))}
      <p className={styles.note}>
        Dempede innlegg følger innleggets egen innstilling (⋯ på innlegget).
      </p>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
