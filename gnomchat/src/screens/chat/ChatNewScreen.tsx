import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { call } from '@/matrix/engine';
import { useTheme } from '@/theme/useTheme';
import { MatrixAvatar } from '@/components/chat/MatrixAvatar';
import { Button, Chip, ErrorBox, Field, Screen, T, ToggleRow } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import type { UserResult } from '@/matrix/protocol.generated';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatNew'>;
type Choice = 'people' | 'room' | 'space' | 'join';

const CHOICES: Array<{ id: Choice; label: string; hint: string }> = [
  { id: 'people', label: 'Personer', hint: 'Velg én person for en direktemelding, eller flere for en gruppechat. Alt er kryptert.' },
  { id: 'room', label: 'Nytt rom', hint: 'Et navngitt rom. Rommet er privat; inviter folk etterpå.' },
  { id: 'space', label: 'Nytt space', hint: 'Samle rom og samtaler på ett sted.' },
  { id: 'join', label: 'Bli med', hint: 'Bruk en romadresse (#rom:server) eller en rom-ID.' },
];

function PersonRow({ user, selected, onPress }: { user: UserResult; selected: boolean; onPress: () => void }) {
  const { tokens } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.person, pressed && { backgroundColor: tokens.bgHover }]}>
      <MatrixAvatar name={user.name} avatar={user.avatar} size={40} />
      <View style={{ flex: 1 }}>
        <T weight={600} numberOfLines={1}>{user.name}</T>
        <T size={12} muted numberOfLines={1}>{user.userId}</T>
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? tokens.accent : tokens.textMuted} />
    </Pressable>
  );
}

export function ChatNewScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const [choice, setChoice] = useState<Choice>('people');
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [encrypted, setEncrypted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserResult[]>([]);

  // Search as you type (debounced); an empty query lists people from rooms you share.
  useEffect(() => {
    if (choice !== 'people') return;
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      call('searchUsers', { term: query, limit: 40 })
        .then((users) => { if (alive) setResults(users); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, query.trim() ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, choice]);

  const toggle = (user: UserResult) => setSelected((current) => (current.some((item) => item.userId === user.userId) ? current.filter((item) => item.userId !== user.userId) : [...current, user]));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (choice === 'people') {
        if (selected.length === 1) {
          const roomId = (await call('createDirect', { userId: selected[0].userId })).roomId;
          navigation.replace('ChatRoom', { roomId, title: selected[0].name });
        } else {
          const roomId = (await call('createRoom', { name, encrypted: true, space: false, invite: selected.map((user) => user.userId) })).roomId;
          navigation.replace('ChatRoom', { roomId, title: name.trim() || selected.map((user) => user.name.split(' ')[0]).join(', ') });
        }
        return;
      }
      let roomId: string;
      if (choice === 'join') {
        if (!/^[!#][^:\s]+:[^\s]+$/.test(target.trim())) throw new Error('Oppgi en romadresse, for eksempel #gjengen:server.no.');
        roomId = (await call('join', { target: target.trim() })).roomId;
      } else roomId = (await call('createRoom', { name, topic, encrypted, space: choice === 'space' })).roomId;
      navigation.replace(choice === 'space' ? 'ChatSpace' : 'ChatRoom', { roomId, title: name || undefined });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Det gikk ikke.'); }
    finally { setBusy(false); }
  };

  const hint = CHOICES.find((option) => option.id === choice)?.hint;
  const shown = [...selected.filter((user) => !results.some((item) => item.userId === user.userId)), ...results];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CHOICES.map((option) => <Chip key={option.id} label={option.label} selected={choice === option.id} onPress={() => { setChoice(option.id); setError(''); }} />)}
      </View>
      <T muted size={13}>{hint}</T>

      {choice === 'people' ? (
        <>
          <Field value={query} onChangeText={setQuery} placeholder="Søk etter navn eller brukernavn" autoCapitalize="none" autoCorrect={false} autoFocus />
          {selected.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
              {selected.map((user) => (
                <Pressable key={user.userId} onPress={() => toggle(user)} style={styles.selected} accessibilityLabel={`Fjern ${user.name}`}>
                  <View>
                    <MatrixAvatar name={user.name} avatar={user.avatar} size={48} />
                    <View style={[styles.remove, { backgroundColor: tokens.textMuted, borderColor: tokens.bgPrimary }]}><Ionicons name="close" size={12} color="#fff" /></View>
                  </View>
                  <T size={11} numberOfLines={1} style={{ maxWidth: 60, textAlign: 'center' }}>{user.name.split(' ')[0]}</T>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {selected.length > 1 ? <Field label="Navn på gruppen (valgfritt)" value={name} onChangeText={setName} maxLength={200} placeholder={selected.map((user) => user.name.split(' ')[0]).join(', ')} /> : null}
          <ErrorBox message={error} />
          {selected.length ? (
            <Button title={selected.length === 1 ? `Chat med ${selected[0].name}` : `Opprett gruppechat (${selected.length + 1} personer)`} busy={busy} onPress={() => void submit()} />
          ) : null}
          <View>
            {!query.trim() && results.length ? <T size={12} weight={700} muted style={{ marginBottom: 4 }}>Folk du kjenner</T> : null}
            {shown.map((user) => <PersonRow key={user.userId} user={user} selected={selected.some((item) => item.userId === user.userId)} onPress={() => toggle(user)} />)}
            {searching && !shown.length ? <ActivityIndicator color={tokens.accent} style={{ margin: 16 }} /> : null}
            {!searching && !shown.length ? <T muted size={13} style={{ textAlign: 'center', margin: 16 }}>{query.trim() ? 'Fant ingen med det navnet. Prøv det nøyaktige brukernavnet.' : 'Søk etter noen for å starte en chat.'}</T> : null}
          </View>
        </>
      ) : (
        <>
          {choice === 'join' ? (
            <Field label="Romadresse" value={target} onChangeText={setTarget} placeholder="#gjengen:gnomchat.gnomguttan.no" autoCapitalize="none" autoCorrect={false} autoFocus />
          ) : (
            <>
              <Field label="Navn" value={name} onChangeText={setName} maxLength={200} autoFocus />
              <Field label="Beskrivelse" value={topic} onChangeText={setTopic} multiline maxLength={2000} />
              {choice === 'room' ? <ToggleRow title="Ende-til-ende-kryptering" subtitle="Kan ikke slås av etter at rommet er opprettet." value={encrypted} onChange={setEncrypted} /> : null}
            </>
          )}
          <ErrorBox message={error} />
          <Button title={choice === 'join' ? 'Bli med' : choice === 'space' ? 'Opprett space' : 'Opprett rom'} busy={busy} disabled={choice === 'join' ? !target.trim() : !name.trim()} onPress={() => void submit()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10 },
  selected: { alignItems: 'center', gap: 4 },
  remove: { position: 'absolute', right: -2, top: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
