import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar } from '@/components/ui/Avatar';
import { ProfileEditor } from '@/components/profile/ProfileEditor';
import { ProfileFeed } from '@/components/profile/ProfileFeed';
import { ProfileQuotes } from '@/components/profile/ProfileQuotes';
import { PROFILE_FIELDS, formatFieldValue, type HideableField } from '@/constants/profileFields';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { AppApiError } from '@/services/appApi';
import { getProfile, type Profile } from '@/services/profiles';
import { useAuthStore } from '@/store/authStore';
import { avatarUrl } from '@/utils/avatar';
import { formatRelativeTime } from '@/utils/relativeTime';
import profileStyles from '@/components/profile/Profile.module.css';
import styles from './ProfilePage.module.css';

function ProfileCard({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  useMinuteTick();
  const hidden = new Set<HideableField>(profile.hiddenFields ?? []);
  const hiddenTag = (field: HideableField) =>
    profile.isSelf && hidden.has(field) ? <span className={profileStyles.hiddenTag} title="Bare du ser dette">skjult</span> : null;
  const details = PROFILE_FIELDS.filter((def) => profile.fields[def.key]);

  return (
    <section className={profileStyles.card}>
      <div className={styles.identity}>
        <Avatar src={avatarUrl(profile.uid, profile.avatarUpdatedAt)} name={profile.name} size="xl" className={styles.avatar} />
        <div className={styles.names}>
          <h1 className={styles.name}>
            {profile.name}
            {profile.isAdmin && <span className={profileStyles.badge}>Admin</span>}
          </h1>
          {profile.fullName && profile.fullName !== profile.name && (
            <p className={styles.fullName}>{profile.fullName} {hiddenTag('fullName')}</p>
          )}
          {profile.lastSeenAt && (
            <p className={profileStyles.hint}>Sist aktiv {formatRelativeTime(profile.lastSeenAt)} {hiddenTag('lastSeen')}</p>
          )}
        </div>
      </div>

      {profile.bio
        ? <p className={styles.bio}>{profile.bio}</p>
        : profile.isSelf && <p className={profileStyles.empty}>Du har ingen bio ennå. Den vises når noen holder over navnet ditt.</p>}

      {(details.length > 0 || profile.email) && (
        <dl className={styles.details}>
          {profile.email && (
            <div className={styles.detail}>
              <dt>E-post {hiddenTag('email')}</dt>
              <dd><a href={`mailto:${profile.email}`}>{profile.email}</a></dd>
            </div>
          )}
          {details.map((def) => {
            const value = profile.fields[def.key] ?? '';
            return (
              <div key={def.key} className={styles.detail}>
                <dt>{def.label} {hiddenTag(def.key)}</dt>
                <dd>{def.key === 'phone' ? <a href={`tel:${value.replace(/\s+/g, '')}`}>{value}</a> : formatFieldValue(def, value)}</dd>
              </div>
            );
          })}
        </dl>
      )}

      {profile.isSelf && details.length === 0 && (
        <p className={profileStyles.empty}>Fyll ut detaljene dine – Ølbørs bruker dem også.</p>
      )}
      {profile.isSelf && (
        <div className={profileStyles.actions}>
          <button type="button" className={profileStyles.primary} onClick={onEdit}>Rediger profil</button>
        </div>
      )}
    </section>
  );
}

/** /profil/:uid — anyone's profile; /profil — your own. */
export function ProfilePage() {
  const { uid: uidParam } = useParams();
  const me = useAuthStore((s) => s.user);
  const uid = uidParam ? Number(uidParam) : me?.uid;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!uid || !Number.isInteger(uid)) return;
    let cancelled = false;
    setProfile(null);
    setError('');
    setEditing(false);
    getProfile(uid)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof AppApiError && err.status === 404 ? 'Fant ikke personen.' : 'Kunne ikke hente profilen.');
      });
    return () => { cancelled = true; };
  }, [uid]);

  if (!uidParam && me) return <Navigate to={`/profil/${me.uid}`} replace />;

  return (
    <AppLayout>
      <div className={styles.page}>
        {error && <p className={profileStyles.empty}>{error}</p>}
        {!error && !profile && <p className={profileStyles.empty}>Henter profilen…</p>}
        {profile && (
          <div className={styles.grid}>
            <div className={styles.side}>
              {editing
                ? <ProfileEditor profile={profile} onSaved={(saved) => { setProfile(saved); setEditing(false); }} onCancel={() => setEditing(false)} />
                : <ProfileCard profile={profile} onEdit={() => setEditing(true)} />}
              <ProfileQuotes uid={profile.uid} />
            </div>
            <div className={styles.main}>
              <ProfileFeed uid={profile.uid} name={profile.name} />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
