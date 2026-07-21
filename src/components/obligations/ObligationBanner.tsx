import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { usePhotoObligationStore } from '@/store/photoObligationStore';
import styles from './ObligationBanner.module.css';

export function ObligationBanner() {
  const navigate = useNavigate();
  const obligations = usePhotoObligationStore((s) => s.obligations);
  const load = usePhotoObligationStore((s) => s.load);
  const resolveNoPhotos = usePhotoObligationStore((s) => s.resolveNoPhotos);
  const snooze = usePhotoObligationStore((s) => s.snooze);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const obligation = obligations[0];
  if (!obligation) return null;

  const remaining = obligations.length - 1;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.text}>
        <strong>Du har et uoppgjort gjøremål</strong>
        <span>
          Legg inn bilder fra «{obligation.eventTitle}». Du er låst fra å svare på arrangementer og legge til
          statusrapporter til dette er gjort.
          {remaining > 0 ? ` (+${remaining} til)` : ''}
        </span>
      </div>
      <div className={styles.actions}>
        <Button size="sm" onClick={() => navigate(`/galleri/album/${obligation.albumId}`)}>
          Legg til bilder
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => void run(() => resolveNoPhotos(obligation.id))}>
          Jeg har ingen bilder
        </Button>
        <Button size="sm" variant="ghost" loading={busy} onClick={() => void run(() => snooze(obligation.id))}>
          Minn meg senere
        </Button>
      </div>
    </div>
  );
}
