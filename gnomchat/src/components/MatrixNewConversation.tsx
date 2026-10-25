import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { matrixCall } from '@/services/matrix';
import { MatrixAvatar } from './MatrixAvatar';
import { MatrixSheet, MatrixField, MatrixButton, MatrixToggle, MatrixNotice } from './MatrixForms';
type Choice = 'dm' | 'room' | 'space' | 'join' | 'directory';
export function MatrixNewConversation({ visible, onClose, onOpen }: { visible: boolean; onClose: () => void; onOpen: (id: string, title: string, space?: boolean) => void }) {
  const { tokens, font } = useTheme();
  const [choice, setChoice] = useState<Choice | null>(null); const [target, setTarget] = useState('');
  const [name, setName] = useState(''); const [topic, setTopic] = useState(''); const [alias, setAlias] = useState('');
  const [encrypted, setEncrypted] = useState(true); const [publicRoom, setPublicRoom] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [results, setResults] = useState<any[]>([]); const [next, setNext] = useState<string>(); const request = useRef(0);
  useEffect(() => { if (visible) { setChoice(null); setTarget(''); setName(''); setTopic(''); setAlias(''); setResults([]); setError(''); setNext(undefined); } return () => { request.current++; }; }, [visible]);
  async function run(operation: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke åpne samtalen.'); } finally { setBusy(false); } }
  async function search(more = false) { const current = ++request.current; await run(async () => {
    if (choice === 'directory') { const result = await matrixCall<any>('directory', { query: target.trim(), since: more ? next : undefined }); if (request.current !== current) return; setResults(old => more ? [...old, ...result.chunk.filter((item: any) => !old.some(room => room.room_id === item.room_id))] : result.chunk); setNext(result.next_batch); }
    else { const result = await matrixCall<any>('searchUsers', { term: target.trim() }); if (request.current === current) setResults(result.results); }
  }); }
  async function openTarget(value = target) { await run(async () => {
    if (choice === 'dm' && !/^@[^:\s]+:[^\s]+$/.test(value.trim())) throw new Error('Oppgi en full Matrix-ID, for eksempel @gnomen:server.no.');
    if (choice === 'join' && !/^[!#][^:\s]+:[^\s]+$/.test(value.trim())) throw new Error('Oppgi romadressen eller rom-ID-en.');
    const id = await matrixCall<string>('conversation', { target: value.trim(), encrypted: true }); onClose(); onOpen(id, value);
  }); }
  const choices: [Choice, string, string][] = [['dm', 'Ny direktemelding', 'Finn en person eller skriv Matrix-ID'], ['room', 'Opprett rom / kanal', 'Samle gjengen i en ny samtale'], ['space', 'Opprett space', 'Organiser flere rom sammen'], ['join', 'Bli med i et rom', 'Bruk romadresse eller invitasjon'], ['directory', 'Utforsk rom', 'Se serverens offentlige romliste']];
  return <MatrixSheet title={choice ? choices.find(item => item[0] === choice)![1] : 'Ny samtale'} visible={visible} onClose={() => { if (!busy) onClose(); }}>
    {!choice ? choices.map(([id, title, detail]) => <Pressable key={id} onPress={() => { setChoice(id); setResults([]); setError(''); }} style={{ padding: 16, borderWidth: 1, borderColor: tokens.border, borderRadius: 16, backgroundColor: tokens.bgCard, gap: 5 }}><Text style={{ color: tokens.textPrimary, fontFamily: font(600) }}>{title}</Text><MatrixNotice text={detail} /></Pressable>) : <>
      <MatrixButton title="Tilbake til valg" secondary disabled={busy} onPress={() => { request.current++; setChoice(null); setResults([]); setError(''); }} />
      {['dm', 'join', 'directory'].includes(choice) ? <>
        <MatrixField label={choice === 'dm' ? 'Navn eller Matrix-ID' : choice === 'join' ? 'Romadresse' : 'Søk i offentlige rom'} value={target} onChangeText={setTarget} autoCapitalize="none" autoCorrect={false} editable={!busy} />
        {choice !== 'join' && <MatrixButton title={busy ? 'Søker …' : 'Søk'} secondary disabled={busy || (choice === 'dm' && !target.trim())} onPress={() => void search()} />}
        {results.map(item => <Pressable key={item.room_id || item.user_id} disabled={busy} onPress={() => void openTarget(item.room_id || item.user_id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, backgroundColor: tokens.bgCard, borderRadius: 12 }}><MatrixAvatar name={item.name || item.display_name || item.user_id || item.room_id} mxc={item.avatar_url} /><View style={{ flex: 1 }}><Text style={{ color: tokens.textPrimary, fontFamily: font(600) }}>{item.name || item.display_name || item.user_id}</Text><MatrixNotice text={item.topic || item.user_id || `${item.num_joined_members || 0} medlemmer`} /></View></Pressable>)}
        {next && choice === 'directory' && <MatrixButton title="Vis flere rom" secondary disabled={busy} onPress={() => void search(true)} />}
        {choice !== 'directory' && <MatrixButton title={busy ? 'Åpner …' : choice === 'dm' ? 'Start samtale' : 'Bli med i rommet'} disabled={busy || !target.trim()} onPress={() => void openTarget()} />}
        {choice === 'directory' && <MatrixNotice text="Hvis serveren ikke tilbyr en offentlig romliste, bruk «Bli med i et rom» med full romadresse." />}
      </> : <>
        <MatrixField label="Navn" value={name} onChangeText={setName} maxLength={200} editable={!busy} /><MatrixField label="Beskrivelse" value={topic} onChangeText={setTopic} multiline maxLength={2000} editable={!busy} />
        <MatrixToggle title="Offentlig rom" value={publicRoom} onChange={setPublicRoom} disabled={busy} />
        {publicRoom && <MatrixField label="Romadresse (uten # og servernavn)" value={alias} onChangeText={setAlias} autoCapitalize="none" editable={!busy} />}
        {choice === 'room' && <><MatrixToggle title="Ende-til-ende-kryptering" value={encrypted} onChange={setEncrypted} disabled={busy} /><MatrixNotice text="Kryptering kan ikke slås av etter aktivering." /></>}
        <MatrixButton title={busy ? 'Oppretter …' : choice === 'space' ? 'Opprett space' : 'Opprett rom'} disabled={busy || !name.trim()} onPress={() => void run(async () => { const id = await matrixCall<string>('createRoom', { name, topic, alias, publicRoom, encrypted, space: choice === 'space' }); onClose(); onOpen(id, name, choice === 'space'); })} />
      </>}
    </>}
    <MatrixNotice text={error} error />
  </MatrixSheet>;
}
