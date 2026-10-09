import { useState, type FormEvent } from 'react';
import { EventType, Preset, Visibility, type MatrixClient } from 'matrix-js-sdk';
import { MatrixIcon, MatrixModal } from './MatrixUi';
import styles from '@/pages/Chat2Page.module.css';

type Choice = 'join' | 'room' | 'dm' | 'space';
const choices: { id: Choice; title: string; detail: string }[] = [
  { id: 'room', title: 'Nytt rom', detail: 'Opprett en samtale for flere personer.' },
  { id: 'dm', title: 'Direktemelding', detail: 'Start en privat samtale med en Matrix-bruker.' },
  { id: 'space', title: 'Nytt space', detail: 'Samle rom og samtaler på ett sted.' },
  { id: 'join', title: 'Bli med i rom eller space', detail: 'Bruk en romadresse eller en invitasjon.' },
];
export function MatrixAddConversation({ client, onClose, onOpen }: { client: MatrixClient; onClose: () => void; onOpen: (roomId: string) => void }) {
  const [choice, setChoice] = useState<Choice | null>(null); const [name, setName] = useState('');
  const [topic, setTopic] = useState(''); const [target, setTarget] = useState('');
  const [encrypted, setEncrypted] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [pendingDm, setPendingDm] = useState<{ roomId: string; userId: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      let roomId: string;
      if (choice === 'join') {
        if (!/^[!#][^:\s]+:[^\s]+$/.test(target.trim())) throw new Error('Oppgi en Matrix-romadresse, for eksempel #gjengen:server.no, eller en rom-ID.');
        roomId = (await client.joinRoom(target.trim())).roomId;
      } else if (choice === 'dm') {
        const userId = pendingDm?.userId || target.trim();
        if (!/^@[^:\s]+:[^\s]+$/.test(userId) || userId === client.getUserId()) throw new Error('Oppgi Matrix-ID-en til personen du vil chatte med, for eksempel @gnomen:server.no.');
        const direct = await client.getAccountDataFromServer(EventType.Direct) || {};
        const existing = (direct[userId] || []).find(id => client.getRoom(id)?.getMyMembership() === 'join');
        roomId = pendingDm?.roomId || existing || (await client.createRoom({ preset: Preset.PrivateChat, visibility: Visibility.Private, is_direct: true, invite: [userId], initial_state: [{ type: EventType.RoomEncryption, state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] })).room_id;
        setPendingDm({ roomId, userId });
        await client.setAccountDataRaw(EventType.Direct, { ...direct, [userId]: [...new Set([...(direct[userId] || []), roomId])] });
      } else {
        if (!name.trim()) throw new Error('Gi rommet eller spacet et navn.');
        roomId = (await client.createRoom({ name: name.trim(), topic: topic.trim() || undefined, preset: Preset.PrivateChat, visibility: Visibility.Private,
          ...(choice === 'space' ? { creation_content: { type: 'm.space' } } : encrypted ? { initial_state: [{ type: EventType.RoomEncryption, state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] } : {}),
        })).room_id;
      }
      onOpen(roomId); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke legge til samtalen.'); }
    finally { setBusy(false); }
  }
  return <MatrixModal title="Legg til samtale" onClose={() => { if (!busy) onClose(); }}>
    {!choice ? <div className={styles.addChoices}>{choices.map(item => <button key={item.id} type="button" onClick={() => { setChoice(item.id); setError(''); }}><MatrixIcon name={item.id === 'dm' ? 'chat' : 'plus'}/><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</div> : <form className={styles.settingsForm} onSubmit={submit}>
      <button type="button" className={styles.textButton} disabled={busy || Boolean(pendingDm)} onClick={() => { setChoice(null); setError(''); }}><MatrixIcon name="back" size={15}/> Alle valg</button>
      <h3>{choices.find(item => item.id === choice)?.title}</h3>
      {choice === 'join' || choice === 'dm' ? <label>{choice === 'dm' ? 'Matrix-ID' : 'Romadresse'}<input autoFocus required disabled={busy || Boolean(pendingDm)} placeholder={choice === 'dm' ? '@gnomen:server.no' : '#gjengen:server.no'} value={target} onChange={event => setTarget(event.target.value)}/></label> : <><label>Navn<input autoFocus required maxLength={200} disabled={busy} value={name} onChange={event => setName(event.target.value)}/></label><label>Beskrivelse<textarea aria-label="Beskrivelse" rows={3} maxLength={2000} disabled={busy} value={topic} onChange={event => setTopic(event.target.value)}/></label>{choice === 'room' && <label className={styles.settingRow}><span><strong>Ende-til-ende-kryptering</strong><small>Kan ikke slås av etter at rommet er opprettet.</small></span><input type="checkbox" checked={encrypted} disabled={busy} onChange={event => setEncrypted(event.target.checked)}/></label>}</>}
      <small>{choice === 'dm' ? 'Nye direktemeldinger er ende-til-ende-kryptert. En eksisterende samtale åpnes hvis dere allerede har en.' : choice === 'space' ? 'Et privat space organiserer rom. Du kan legge til rom etter opprettelsen.' : choice === 'room' ? 'Rommet er privat. Inviter personer fra rominnstillingene.' : 'Du kan bli med dersom rommet er åpent, eller du er invitert.'}</small>
      {pendingDm && error && <p>Rommet er opprettet. Prøv igjen for å lagre det som direktemelding.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} disabled={busy}>{busy ? 'Jobber …' : pendingDm ? 'Åpne direktemelding' : choice === 'dm' ? 'Start direktemelding' : choice === 'join' ? 'Bli med' : choice === 'space' ? 'Opprett space' : 'Opprett rom'}</button>
    </form>}
  </MatrixModal>;
}
