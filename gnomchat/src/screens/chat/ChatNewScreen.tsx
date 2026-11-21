import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { call } from '@/matrix/engine';
import { Button, Chip, ErrorBox, Field, Screen, T, ToggleRow } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatNew'>;
type Choice = 'dm' | 'room' | 'space' | 'join';

const CHOICES: Array<{ id: Choice; label: string; hint: string }> = [
  { id: 'dm', label: 'Direktemelding', hint: 'En privat, kryptert samtale med én person. Finnes den fra før, åpnes den.' },
  { id: 'room', label: 'Nytt rom', hint: 'En samtale for flere. Rommet er privat; inviter folk etterpå.' },
  { id: 'space', label: 'Nytt space', hint: 'Samle rom og samtaler på ett sted.' },
  { id: 'join', label: 'Bli med', hint: 'Bruk en romadresse (#rom:server) eller en rom-ID.' },
];

export function ChatNewScreen({ navigation }: Props) {
  const [choice, setChoice] = useState<Choice>('dm');
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [encrypted, setEncrypted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    try {
      let roomId: string;
      if (choice === 'dm') roomId = (await call('createDirect', { userId: target.trim() })).roomId;
      else if (choice === 'join') {
        if (!/^[!#][^:\s]+:[^\s]+$/.test(target.trim())) throw new Error('Oppgi en romadresse, for eksempel #gjengen:server.no.');
        roomId = (await call('join', { target: target.trim() })).roomId;
      } else roomId = (await call('createRoom', { name, topic, encrypted, space: choice === 'space' })).roomId;
      navigation.replace(choice === 'space' ? 'ChatSpace' : 'ChatRoom', { roomId, title: choice === 'dm' ? undefined : name || undefined });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Det gikk ikke.'); }
    finally { setBusy(false); }
  };

  const hint = CHOICES.find((option) => option.id === choice)?.hint;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CHOICES.map((option) => <Chip key={option.id} label={option.label} selected={choice === option.id} onPress={() => { setChoice(option.id); setError(''); }} />)}
      </View>
      <T muted size={13}>{hint}</T>
      {choice === 'dm' || choice === 'join' ? (
        <Field label={choice === 'dm' ? 'Matrix-ID' : 'Romadresse'} value={target} onChangeText={setTarget} placeholder={choice === 'dm' ? '@gnomen:gnomchat.gnomguttan.no' : '#gjengen:gnomchat.gnomguttan.no'} autoCapitalize="none" autoCorrect={false} autoFocus />
      ) : (
        <>
          <Field label="Navn" value={name} onChangeText={setName} maxLength={200} autoFocus />
          <Field label="Beskrivelse" value={topic} onChangeText={setTopic} multiline maxLength={2000} />
          {choice === 'room' ? <ToggleRow title="Ende-til-ende-kryptering" subtitle="Kan ikke slås av etter at rommet er opprettet." value={encrypted} onChange={setEncrypted} /> : null}
        </>
      )}
      <ErrorBox message={error} />
      <Button title={choice === 'dm' ? 'Start direktemelding' : choice === 'join' ? 'Bli med' : choice === 'space' ? 'Opprett space' : 'Opprett rom'} busy={busy} disabled={choice === 'dm' || choice === 'join' ? !target.trim() : !name.trim()} onPress={() => void submit()} />
    </Screen>
  );
}
