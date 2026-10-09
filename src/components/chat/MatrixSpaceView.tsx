import { useEffect, useState } from 'react';
import { EventType, RoomType, type MatrixClient, type Room } from 'matrix-js-sdk';
import { MatrixAvatar, MatrixIcon, MatrixModal } from './MatrixUi';
import { MatrixRoomSettings } from './MatrixRoomSettings';
import styles from '@/pages/Chat2Page.module.css';

type SpaceRooms = Awaited<ReturnType<MatrixClient['getRoomHierarchy']>>['rooms'];
export function MatrixSpaceView({ client, room, revision, onOpen, onLeft, onBack }: { client: MatrixClient; room: Room; revision: number; onOpen: (roomId: string) => void; onLeft: () => void; onBack: () => void }) {
  const [children, setChildren] = useState<SpaceRooms>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [next, setNext] = useState<string>(); const [settings, setSettings] = useState(false); const [adding, setAdding] = useState(false); const [target, setTarget] = useState(''); const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const avatar = room.currentState.getStateEvents(EventType.RoomAvatar, '')?.getContent().url;
  const mayAdd = room.currentState.maySendStateEvent(EventType.SpaceChild, client.getUserId()!);
  useEffect(() => {
    let disposed = false; setLoading(true); setError(''); setChildren([]); setNext(undefined);
    void client.getRoomHierarchy(room.roomId, 50, 1).then(result => {
      if (!disposed) { setChildren(result.rooms.filter(item => item.room_id !== room.roomId)); setNext(result.next_batch); }
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Kunne ikke hente rommene i spacet.'); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [client, room.roomId, reload]);
  async function more() {
    if (!next || loading) return; setLoading(true); setError('');
    try { const result = await client.getRoomHierarchy(room.roomId, 50, 1, false, next); setChildren(current => [...current, ...result.rooms.filter(item => item.room_id !== room.roomId && !current.some(old => old.room_id === item.room_id))]); setNext(result.next_batch); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke hente flere rom.'); }
    finally { setLoading(false); }
  }
  async function openChild(id: string) {
    if (busy) return; setBusy(true); setError('');
    try { if (client.getRoom(id)?.getMyMembership() !== 'join') await client.joinRoom(id); onOpen(id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke bli med i rommet.'); }
    finally { setBusy(false); }
  }
  async function addRoom() {
    if (!target || !mayAdd || busy) return; setBusy(true); setError('');
    try {
      const child = client.getRoom(target); if (!child) throw new Error('Velg et rom du er medlem av.');
      const via = [...new Set([client.getUserId()!.split(':').slice(1).join(':'), target.split(':').slice(1).join(':')].filter(Boolean))];
      await client.sendStateEvent(room.roomId, EventType.SpaceChild, { via, suggested: true }, target);
      // A parent backlink is optional; only write it when this user can manage the child room.
      if (child.currentState.maySendStateEvent(EventType.SpaceParent, client.getUserId()!)) await client.sendStateEvent(target, EventType.SpaceParent, { via, canonical: false }, room.roomId);
      setAdding(false); setTarget(''); setReload(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke legge rommet til spacet.'); }
    finally { setBusy(false); }
  }
  // Membership and permissions can change when the Matrix client syncs.
  void revision;
  return <div className={styles.conversation}><header className={styles.roomHeader}><button className={`${styles.iconButton} ${styles.mobileBack}`} aria-label="Vis romlisten" onClick={onBack}><MatrixIcon name="back"/></button><MatrixAvatar client={client} name={room.name} mxc={avatar} large/><div className={styles.roomHeading}><h2>{room.name}</h2><p>Space · Rom og samtaler</p></div><button className={styles.iconButton} aria-label="Åpne space-innstillinger" onClick={() => setSettings(true)}><MatrixIcon name="settings"/></button></header>
    <div className={styles.spaceContent}>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.spaceTitle}><h3>Rom i spacet</h3>{mayAdd && <button type="button" onClick={() => setAdding(true)}><MatrixIcon name="plus" size={14}/> Legg til rom</button>}</div>
    {loading && <p role="status">Henter rom …</p>}{!loading && !children.length && !error && <p>Dette spacet har ingen rom ennå.</p>}
    <div className={styles.addChoices}>{children.map(child => <button type="button" key={child.room_id} disabled={busy} onClick={() => void openChild(child.room_id)}><MatrixAvatar client={client} name={child.name || child.room_id} mxc={child.avatar_url}/><span><strong>{child.name || child.room_id}</strong><small>{child.room_type === RoomType.Space ? 'Space' : client.getRoom(child.room_id)?.getMyMembership() === 'join' ? 'Åpne rom' : 'Bli med i rom'}{child.topic ? ` · ${child.topic}` : ''}</small></span></button>)}</div>
    {next && <button type="button" disabled={loading} onClick={() => void more()}>Vis flere rom</button>}{error && <button type="button" onClick={() => setReload(value => value + 1)}>Prøv igjen</button>}</div>
    <MatrixRoomSettings client={client} room={room} open={settings} onClose={() => setSettings(false)} onLeft={onLeft}/>
    {adding && <MatrixModal title="Legg til rom i space" onClose={() => { if (!busy) setAdding(false); }}><form className={styles.settingsForm} onSubmit={event => { event.preventDefault(); void addRoom(); }}><label>Rom<select aria-label="Rom å legge til" required value={target} disabled={busy} onChange={event => setTarget(event.target.value)}><option value="" disabled>Velg et rom</option>{client.getRooms().filter(item => item.roomId !== room.roomId && !item.isSpaceRoom() && item.getMyMembership() === 'join').map(item => <option key={item.roomId} value={item.roomId}>{item.name}</option>)}</select></label><small>Rommet vises i spacet. Medlemskap og tilgang i rommet endres ikke.</small>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.primary} disabled={busy || !target}>{busy ? 'Legger til …' : 'Legg til rom'}</button></form></MatrixModal>}
  </div>;
}
