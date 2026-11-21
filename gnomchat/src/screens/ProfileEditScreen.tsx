import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { qk, queryClient } from '@/data/queryClient';
import { useAuthStore } from '@/store/authStore';
import { changeEmail, getProfile, removeAvatar, saveProfile, uploadAvatar } from '@/services/profiles';
import { errorText } from '@/services/appApi';
import { pickImage } from '@/utils/images';
import { BIO_MAX, FULL_NAME_MAX, NAME_MAX, PROFILE_FIELDS, type HideableField, type ProfileFieldKey } from '@/utils/profileFields.generated';
import { Avatar } from '@/components/Avatar';
import { Button, Chip, ErrorBox, Field, Loading, Screen, Section, T, ToggleRow } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileEdit'>;

export function ProfileEditScreen({ navigation }: Props) {
  const me = useAuthStore((s) => s.user);
  const uid = me?.uid ?? 0;
  const { data: profile } = useQuery({ queryKey: qk.profile(uid), queryFn: () => getProfile(uid), enabled: uid > 0 });
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [fields, setFields] = useState<Partial<Record<ProfileFieldKey, string>>>({});
  const [hidden, setHidden] = useState<HideableField[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!profile) return;
    setName(profile.name); setFullName(profile.fullName ?? ''); setBio(profile.bio ?? '');
    setFields(profile.fields ?? {}); setHidden(profile.hiddenFields ?? []); setEmail(profile.email ?? me?.email ?? '');
  }, [profile, me?.email]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); setNotice(done); void queryClient.invalidateQueries({ queryKey: qk.profile(uid) }); }
    catch (reason) { setError(errorText(reason, 'Kunne ikke lagre.')); }
    finally { setBusy(false); }
  };

  if (!profile) return <Screen><Loading /></Screen>;
  const toggleHidden = (key: HideableField) => setHidden((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar uid={uid} name={name} avatarUpdatedAt={me?.avatarUpdatedAt} size={96} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small variant="secondary" icon="image-outline" title="Nytt bilde" disabled={busy} onPress={() => void pickImage({ maxSize: 512, quality: 0.86 }).then((image) => image && run(() => uploadAvatar(image.dataUrl), 'Profilbildet er oppdatert.')).catch((e) => setError(errorText(e)))} />
          {profile.hasAvatar ? <Button small variant="ghost" title="Fjern" disabled={busy} onPress={() => void run(removeAvatar, 'Profilbildet er fjernet.')} /> : null}
        </View>
      </View>
      {notice ? <T style={{ textAlign: 'center' }}>{notice}</T> : null}
      <ErrorBox message={error} />

      <Section title="Om deg">
        <View style={{ padding: 14, gap: 10 }}>
          <Field label="Navn" value={name} onChangeText={setName} maxLength={NAME_MAX} hint="Det andre ser i feeden og chatten." />
          <Field label="Fullt navn" value={fullName} onChangeText={setFullName} maxLength={FULL_NAME_MAX} />
          <Field label="Bio" value={bio} onChangeText={setBio} maxLength={BIO_MAX} multiline hint={`${bio.length}/${BIO_MAX}`} />
          {PROFILE_FIELDS.map((def) => (
            def.kind === 'select' ? (
              <View key={def.key} style={{ gap: 6 }}>
                <T size={13} muted weight={600}>{def.label}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {def.options!.map((option) => <Chip key={option.value} label={option.label} selected={fields[def.key] === option.value} onPress={() => setFields((current) => ({ ...current, [def.key]: current[def.key] === option.value ? '' : option.value }))} />)}
                </View>
              </View>
            ) : (
              <Field key={def.key} label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`} value={fields[def.key] ?? ''} keyboardType={def.kind === 'number' ? 'decimal-pad' : def.kind === 'tel' ? 'phone-pad' : 'default'} maxLength={def.maxLength ?? 10} onChangeText={(value) => setFields((current) => ({ ...current, [def.key]: value }))} />
            )
          ))}
          <Button title="Lagre profil" busy={busy} disabled={name.trim().length < 2} onPress={() => void run(() => saveProfile({ name: name.trim(), fullName: fullName.trim(), bio: bio.trim(), fields, hiddenFields: hidden }), 'Profilen er lagret.')} />
        </View>
      </Section>

      <Section title="Hvem ser hva">
        {([['fullName', 'Fullt navn'], ['email', 'E-post'], ['lastSeen', 'Sist sett'], ...PROFILE_FIELDS.map((def) => [def.key, def.label])] as Array<[HideableField, string]>).map(([key, label]) => (
          <ToggleRow key={key} title={label} subtitle={hidden.includes(key) ? 'Skjult for andre' : 'Synlig for gjengen'} value={!hidden.includes(key)} onChange={() => toggleHidden(key)} />
        ))}
        <View style={{ padding: 14 }}><Button variant="secondary" title="Lagre synlighet" busy={busy} onPress={() => void run(() => saveProfile({ hiddenFields: hidden }), 'Synligheten er lagret.')} /></View>
      </Section>

      <Section title="E-post">
        <View style={{ padding: 14, gap: 10 }}>
          <Field label="E-postadresse" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Passord" value={password} onChangeText={setPassword} secureTextEntry hint="Bekreft med passordet ditt." />
          <Button variant="secondary" title="Bytt e-post" busy={busy} disabled={!email.trim() || !password || email.trim() === profile.email} onPress={() => void run(async () => { await changeEmail(email.trim(), password); setPassword(''); }, 'E-posten er endret.')} />
        </View>
      </Section>
      <Button variant="ghost" title="Ferdig" onPress={() => navigation.goBack()} />
    </Screen>
  );
}
