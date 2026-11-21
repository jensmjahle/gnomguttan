import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/data/queryClient';
import { changePassword, listSessions, revokeOtherSessions, revokeSession } from '@/services/auth';
import { errorText } from '@/services/appApi';
import { formatRelativeTime } from '@/utils/relativeTime.generated';
import { Button, Divider, ErrorBox, Field, IconButton, Loading, Row, Screen, Section, T } from '@/components/ui';

function deviceLabel(userAgent: string) {
  if (/GnomChat/i.test(userAgent)) return `GnomChat-appen ${userAgent.match(/\(([^)]+)\)/)?.[1] ?? ''}`.trim();
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Nettleser';
  const os = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Windows/.test(userAgent) ? 'Windows' : /Mac OS/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : '';
  return `${browser}${os ? ` på ${os}` : ''}`;
}

export function AccountScreen() {
  const sessions = useQuery({ queryKey: qk.sessions, queryFn: listSessions });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setError(''); setNotice('');
    try { const message = await fn(); if (message) setNotice(message); void sessions.refetch(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };

  return (
    <Screen refreshing={sessions.isRefetching} onRefresh={() => void sessions.refetch()}>
      {notice ? <T style={{ textAlign: 'center' }}>{notice}</T> : null}
      <ErrorBox message={error} />
      <Section title="Bytt passord">
        <View style={{ padding: 14, gap: 10 }}>
          <Field label="Nåværende passord" value={current} onChangeText={setCurrent} secureTextEntry textContentType="password" />
          <Field label="Nytt passord" value={next} onChangeText={setNext} secureTextEntry textContentType="newPassword" hint="Minst 8 tegn. Andre innlogginger logges ut." />
          <Button title="Bytt passord" busy={busy} disabled={!current || next.length < 8} onPress={() => void run(async () => {
            const result = await changePassword(current, next);
            setCurrent(''); setNext('');
            return `Passordet er byttet.${result.signedOut ? ` ${result.signedOut} andre innlogginger ble logget ut.` : ''}`;
          })} />
        </View>
      </Section>
      <Section title="Aktive innlogginger" action={<Button small variant="ghost" title="Logg ut alle andre" onPress={() => Alert.alert('Logge ut alle andre?', 'Alle andre nettlesere og telefoner må logge inn igjen.', [{ text: 'Avbryt', style: 'cancel' }, { text: 'Logg ut', style: 'destructive', onPress: () => void run(async () => `${(await revokeOtherSessions()).signedOut} innlogginger ble logget ut.`) }])} />}>
        {sessions.isLoading ? <Loading /> : (sessions.data ?? []).map((session, index) => (
          <View key={session.id}>
            {index ? <Divider /> : null}
            <Row
              icon={/GnomChat|Android|iPhone/.test(session.userAgent) ? 'phone-portrait-outline' : 'desktop-outline'}
              title={`${deviceLabel(session.userAgent)}${session.current ? ' (denne)' : ''}`}
              subtitle={`Sist brukt ${formatRelativeTime(session.lastUsedAt)} · ${session.ip}`}
              chevron={false}
              right={session.current ? undefined : <IconButton icon="close-circle-outline" label="Logg ut denne" onPress={() => void run(async () => { await revokeSession(session.id); return 'Innloggingen er avsluttet.'; })} />}
            />
          </View>
        ))}
      </Section>
    </Screen>
  );
}
