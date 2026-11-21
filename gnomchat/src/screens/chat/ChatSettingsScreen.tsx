import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { call, matrixLogout } from '@/matrix/engine';
import { removeMatrixPusher } from '@/matrix/push';
import { useMatrixStore } from '@/matrix/store';
import { clearMatrixMedia } from '@/matrix/media';
import { MatrixAvatar } from '@/components/chat/MatrixAvatar';
import { Button, Divider, ErrorBox, Field, Row, Screen, Section, T } from '@/components/ui';
import { pickImage } from '@/utils/images';
import { pushStatus } from '@/services/notifications';
import type { RootStackParamList } from '@/navigation/types';
import type { MediaRef } from '@/matrix/protocol.generated';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatSettings'>;

function Verification() {
  const verification = useMatrixStore((s) => s.verification);
  const cryptoReady = useMatrixStore((s) => s.cryptoReady);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = (cmd: 'verifyStart' | 'verifyAccept' | 'verifySas' | 'verifyConfirm' | 'verifyMismatch' | 'verifyCancel') => {
    setBusy(true); setError('');
    void call(cmd, {}).catch((reason) => setError(reason instanceof Error ? reason.message : 'Verifiseringen feilet.')).finally(() => setBusy(false));
  };
  const pending = ['requested', 'ready', 'started'].includes(verification.phase);
  return (
    <View style={{ padding: 14, gap: 10 }}>
      <T size={13} muted>Verifiser denne telefonen med en annen innlogget Matrix-enhet (for eksempel Chat2.0 på nettsiden), så kan den lese eldre krypterte meldinger og andre stoler på den.</T>
      {!pending ? <Button title="Verifiser med en annen enhet" icon="shield-checkmark-outline" busy={busy} disabled={!cryptoReady} onPress={() => act('verifyStart')} /> : null}
      {pending ? <T>Godta forespørselen på den andre enheten. {verification.otherDeviceId ? `Enhet: ${verification.otherDeviceId}` : 'Venter på svar …'}</T> : null}
      {verification.phase === 'requested' && !verification.initiatedByMe ? <Button title="Godta forespørsel" busy={busy} onPress={() => act('verifyAccept')} /> : null}
      {verification.phase === 'ready' ? <Button title="Sammenlign emojier" busy={busy} onPress={() => act('verifySas')} /> : null}
      {verification.sas ? (
        <>
          <T>Sammenlign emojiene på begge enhetene før du bekrefter.</T>
          <View style={styles.sas}>
            {verification.sas.emoji?.map(([emoji, name], index) => (
              <View key={index} style={styles.sasItem}><T size={30}>{emoji}</T><T size={10} muted>{name}</T></View>
            ))}
          </View>
          {verification.sas.decimal ? <T style={{ textAlign: 'center' }}>{verification.sas.decimal.join(' · ')}</T> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="De stemmer" busy={busy} onPress={() => act('verifyConfirm')} style={{ flex: 1 }} />
            <Button variant="danger" title="Stemmer ikke" onPress={() => act('verifyMismatch')} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}
      {pending ? <Button variant="ghost" title="Avbryt" onPress={() => act('verifyCancel')} /> : null}
      {verification.phase === 'done' ? <T>✅ Telefonen er verifisert.</T> : null}
      {verification.phase === 'cancelled' ? <T muted>Verifiseringen ble avbrutt eller utløp.</T> : null}
      <ErrorBox message={error || verification.error} />
    </View>
  );
}

export function ChatSettingsScreen({ navigation }: Props) {
  const cryptoReady = useMatrixStore((s) => s.cryptoReady);
  const [profile, setProfile] = useState<{ userId: string; name: string; avatar?: MediaRef; deviceId: string; baseUrl: string } | null>(null);
  const [name, setName] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => call('profile', {}).then((next) => { setProfile(next); setName(next.name); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Kunne ikke hente profilen.'));
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); if (done) setNotice(done); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Det gikk ikke.'); }
    finally { setBusy(false); }
  };

  const logout = () => Alert.alert('Logge ut av chatten?', 'Krypteringsnøklene på denne telefonen slettes. Har du ikke verifisert en annen enhet eller har gjenopprettingsnøkkelen, kan du miste eldre krypterte meldinger.', [
    { text: 'Avbryt', style: 'cancel' },
    { text: 'Logg ut', style: 'destructive', onPress: () => void run(async () => { await removeMatrixPusher(); await matrixLogout(); await clearMatrixMedia(); navigation.goBack(); }) },
  ]);

  const push = pushStatus();
  return (
    <Screen>
      {notice ? <T style={{ textAlign: 'center' }}>{notice}</T> : null}
      <ErrorBox message={error} />
      <Section title="Profil">
        <View style={{ padding: 14, gap: 10, alignItems: 'center' }}>
          {profile ? <MatrixAvatar name={profile.name} avatar={profile.avatar} size={76} /> : null}
          <T size={12} muted>{profile?.userId}</T>
          <Button small variant="ghost" title="Endre bilde" disabled={busy} onPress={() => void pickImage({ maxSize: 600 }).then((image) => image && run(async () => { await call('setAvatar', { base64: image.base64, mimetype: image.mimetype }); await load(); }, 'Profilbildet er oppdatert.'))} />
          <Field label="Visningsnavn" value={name} onChangeText={setName} maxLength={100} style={{ alignSelf: 'stretch' }} />
          <Button title="Lagre navn" busy={busy} disabled={!name.trim() || name.trim() === profile?.name} onPress={() => void run(async () => { await call('setDisplayName', { name }); await load(); }, 'Navnet er lagret.')} style={{ alignSelf: 'stretch' }} />
        </View>
      </Section>
      <Section title="Kryptering og enheter">
        {cryptoReady ? <Verification /> : <T muted style={{ padding: 14 }}>Krypteringen klargjøres …</T>}
        <Divider />
        <View style={{ padding: 14, gap: 10 }}>
          <T weight={700}>Gjenopprett eldre meldinger</T>
          <T size={13} muted>Bruk gjenopprettingsnøkkelen fra Matrix-kontoen din for å lese meldinger fra før du logget inn på telefonen.</T>
          <Field value={recoveryKey} onChangeText={setRecoveryKey} placeholder="EsT… gjenopprettingsnøkkel" secureTextEntry autoCapitalize="none" autoCorrect={false} />
          <Button title="Gjenopprett historikk" busy={busy} disabled={!cryptoReady} onPress={() => void run(async () => { const result = await call('restoreHistory', { recoveryKey }); setRecoveryKey(''); setNotice(`${result.imported} meldingsnøkler gjenopprettet.`); })} />
        </View>
      </Section>
      <Section title="Push for chatten">
        <T size={13} muted style={{ padding: 14 }}>
          {push.state === 'ok' ? 'Nye meldinger varsles på telefonen, også når appen er lukket. Hvilke rom som varsler styres av Matrix (alle meldinger i direktemeldinger og små rom, og når du blir nevnt).' : `Push er ikke aktiv: ${push.detail ?? 'ukjent grunn'}. Se Varsler under Innstillinger.`}
        </T>
      </Section>
      <Section title="Konto">
        <Row icon="server-outline" title="Server" subtitle={profile?.baseUrl} chevron={false} />
        <Divider />
        <Row icon="phone-portrait-outline" title="Enhet" subtitle={profile?.deviceId} chevron={false} />
        <Divider />
        <Row icon="log-out-outline" danger title="Logg ut av chatten" subtitle="Bare Matrix; du er fortsatt logget inn i Gnomguttan." onPress={logout} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  sasItem: { alignItems: 'center', width: 64 },
});
