import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EventType, RelationType, type MatrixClient, type MatrixEvent, type Room } from 'matrix-js-sdk';
import type { EncryptedFile } from 'matrix-js-sdk/lib/@types/media';
import { loadMatrixMedia } from '@/services/matrixMedia';
import { MatrixAvatar, MatrixEmojiPicker, MatrixIcon, MatrixModal } from './MatrixUi';
import { MatrixPoll } from './MatrixPoll';
import { MatrixLocation } from './MatrixLocation';
import { parseGeoUri } from '@/services/matrixLocation';
import { displayedContent, markdownContent } from '@/services/matrixMarkdown';
import { MatrixMarkdown } from './MatrixMarkdown';
import { MatrixFormatting } from './MatrixFormatting';
import styles from '@/pages/Chat2Page.module.css';

function MatrixAttachment({ client, event, sticker }: { client: MatrixClient; event: MatrixEvent; sticker: boolean }) {
  const content = event.getContent(); const image = sticker || content.msgtype === 'm.image'; const audio = content.msgtype === 'm.audio';
  const [requested, setRequested] = useState(image || audio);
  const [url, setUrl] = useState(''); const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const file: EncryptedFile | undefined = content.file;
  const mxc: string | undefined = content.url;
  const mimetype: string | undefined = content.info?.mimetype;
  const filename = content.filename || content.body || 'Vedlegg';
  const fingerprint = JSON.stringify(file);
  useEffect(() => {
    if (!requested) return;
    const abort = new AbortController(); let objectUrl = '';
    setError(''); setUrl('');
    const encryptedFile = fingerprint ? JSON.parse(fingerprint) as EncryptedFile : undefined;
    void loadMatrixMedia(client, { url: mxc, file: encryptedFile, mimetype }, abort.signal).then(blob => {
      if (abort.signal.aborted) return;
      setPreview(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(blob.type));
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(reason => { if (!abort.signal.aborted) { setError(reason instanceof Error ? reason.message : 'Kunne ikke hente vedlegget.'); setRequested(false); } });
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, fingerprint, mxc, mimetype, requested]);
  const size = Number(content.info?.size || 0);
  return <div className={sticker ? styles.stickerMedia : styles.attachment}>
    {audio && <div className={styles.audioMessage}><span><MatrixIcon name="mic" size={15}/>{content['org.matrix.msc3245.voice'] ? 'Lydmelding' : content.body || 'Lyd'}{typeof content.info?.duration === 'number' && <small>{Math.floor(content.info.duration / 60000)}:{String(Math.floor(content.info.duration / 1000) % 60).padStart(2, '0')}</small>}</span>{url ? <audio aria-label="Spill av lydmelding" controls preload="metadata" src={url}/> : !error && <small>Laster lyd …</small>}</div>}
    {image && url && preview && <a href={url} download={filename} title="Last ned bilde"><img src={url} alt={sticker ? content.body : filename} className={styles.messageImage}/></a>}
    {!sticker && <div className={styles.fileRow}><MatrixIcon name="file"/><div><strong>{filename}</strong><small>{size ? `${(size / (size > 1048576 ? 1048576 : 1024)).toFixed(1)} ${size > 1048576 ? 'MB' : 'KB'}` : 'Vedlegg'}</small></div>{url ? <a href={url} download={filename}>Last ned</a> : <button type="button" disabled={requested && !error} onClick={() => setRequested(true)}>{requested && !error ? 'Laster …' : 'Hent fil'}</button>}</div>}
    {sticker && !url && !error && <small>Laster sticker …</small>}
    {error && <small role="alert">{error}</small>}{error && sticker && <button type="button" onClick={() => setRequested(true)}>Prøv igjen</button>}
  </div>;
}

export function MatrixMessage({ client, room, event, events, showTime, group = 'single', onError }: { client: MatrixClient; room: Room; event: MatrixEvent; events: MatrixEvent[]; showTime: boolean; group?: 'single' | 'start' | 'middle' | 'end'; onError: (message: string) => void }) {
  const own = event.getSender() === client.getUserId();
  const member = room.getMember(event.getSender() || ''); const name = member?.name || event.getSender() || 'Ukjent';
  const { content, edited } = displayedContent(event, events); const eventId = event.getId();
  const location = parseGeoUri(content.geo_uri || content['m.location']?.uri || content['org.matrix.msc3488.location']?.uri || content.body);
  const poll = ['m.poll.start', 'org.matrix.msc3381.poll.start'].includes(event.getType());
  const sticker = event.getType() === EventType.Sticker || Boolean(content['org.gnomguttan.sticker']);
  const media = sticker || ['m.image', 'm.file', 'm.video', 'm.audio'].includes(content.msgtype || '');
  const [picker, setPicker] = useState(false); const [busy, setBusy] = useState(false);
  const [loadedReactions, setLoadedReactions] = useState<MatrixEvent[]>([]);
  const [reactionsLoaded, setReactionsLoaded] = useState(false);
  const [removedReactions, setRemovedReactions] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState(false); const [editSource, setEditSource] = useState(''); const [editPreview, setEditPreview] = useState(false);
  const editInput = useRef<HTMLTextAreaElement>(null);
  const canEdit = own && !event.isRedacted() && !event.isDecryptionFailure() && !event.status && content.msgtype === 'm.text' && !location;
  async function saveEdit(formEvent: FormEvent) {
    formEvent.preventDefault(); if (!canEdit || !eventId || !editSource.trim() || busy) return;
    setBusy(true);
    try {
      const updated = markdownContent(editSource.trim());
      await client.sendMessage(room.roomId, { ...updated, body: `* ${updated.body}`, 'm.new_content': updated, 'm.relates_to': { rel_type: RelationType.Replace, event_id: eventId } });
      setEditing(false);
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Kunne ikke redigere meldingen.'); }
    finally { setBusy(false); }
  }
  const aggregated = room.relations.getChildEventsForEvent(eventId || '', RelationType.Annotation, EventType.Reaction)?.getRelations() || [];
  const allReactions = [...new Map([...loadedReactions, ...aggregated, ...events.filter(item => item.getType() === EventType.Reaction && item.getRelation()?.event_id === eventId)].map(item => [item.getId(), item])).values()];
  const groups = new Map<string, { count: number; own: boolean; names: string[] }>();
  for (const reaction of allReactions) {
    if (reaction.isRedacted() || reaction.status === 'not_sent' || removedReactions.has(reaction.getId() || '')) continue;
    const key = reaction.getContent()['m.relates_to']?.key; if (typeof key !== 'string') continue;
    const group = groups.get(key) || { count: 0, own: false, names: [] };
    const sender = reaction.getSender() || '';
    // Matrix clients count each sender once per emoji.
    if (!group.names.includes(sender)) { group.count++; group.names.push(sender); }
    group.own ||= sender === client.getUserId(); groups.set(key, group);
  }
  const summary = event.getUnsigned()['m.relations']?.['m.annotation']?.chunk as { key?: string; count?: number }[] | undefined;
  if (!reactionsLoaded) for (const item of summary || []) if (item.key && item.count) {
    const group = groups.get(item.key) || { count: 0, own: false, names: [] }; group.count = Math.max(group.count, item.count); groups.set(item.key, group);
  }
  async function react(emoji: string) {
    if (!eventId || busy || event.status) return;
    setBusy(true); setPicker(false);
    try {
      // Fetch existing reactions before toggling so a reaction from another session is removed, rather than duplicated.
      const fetched: MatrixEvent[] = []; const tokens = new Set<string>(); let from: string | undefined;
      do {
        const response = await client.relations(room.roomId, eventId, RelationType.Annotation, EventType.Reaction, { from });
        fetched.push(...response.events);
        from = response.nextBatch || undefined;
        if (from && tokens.has(from)) break;
        if (from) tokens.add(from);
      } while (from);
      const existing = [...fetched, ...allReactions].filter(item => !item.isRedacted() && !removedReactions.has(item.getId() || '') && item.getSender() === client.getUserId() && item.getContent()['m.relates_to']?.key === emoji);
      if (existing.length) {
        await Promise.all([...new Set(existing.map(item => item.getId()!))].map(id => client.redactEvent(room.roomId, id)));
        setRemovedReactions(current => new Set([...current, ...existing.map(item => item.getId()!)]));
        setLoadedReactions(fetched.filter(item => !existing.some(ownEvent => ownEvent.getId() === item.getId())));
      } else {
        await client.sendEvent(room.roomId, EventType.Reaction, { 'm.relates_to': { event_id: eventId, key: emoji, rel_type: RelationType.Annotation } });
        setLoadedReactions(fetched);
      }
      setReactionsLoaded(true);
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Kunne ikke endre reaksjonen.'); }
    finally { setBusy(false); }
  }
  return <article className={`${styles.messageRow} ${own ? styles.own : ''} ${styles[`group${group[0].toUpperCase()}${group.slice(1)}`] || ''}`}>
    {group === 'start' || group === 'middle' ? <span className={styles.avatarSpacer} aria-hidden="true"/> : <MatrixAvatar client={client} name={name} mxc={member?.getMxcAvatarUrl()} />}
    <div className={styles.messageStack}>{(group === 'single' || group === 'start') && <div className={styles.messageMeta}><strong>{own ? 'Du' : name}</strong>{showTime && <time dateTime={new Date(event.getTs()).toISOString()} title={new Date(event.getTs()).toLocaleString('nb-NO')}>{new Date(event.getTs()).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</time>}</div>}
      <div className={`${styles.bubble} ${sticker ? styles.stickerBubble : ''}`} title={showTime ? new Date(event.getTs()).toLocaleString('nb-NO') : undefined}>
        {event.isRedacted() ? <p className={styles.muted}>Meldingen er slettet.</p> : event.isDecryptionFailure() || event.getType() === EventType.RoomMessageEncrypted ? <p className={styles.muted}>Venter på dekrypteringsnøkkel. Gjenopprett historikken i innstillinger.</p> : location ? <MatrixLocation location={location}/> : poll ? <MatrixPoll client={client} room={room} event={event} /> : media ? <MatrixAttachment client={client} event={event} sticker={sticker}/> : <MatrixMarkdown source={content.body || 'Denne meldingstypen kan ikke vises.'} formattedHtml={content.format === 'org.matrix.custom.html' ? content.formatted_body : undefined}/>}
        {edited && <small className={styles.edited}>redigert</small>}
      </div>
      {!event.isRedacted() && <div className={`${styles.reactions} ${groups.size === 0 ? styles.reactionsEmpty : ''}`}>{[...groups].map(([emoji, group]) => <button type="button" key={emoji} className={group.own ? styles.myReaction : ''} disabled={busy || Boolean(event.status)} aria-label={`Reager med ${emoji}, ${group.count} reaksjoner`} aria-pressed={group.own} title={group.names.map(sender => room.getMember(sender)?.name || sender).join(', ')} onClick={() => void react(emoji)}>{emoji}<span>{group.count}</span></button>)}
        <details className={styles.reactionPicker} open={picker} onToggle={e => setPicker(e.currentTarget.open)}><summary aria-label="Meldingshandlinger og reaksjoner"><MatrixIcon name="smile" size={15}/></summary><div className={styles.reactionPopover}><MatrixEmojiPicker onSelect={emoji => void react(emoji)}/>{canEdit && <button type="button" className={styles.editAction} onClick={() => { setEditSource(content['org.gnomguttan.markdown'] || content.body || ''); setEditPreview(false); setEditing(true); setPicker(false); }}><MatrixIcon name="edit" size={14}/>Rediger melding</button>}</div></details></div>}
      {editing && <MatrixModal title="Rediger melding" onClose={() => { if (!busy) setEditing(false); }}><form className={styles.settingsForm} onSubmit={saveEdit}><label>Melding<textarea aria-label="Melding" ref={editInput} rows={5} maxLength={20000} disabled={busy} value={editSource} onChange={event => setEditSource(event.target.value)}/></label><MatrixFormatting input={editInput} value={editSource} onChange={setEditSource} preview={editPreview} onPreview={() => setEditPreview(!editPreview)} disabled={busy}/>{editPreview && <div className={styles.markdownPreview}><MatrixMarkdown source={editSource}/></div>}<button className={styles.primary} disabled={busy || !editSource.trim()}>{busy ? 'Lagrer …' : 'Lagre endring'}</button></form></MatrixModal>}
      {event.status === 'not_sent' ? <button className={styles.retry} disabled={busy} onClick={() => { setBusy(true); void client.resendEvent(event, room).catch(() => onError('Kunne ikke sende meldingen på nytt.')).finally(() => setBusy(false)); }}>Sending feilet · Prøv igjen</button> : event.status && <small className={styles.muted}>Sender …</small>}
    </div>
  </article>;
}
