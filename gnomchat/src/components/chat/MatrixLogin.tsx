import { useState } from 'react';
import { View } from 'react-native';
import * as Device from 'expo-device';
import { config } from '@/config';
import { matrixLogin } from '@/matrix/engine';
import { useMatrixStore } from '@/matrix/store';
import { Button, Card, ErrorBox, Field, Loading, Screen, T } from '@/components/ui';

/** Matrix has its own account (like Chat2.0 on the website); sign in once per phone. */
export function MatrixLogin() {
  const engineReady = useMatrixStore((s) => s.engineReady);
  const engineError = useMatrixStore((s) => s.engineError);
  const [server, setServer] = useState(config.matrixHomeserverUrl);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);

  const submit = async () => {
    setBusy(true); setError('');
    try { await matrixLogin(server, user, password, `GnomChat · ${Device.modelName ?? 'mobil'}`); setPassword(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Innloggingen feilet.'); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <Card style={{ gap: 12, padding: 18 }}>
        <T weight={800} size={22}>Chatten</T>
        <T muted>Logg inn med Matrix-kontoen din (samme som Chat2.0 på nettsiden). Meldingene er ende-til-ende-kryptert, og nøklene lagres bare på denne telefonen.</T>
        {!engineReady && !engineError ? <Loading label="Starter chatten …" /> : null}
        <ErrorBox message={engineError && !engineReady ? engineError : ''} />
        <Field label="Brukernavn" value={user} onChangeText={setUser} placeholder="@deg:gnomchat.gnomguttan.no" autoCapitalize="none" autoCorrect={false} editable={!busy} />
        <Field label="Passord" value={password} onChangeText={setPassword} secureTextEntry editable={!busy} onSubmitEditing={() => void submit()} />
        {advanced ? <Field label="Matrix-server" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} /> : null}
        <ErrorBox message={error} />
        <Button title="Logg inn i chatten" busy={busy} disabled={!engineReady || !user.trim() || !password} onPress={() => void submit()} />
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="ghost" small title={advanced ? 'Skjul server' : 'Annen server?'} onPress={() => setAdvanced(!advanced)} />
        </View>
      </Card>
    </Screen>
  );
}
