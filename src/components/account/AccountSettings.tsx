import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  changePassword,
  createInvite,
  createResetLink,
  deleteInvite,
  listInvites,
  listSessions,
  listUsersForAdmin,
  revokeOtherSessions,
  revokeSession,
  type ActiveSession,
  type AdminUser,
  type CreatedLink,
  type PendingInvite,
} from '@/services/auth';
import { authErrorText } from '@/pages/LoginPage';
import { useAuthStore } from '@/store/authStore';
import { deviceLabel } from '@/utils/deviceLabel';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './AccountSettings.module.css';

const formatExpiry = (expiresAt: number) =>
  new Date(expiresAt).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A freshly made link with a copy button. Links are only shown once; they aren't stored readable. */
function LinkBox({ link, label }: { link: CreatedLink; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={styles.linkBox}>
      <span className={styles.hint}>{label} — gyldig til {formatExpiry(link.expiresAt)}. Vises bare nå.</span>
      <div className={styles.linkRow}>
        <input className={styles.linkInput} readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button type="button" className={styles.button} onClick={() => void copy()}>{copied ? 'Kopiert!' : 'Kopier'}</button>
      </div>
    </div>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ ok: false, text: 'De nye passordene er ikke like.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await changePassword(current, next);
      const parts = ['Passordet er byttet.'];
      if (result.signedOut) parts.push(`Logget ut på ${result.signedOut} ${result.signedOut === 1 ? 'annen enhet' : 'andre enheter'}.`);
      if (useAuthStore.getState().vocechat && !result.vocechatSynced) parts.push('VoceChat-chatten bruker fortsatt det gamle passordet.');
      setMessage({ ok: true, text: parts.join(' ') });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setMessage({ ok: false, text: authErrorText(err, 'Kunne ikke bytte passord. Prøv igjen.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Passord</h2>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span className={styles.label}>Nåværende passord</span>
          <input className={styles.input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Nytt passord</span>
          <input className={styles.input} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Gjenta nytt passord</span>
          <input className={styles.input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <p className={styles.hint}>Minst 8 tegn. Du blir logget ut på andre enheter.</p>
        <div>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Lagrer…' : 'Bytt passord'}</button>
        </div>
        {message && <p className={message.ok ? styles.success : styles.error} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      </form>
    </section>
  );
}

function SessionsSection() {
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listSessions().then(setSessions).catch(() => setError('Kunne ikke hente påloggingene.'));
  }, []);
  useEffect(load, [load]);

  const revoke = async (id: string) => {
    await revokeSession(id).catch(() => setError('Kunne ikke logge ut enheten.'));
    load();
  };
  const revokeOthers = async () => {
    await revokeOtherSessions().catch(() => setError('Kunne ikke logge ut de andre enhetene.'));
    load();
  };
  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <section className={styles.section}>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>Pålogginger</h2>
        {others > 0 && <button type="button" className={styles.button} onClick={() => void revokeOthers()}>Logg ut alle andre enheter</button>}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!sessions ? (
        <p className={styles.hint}>Henter…</p>
      ) : (
        <ul className={styles.list}>
          {sessions.map((s) => (
            <li key={s.id} className={styles.item}>
              <span className={styles.itemText}>
                <span className={styles.label}>
                  {deviceLabel(s.userAgent)}
                  {s.current && <span className={styles.badge}>Denne enheten</span>}
                </span>
                <span className={styles.hint}>
                  Sist brukt {formatRelativeTime(s.lastUsedAt)} · logget inn {formatRelativeTime(s.createdAt)}
                  {s.remember ? ' · husket' : ''}
                  {s.ip ? ` · ${s.ip}` : ''}
                </span>
              </span>
              {!s.current && <button type="button" className={styles.button} onClick={() => void revoke(s.id)}>Logg ut</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SOURCE_LABELS: Record<NonNullable<AdminUser['accountSource']>, string> = {
  'vocechat-login': 'flyttet ved innlogging',
  'vocechat-import': 'flyttet ved import',
  invite: 'invitert',
  reset: 'satt via lenke',
};

function MembersSection() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [note, setNote] = useState('');
  const [newInvite, setNewInvite] = useState<CreatedLink | null>(null);
  const [resetLinks, setResetLinks] = useState<Record<number, CreatedLink>>({});
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listUsersForAdmin().then(setUsers).catch(() => setError('Kunne ikke hente medlemmene.'));
    listInvites().then(setInvites).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setNewInvite(await createInvite(note.trim()));
      setNote('');
      load();
    } catch (err) {
      setError(authErrorText(err, 'Kunne ikke lage invitasjonen.'));
    }
  };
  const reset = async (uid: number) => {
    try {
      const link = await createResetLink(uid);
      setResetLinks((prev) => ({ ...prev, [uid]: link }));
    } catch (err) {
      setError(authErrorText(err, 'Kunne ikke lage lenken.'));
    }
  };
  const removeInvite = async (id: string) => {
    await deleteInvite(id).catch(() => setError('Kunne ikke slette invitasjonen.'));
    load();
  };
  const migrated = users?.filter((u) => u.hasAccount).length ?? 0;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Medlemmer</h2>
      <p className={styles.hint}>Bare administratorer ser dette. Lenkene sender du selv, f.eks. i chatten.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}

      <form className={styles.inline} onSubmit={invite}>
        <input className={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hvem er invitasjonen til? (valgfritt)" maxLength={100} />
        <button type="submit" className={styles.primary}>Lag invitasjon</button>
      </form>
      {newInvite && <LinkBox link={newInvite} label="Invitasjonslenke" />}
      {invites.length > 0 && (
        <ul className={styles.list}>
          {invites.map((i) => (
            <li key={i.id} className={styles.item}>
              <span className={styles.itemText}>
                <span className={styles.label}>Invitasjon{i.note ? ` til ${i.note}` : ''}</span>
                <span className={styles.hint}>Laget av {i.createdBy.name} {formatRelativeTime(i.createdAt)} · gyldig til {formatExpiry(i.expiresAt)}</span>
              </span>
              <button type="button" className={styles.button} onClick={() => void removeInvite(i.id)}>Slett</button>
            </li>
          ))}
        </ul>
      )}

      {users && (
        <>
          <p className={styles.hint}>{migrated} av {users.length} har logget inn med den nye innloggingen.</p>
          <ul className={styles.list}>
            {users.map((u) => (
              <li key={u.uid} className={styles.itemColumn}>
                <div className={styles.item}>
                  <span className={styles.itemText}>
                    <span className={styles.label}>
                      {u.name}
                      {u.isAdmin && <span className={styles.badge}>Admin</span>}
                    </span>
                    <span className={styles.hint}>
                      {u.email || 'mangler e-post'} · {u.hasAccount ? SOURCE_LABELS[u.accountSource ?? 'vocechat-login'] : 'ikke logget inn ennå'}
                      {u.lastSeenAt ? ` · sist sett ${formatRelativeTime(u.lastSeenAt)}` : ''}
                    </span>
                  </span>
                  <button type="button" className={styles.button} onClick={() => void reset(u.uid)} disabled={!u.email}>Lag lenke for nytt passord</button>
                </div>
                {resetLinks[u.uid] && <LinkBox link={resetLinks[u.uid]} label={`Lenke for nytt passord til ${u.name}`} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The "Konto" view in the profile overlay. */
export function AccountSettings() {
  const isAdmin = useAuthStore((s) => Boolean(s.user?.isAdmin));
  return (
    <div className={styles.settings}>
      <PasswordSection />
      <SessionsSection />
      {isAdmin && <MembersSection />}
    </div>
  );
}
