import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EventType, HistoryVisibility, JoinRule, type MatrixClient, type Room } from 'matrix-js-sdk';
import { MatrixAvatar, MatrixIcon, MatrixModal } from './MatrixUi';
import styles from '@/pages/Chat2Page.module.css';

export function MatrixRoomSettings({ client, room, open, onClose, onLeft }: { client: MatrixClient; room: Room; open: boolean; onClose: () => void; onLeft: () => void }) {
  const [name, setName] = useState(''); const [topic, setTopic] = useState('');
  const [joinRule, setJoinRule] = useState(JoinRule.Invite as string);
  const [history, setHistory] = useState(HistoryVisibility.Shared as string);
  const [invitee, setInvitee] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false); const [confirmLeave, setConfirmLeave] = useState(false); const [, refresh] = useState(0);
  const avatarInput = useRef<HTMLInputElement>(null); const userId = client.getUserId()!;
  const canEdit = (type: EventType) => room.currentState.maySendStateEvent(type, userId);
  const avatar = room.currentState.getStateEvents(EventType.RoomAvatar, '')?.getContent().url;
  const encrypted = Boolean(room.hasEncryptionStateEvent());
  useEffect(() => {
    if (!open) return;
    setName(room.name); setTopic(room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent().topic || '');
    setJoinRule(room.getJoinRule() || JoinRule.Invite);
    setHistory(room.getHistoryVisibility() || HistoryVisibility.Shared);
    setError(''); setNotice(''); setConfirmLeave(false);
    let disposed = false;
    void room.loadMembersIfNeeded().then(() => { if (!disposed) refresh(value => value + 1); }).catch(() => { if (!disposed) setError('Kunne ikke hente hele medlemslisten.'); });
    return () => { disposed = true; };
  }, [open, room]);
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); refresh(value => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Romhandlingen kunne ikke fullføres.'); }
    finally { setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (canEdit(EventType.RoomName) && name.trim() && name.trim() !== room.name) await client.setRoomName(room.roomId, name.trim());
      if (canEdit(EventType.RoomTopic) && topic !== (room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent().topic || '')) await client.setRoomTopic(room.roomId, topic);
      if (canEdit(EventType.RoomJoinRules) && joinRule !== room.getJoinRule()) await client.sendStateEvent(room.roomId, EventType.RoomJoinRules, { join_rule: joinRule as JoinRule }, '');
      if (canEdit(EventType.RoomHistoryVisibility) && history !== room.getHistoryVisibility()) await client.sendStateEvent(room.roomId, EventType.RoomHistoryVisibility, { history_visibility: history as HistoryVisibility }, '');
      setNotice('Rominnstillingene er lagret.');
    });
  }
  function changeAvatar(file?: File) {
    if (!file || !canEdit(EventType.RoomAvatar)) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { setError('Velg et PNG-, JPEG-, WebP- eller GIF-bilde.'); return; }
    void run(async () => { const upload = await client.uploadContent(file); await client.sendStateEvent(room.roomId, EventType.RoomAvatar, { url: upload.content_uri }, ''); setNotice('Rombildet er oppdatert.'); });
  }
  const members = room.getMembers().filter(member => ['join', 'invite'].includes(member.membership || ''));
  return <MatrixModal title={room.isSpaceRoom() ? 'Space-innstillinger' : 'Rominnstillinger'} open={open} onClose={() => { if (!busy) onClose(); }}><div className={styles.settingsSections}>
    <section><div className={styles.profileRow}><MatrixAvatar client={client} name={room.name} mxc={avatar} large/><div><strong>{room.name}</strong><small>{room.getJoinedMemberCount()} medlemmer{encrypted ? ' · Kryptert' : ''}</small></div><button disabled={busy || !canEdit(EventType.RoomAvatar)} onClick={() => avatarInput.current?.click()}>Endre rombilde</button></div><input hidden ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { changeAvatar(event.target.files?.[0]); event.target.value = ''; }}/>
      <form className={styles.settingsForm} onSubmit={save}><label>Romnavn<input required maxLength={200} disabled={busy || !canEdit(EventType.RoomName)} value={name} onChange={event => setName(event.target.value)}/></label><label>Beskrivelse<textarea aria-label="Beskrivelse" rows={3} maxLength={2000} disabled={busy || !canEdit(EventType.RoomTopic)} value={topic} onChange={event => setTopic(event.target.value)}/></label>
      <label>Hvem kan bli med?<select disabled={busy || !canEdit(EventType.RoomJoinRules) || ![JoinRule.Public, JoinRule.Invite].includes(joinRule as JoinRule)} value={joinRule} onChange={event => setJoinRule(event.target.value)}><option value={JoinRule.Invite}>Bare inviterte</option><option value={JoinRule.Public}>Alle med romadressen</option>{![JoinRule.Public, JoinRule.Invite].includes(joinRule as JoinRule) && <option value={joinRule}>Begrenset tilgang ({joinRule})</option>}</select></label>
      <label>Hvem kan lese historikken?<select disabled={busy || !canEdit(EventType.RoomHistoryVisibility)} value={history} onChange={event => setHistory(event.target.value)}><option value={HistoryVisibility.Joined}>Fra de ble med</option><option value={HistoryVisibility.Invited}>Fra de ble invitert</option><option value={HistoryVisibility.Shared}>Alle rommedlemmer, også nye</option><option value={HistoryVisibility.WorldReadable}>Alle, også uten medlemskap</option></select></label>
      {encrypted && <small>Kryptert historikk krever også at meldingsnøklene er tilgjengelige.</small>}
      {[EventType.RoomName, EventType.RoomTopic, EventType.RoomJoinRules, EventType.RoomHistoryVisibility].some(canEdit) ? <button className={styles.primary} disabled={busy || !name.trim()}>{busy ? 'Lagrer …' : 'Lagre rominnstillinger'}</button> : <small>Du kan se innstillingene. En romadministrator må endre dem.</small>}</form>
    </section>
    <section><h3>Inviter personer</h3><form className={styles.inviteForm} onSubmit={event => { event.preventDefault(); if (!/^@[^:\s]+:[^\s]+$/.test(invitee.trim())) { setError('Oppgi en Matrix-ID, for eksempel @gnomen:server.no.'); return; } void run(async () => { await client.invite(room.roomId, invitee.trim()); setNotice(`Invitasjon sendt til ${invitee.trim()}.`); setInvitee(''); }); }}><input aria-label="Matrix-ID å invitere" placeholder="@gnomen:server.no" value={invitee} disabled={busy || !room.canInvite(userId)} onChange={event => setInvitee(event.target.value)}/><button disabled={busy || !invitee.trim() || !room.canInvite(userId)}>Inviter</button></form>{!room.canInvite(userId) && <small>Du har ikke tillatelse til å invitere i dette rommet.</small>}</section>
    <section><h3>Medlemmer · {members.length}</h3><div className={styles.memberList}>{members.map(member => <div className={styles.memberRow} key={member.userId}><MatrixAvatar client={client} name={member.name} mxc={member.getMxcAvatarUrl()}/><span><strong>{member.name}</strong><small>{member.userId}</small></span><small>{member.membership === 'invite' ? 'Invitert' : member.powerLevel >= 100 ? 'Administrator' : member.powerLevel >= 50 ? 'Moderator' : 'Medlem'}</small></div>)}</div></section>
    <section><h3>Om rommet</h3><dl className={styles.accountInfo}><dt>Rom-ID</dt><dd>{room.roomId}</dd><dt>Romadresse</dt><dd>{room.getCanonicalAlias() || 'Ingen offentlig romadresse'}</dd><dt>Kryptering</dt><dd>{encrypted ? 'Ende-til-ende-kryptert' : 'Ikke aktivert'}</dd></dl>
      {!room.isSpaceRoom() && !encrypted && canEdit(EventType.RoomEncryption) && <button disabled={busy} onClick={() => void run(async () => { await client.sendStateEvent(room.roomId, EventType.RoomEncryption, { algorithm: 'm.megolm.v1.aes-sha2' }, ''); setNotice('Ende-til-ende-kryptering er aktivert. Den kan ikke slås av igjen.'); })}><MatrixIcon name="lock" size={14}/> Aktiver ende-til-ende-kryptering</button>}{!room.isSpaceRoom() && !encrypted && canEdit(EventType.RoomEncryption) && <small>Kryptering kan ikke slås av igjen etter aktivering.</small>}
      <button className={styles.logoutRow} disabled={busy} onClick={() => setConfirmLeave(true)}><MatrixIcon name="logout" size={16}/>Forlat rommet</button>{confirmLeave && <div className={styles.leaveConfirm}><p>Vil du forlate {room.name}?</p><button disabled={busy} onClick={() => void run(async () => { await client.leave(room.roomId); onClose(); onLeft(); })}>Ja, forlat rommet</button><button disabled={busy} onClick={() => setConfirmLeave(false)}>Avbryt</button></div>}
    </section>{notice && <p className={styles.settingsNotice} role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
  </div></MatrixModal>;
}
