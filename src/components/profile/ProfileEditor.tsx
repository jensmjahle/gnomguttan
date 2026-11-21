import { useRef, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { authErrorText } from '@/pages/LoginPage';
import {
  BIO_MAX,
  FULL_NAME_MAX,
  NAME_MAX,
  PROFILE_FIELDS,
  type HideableField,
  type ProfileFieldDef,
  type ProfileFieldKey,
} from '@/constants/profileFields';
import { changeEmail, removeAvatar, saveProfile, uploadAvatar, type Profile } from '@/services/profiles';
import { avatarUrl } from '@/utils/avatar';
import styles from './Profile.module.css';

function VisibilityToggle({ hidden, onToggle, label }: { hidden: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`${styles.visibility} ${hidden ? styles.visibilityHidden : ''}`}
      onClick={onToggle}
      aria-pressed={!hidden}
      aria-label={`${label}: ${hidden ? 'skjult for andre' : 'synlig for andre'}`}
      title={hidden ? 'Skjult for andre – trykk for å vise' : 'Synlig for andre – trykk for å skjule'}
    >
      {hidden ? 'Skjult' : 'Vis'}
    </button>
  );
}

function FieldInput({ def, value, onChange }: { def: ProfileFieldDef; value: string; onChange: (value: string) => void }) {
  if (def.kind === 'select') {
    return (
      <select className={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Ikke oppgitt</option>
        {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      className={styles.input}
      type={def.kind === 'number' ? 'number' : def.kind}
      inputMode={def.kind === 'number' ? 'decimal' : undefined}
      min={def.min}
      max={def.max}
      step="any"
      maxLength={def.maxLength}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={def.unit ? def.unit : undefined}
    />
  );
}

/** Editing your own profile. Each detail can be hidden from others. */
export function ProfileEditor({ profile, onSaved, onCancel }: { profile: Profile; onSaved: (profile: Profile) => void; onCancel: () => void }) {
  const [name, setName] = useState(profile.name);
  const [fullName, setFullName] = useState(profile.fullName ?? '');
  const [bio, setBio] = useState(profile.bio);
  const [fields, setFields] = useState<Partial<Record<ProfileFieldKey, string>>>(profile.fields);
  const [hidden, setHidden] = useState<Set<HideableField>>(new Set(profile.hiddenFields ?? []));
  const [avatarVersion, setAvatarVersion] = useState(profile.avatarUpdatedAt);
  const [hasAvatar, setHasAvatar] = useState(profile.hasAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [email, setEmail] = useState(profile.email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailMessage, setEmailMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (field: HideableField) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field); else next.add(field);
      return next;
    });

  async function onPickAvatar(file: File | undefined) {
    if (!file) return;
    setAvatarError('');
    try {
      setAvatarVersion(await uploadAvatar(file));
      setHasAvatar(true);
    } catch (err) {
      setAvatarError(authErrorText(err, err instanceof Error && err.message ? err.message : 'Kunne ikke laste opp bildet.'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onRemoveAvatar() {
    setAvatarError('');
    try {
      setAvatarVersion(await removeAvatar());
      setHasAvatar(false);
    } catch (err) {
      setAvatarError(authErrorText(err, 'Kunne ikke fjerne bildet.'));
    }
  }

  async function onChangeEmail(e: FormEvent) {
    e.preventDefault();
    setEmailMessage(null);
    try {
      const updated = await changeEmail(email, emailPassword);
      setEmail(updated.email ?? email);
      setEmailPassword('');
      setEmailMessage({ ok: true, text: 'E-posten er endret. Bruk den neste gang du logger inn.' });
    } catch (err) {
      setEmailMessage({ ok: false, text: authErrorText(err, 'Kunne ikke endre e-posten.') });
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const allFields = Object.fromEntries(PROFILE_FIELDS.map((def) => [def.key, fields[def.key] ?? '']));
      onSaved(await saveProfile({ name, fullName, bio, fields: allFields, hiddenFields: [...hidden] }));
    } catch (err) {
      setError(authErrorText(err, 'Kunne ikke lagre profilen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <h2 className={styles.sectionTitle}>Rediger profil</h2>

      <div className={styles.avatarRow}>
        <Avatar src={avatarUrl(profile.uid, avatarVersion)} name={name} size="xl" />
        <div className={styles.avatarActions}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => void onPickAvatar(e.target.files?.[0])} />
          <button type="button" className={styles.button} onClick={() => fileRef.current?.click()}>Last opp bilde</button>
          {hasAvatar && <button type="button" className={styles.linkButton} onClick={() => void onRemoveAvatar()}>Fjern bildet</button>}
          {avatarError && <p className={styles.error} role="alert">{avatarError}</p>}
        </div>
      </div>

      <form className={styles.form} onSubmit={onSave}>
        <label className={styles.field}>
          <span className={styles.label}>Visningsnavn</span>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} required minLength={2} />
          <span className={styles.hint}>Det andre ser og @nevner. Gamle innlegg beholder det gamle navnet, men lenker fortsatt til deg.</span>
        </label>

        <div className={styles.field}>
          <span className={styles.labelRow}>
            <span className={styles.label}>Fullt navn</span>
            <VisibilityToggle hidden={hidden.has('fullName')} onToggle={() => toggle('fullName')} label="Fullt navn" />
          </span>
          <input className={styles.input} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={FULL_NAME_MAX} aria-label="Fullt navn" />
        </div>

        <label className={styles.field}>
          <span className={styles.labelRow}>
            <span className={styles.label}>Bio</span>
            <span className={`${styles.hint} ${bio.length > BIO_MAX ? styles.over : ''}`}>{bio.length}/{BIO_MAX}</span>
          </span>
          <textarea className={`${styles.input} ${styles.textarea}`} value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={BIO_MAX} placeholder="Noen ord om deg – vises når noen holder over navnet ditt" />
        </label>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Detaljer</legend>
          <p className={styles.hint}>Brukes også i Ølbørs. Alt er synlig for de andre i gjengen med mindre du skjuler det.</p>
          <div className={styles.detailsGrid}>
            {PROFILE_FIELDS.map((def) => (
              <div key={def.key} className={styles.field}>
                <span className={styles.labelRow}>
                  <span className={styles.label}>{def.label}</span>
                  <VisibilityToggle hidden={hidden.has(def.key)} onToggle={() => toggle(def.key)} label={def.label} />
                </span>
                <FieldInput def={def} value={fields[def.key] ?? ''} onChange={(value) => setFields((current) => ({ ...current, [def.key]: value }))} />
              </div>
            ))}
          </div>
        </fieldset>

        <div className={styles.toggleRow}>
          <span className={styles.label}>Vis e-postadressen min</span>
          <VisibilityToggle hidden={hidden.has('email')} onToggle={() => toggle('email')} label="E-post" />
        </div>
        <div className={styles.toggleRow}>
          <span>
            <span className={styles.label}>Vis når jeg sist var aktiv</span>
            <span className={styles.hint}> — «Sist aktiv 5 min siden»</span>
          </span>
          <VisibilityToggle hidden={hidden.has('lastSeen')} onToggle={() => toggle('lastSeen')} label="Sist aktiv" />
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Lagrer…' : 'Lagre profilen'}</button>
          <button type="button" className={styles.button} onClick={onCancel} disabled={busy}>Avbryt</button>
        </div>
      </form>

      <form className={`${styles.form} ${styles.subForm}`} onSubmit={onChangeEmail}>
        <span className={styles.label}>E-post (brukes til å logge inn)</span>
        <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="E-post" required />
        {email.trim().toLowerCase() !== (profile.email ?? '').toLowerCase() && (
          <>
            <input className={styles.input} type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="Passordet ditt, for å bekrefte" autoComplete="current-password" aria-label="Passord" required />
            <div><button type="submit" className={styles.button}>Bytt e-post</button></div>
          </>
        )}
        {emailMessage && <p className={emailMessage.ok ? styles.success : styles.error} role={emailMessage.ok ? 'status' : 'alert'}>{emailMessage.text}</p>}
      </form>
    </div>
  );
}
