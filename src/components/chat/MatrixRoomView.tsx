import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Direction, EventType, MsgType, type MatrixClient, type Room } from 'matrix-js-sdk';
import { isDisplayMessage, makeEmojiSticker, uploadMatrixFile } from '@/services/matrixMedia';
import { messagesConnect } from '@/services/matrixTimeline';
import { makeLocationContent } from 'matrix-js-sdk/lib/content-helpers';
import { parseGeoUri, type SharedLocation } from '@/services/matrixLocation';
import { MatrixLocation } from './MatrixLocation';
import { markdownContent } from '@/services/matrixMarkdown';
import { MatrixMarkdown } from './MatrixMarkdown';
import { MatrixFormatting } from './MatrixFormatting';
import { MatrixVoiceRecorder } from './MatrixVoiceRecorder';
import { MatrixRoomSettings } from './MatrixRoomSettings';
import { MatrixMessage } from './MatrixMessage';
import { MatrixAvatar, MatrixEmojiPicker, MatrixIcon, MatrixModal } from './MatrixUi';
import { createPoll } from './MatrixPoll';
import styles from '@/pages/Chat2Page.module.css';

export function MatrixRoomView({ client, room, revision, ready, compact, showTime, onError, onLeft, onBack }: { client: MatrixClient; room: Room; revision: number; ready: boolean; compact: boolean; showTime: boolean; onError: (message: string) => void; onLeft: () => void; onBack: () => void }) {
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState('');
  const [sending, setSending] = useState(false); const [progress, setProgress] = useState<number | null>(null);
  const [panel, setPanel] = useState<'emoji' | 'sticker' | 'poll' | null>(null);
  const [question, setQuestion] = useState(''); const [options, setOptions] = useState(['', '']);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [uploadLimit, setUploadLimit] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDraft, setLocationDraft] = useState<SharedLocation | null>(null);
  const [formatting, setFormatting] = useState(false); const [markdownPreview, setMarkdownPreview] = useState(false);
  const [voice, setVoice] = useState(false); const [roomSettings, setRoomSettings] = useState(false); const [actionError, setActionError] = useState('');
  const scroll = useRef<HTMLDivElement>(null); const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null); const stickerInput = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const events = room.getLiveTimeline().getEvents();
  const messages = events.filter(event => isDisplayMessage(event.getType()) && event.getRelation()?.rel_type !== 'm.replace');
  const encrypted = Boolean(room.hasEncryptionStateEvent());
  const avatar = room.currentState.getStateEvents(EventType.RoomAvatar, '')?.getContent().url;
  const topic = room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent().topic;
  useEffect(() => {
    let disposed = false;
    void client.getMediaConfig().then(config => { if (!disposed && typeof config['m.upload.size'] === 'number') setUploadLimit(config['m.upload.size']); }).catch(() => undefined);
    return () => { disposed = true; };
  }, [client]);
  useEffect(() => {
    if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (stickToBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [revision, messages.length, historyRevision]);
  async function run(operation: () => Promise<void>) {
    setSending(true); onError(''); setActionError('');
    try { await operation(); }
    catch (reason) { const message = reason instanceof Error ? reason.message : 'Handlingen kunne ikke fullføres.'; onError(message); setActionError(message); }
    finally { setSending(false); setProgress(null); }
  }
  function chooseFile(next?: File) {
    if (!next) return;
    if (uploadLimit && next.size > uploadLimit) { onError(`Serveren tillater filer opptil ${(uploadLimit / 1048576).toFixed(1)} MB.`); return; }
    setFile(next); setPanel(null); input.current?.focus();
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (sending || !ready || (!draft.trim() && !file)) return;
    await run(async () => {
      if (file) { await uploadMatrixFile(client, room.roomId, file, false, setProgress); setFile(null); }
      if (draft.trim()) { await client.sendMessage(room.roomId, markdownContent(draft.trim())); setDraft(''); }
      stickToBottom.current = true; input.current?.focus();
    });
  }
  async function loadHistory() {
    if (loadingHistory) return;
    setLoadingHistory(true);
    const element = scroll.current; const height = element?.scrollHeight || 0; const top = element?.scrollTop || 0;
    stickToBottom.current = false;
    try {
      await client.scrollback(room, 50); setHistoryRevision(value => value + 1);
      requestAnimationFrame(() => { if (element) element.scrollTop = element.scrollHeight - height + top; });
    } catch { onError('Kunne ikke hente eldre meldinger. Prøv igjen.'); }
    finally { setLoadingHistory(false); }
  }
  function addEmoji(emoji: string) {
    const start = input.current?.selectionStart ?? draft.length; const end = input.current?.selectionEnd ?? start;
    setDraft(current => current.slice(0, start) + emoji + current.slice(end));
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + emoji.length, start + emoji.length); });
  }
  function sendSticker(sticker: File | string) {
    if (!ready || sending) return;
    void run(async () => { const image = typeof sticker === 'string' ? await makeEmojiSticker(sticker) : sticker; await uploadMatrixFile(client, room.roomId, image, true, setProgress); setPanel(null); stickToBottom.current = true; });
  }
  function findLocation() {
    if (!navigator.geolocation) { onError('Nettleseren støtter ikke posisjonsdeling.'); return; }
    setLocating(true); onError('');
    navigator.geolocation.getCurrentPosition(position => {
      setLocating(false);
      const { latitude, longitude, accuracy } = position.coords;
      const next = parseGeoUri(`geo:${latitude},${longitude};u=${accuracy}`);
      if (next) setLocationDraft(next); else onError('Kunne ikke lese posisjonen. Prøv igjen.');
    }, reason => {
      setLocating(false);
      onError(reason.code === 1 ? 'Posisjonstilgang ble avslått. Tillat posisjon i nettleseren for å dele.' : reason.code === 3 ? 'Det tok for lang tid å finne posisjonen. Prøv igjen.' : 'Kunne ikke finne posisjonen din.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function shareLocation() {
    if (!locationDraft || sending || !ready) return;
    const uri = `geo:${locationDraft.latitude},${locationDraft.longitude}${locationDraft.accuracy !== undefined ? `;u=${locationDraft.accuracy}` : ''}`;
    void run(async () => { await client.sendMessage(room.roomId, { ...makeLocationContent('Delt posisjon', uri, Date.now(), 'Min posisjon'), msgtype: MsgType.Location, info: {} }); setLocationDraft(null); stickToBottom.current = true; });
  }
  function submitPoll(event: FormEvent) {
    event.preventDefault(); const answers = options.map(value => value.trim()).filter(Boolean);
    if (sending || !ready || !question.trim() || answers.length < 2 || new Set(answers).size !== answers.length) return;
    void run(async () => { await createPoll(client, room.roomId, question.trim(), answers); setPanel(null); setQuestion(''); setOptions(['', '']); stickToBottom.current = true; });
  }
  let lastDay = '';
  return <div className={`${styles.conversation} ${compact ? styles.compact : ''}`}>
    <header className={styles.roomHeader}><button className={`${styles.iconButton} ${styles.mobileBack}`} aria-label="Vis romlisten" onClick={onBack}><MatrixIcon name="back"/></button><MatrixAvatar client={client} name={room.name} mxc={avatar} large/><div className={styles.roomHeading}><h2>{room.name}</h2><p title={topic}>{encrypted && <MatrixIcon name="lock" size={12}/>} {topic || `${room.getJoinedMemberCount()} medlemmer${encrypted ? ' · Ende-til-ende-kryptert' : ''}`}</p></div><button className={styles.iconButton} aria-label="Åpne rominnstillinger" onClick={() => setRoomSettings(true)}><MatrixIcon name="settings"/></button></header>
    <div ref={scroll} className={styles.messages} role="log" aria-label="Meldinger" onScroll={() => { const element = scroll.current!; stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }} onLoad={() => { if (stickToBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }}>
      {room.getLiveTimeline().getPaginationToken(Direction.Backward) && <button className={styles.historyButton} disabled={loadingHistory} onClick={() => void loadHistory()}>{loadingHistory ? 'Henter meldinger …' : 'Vis eldre meldinger'}</button>}
      {!messages.length && <div className={styles.empty}><MatrixIcon name="chat" size={36}/><h2>Start samtalen</h2><p>Send en melding, et bilde eller en avstemning.</p></div>}
      {messages.map((event, index) => {
        const day = new Date(event.getTs()).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }); const divider = day !== lastDay; lastDay = day;
        const connectedBefore = messagesConnect(messages[index - 1], event);
        const connectedAfter = messagesConnect(event, messages[index + 1]);
        const group = connectedBefore ? connectedAfter ? 'middle' : 'end' : connectedAfter ? 'start' : 'single';
        return <div key={event.getId() || index} className={`${styles.timelineItem} ${connectedAfter ? styles.connectedNext : ''}`}>{divider && <div className={styles.dateDivider}><span>{day}</span></div>}<MatrixMessage client={client} room={room} event={event} events={events} showTime={showTime} group={group} onError={onError}/></div>;
      })}
    </div>
    {panel === 'poll' && <MatrixModal title="Ny avstemning" onClose={() => { if (!sending) setPanel(null); }}><form className={styles.settingsForm} onSubmit={submitPoll}><label>Spørsmål<input required maxLength={500} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Hva skal vi finne på?"/></label><label>Svaralternativer</label>{options.map((option, index) => <div className={styles.optionRow} key={index}><input aria-label={`Alternativ ${index + 1}`} required maxLength={200} placeholder={`Alternativ ${index + 1}`} value={option} onChange={event => setOptions(current => current.map((value, i) => i === index ? event.target.value : value))}/>{options.length > 2 && <button type="button" aria-label={`Fjern alternativ ${index + 1}`} onClick={() => setOptions(current => current.filter((_, i) => i !== index))}><MatrixIcon name="close" size={16}/></button>}</div>)}{options.length < 10 && <button type="button" className={styles.textButton} onClick={() => setOptions(current => [...current, ''])}>+ Legg til alternativ</button>}<small>Alle kan stemme på ett alternativ. Resultatene vises fortløpende.</small><button className={styles.primary} disabled={sending || !question.trim() || options.some(value => !value.trim()) || new Set(options.map(value => value.trim())).size !== options.length}>{sending ? 'Oppretter …' : 'Opprett avstemning'}</button></form></MatrixModal>}
    {locationDraft && <MatrixModal title="Del posisjonen din" onClose={() => { if (!sending) setLocationDraft(null); }}><div className={styles.settingsForm}><MatrixLocation location={locationDraft} label="Din posisjon"/>{actionError && <p className={styles.error} role="alert">{actionError}</p>}<small>En engangsposisjon deles med alle i rommet.{encrypted ? ' Meldingen er ende-til-ende-kryptert.' : ''}</small><button type="button" className={styles.primary} disabled={sending || !ready} onClick={shareLocation}>{sending ? 'Sender …' : 'Del posisjon'}</button></div></MatrixModal>}
    <MatrixRoomSettings client={client} room={room} open={roomSettings} onClose={() => setRoomSettings(false)} onLeft={onLeft}/>
    {voice && <MatrixVoiceRecorder onClose={() => setVoice(false)} onSend={async (recorded, duration) => {
      if (!ready) throw new Error('Matrix-tilkoblingen er ikke klar.');
      if (uploadLimit && recorded.size > uploadLimit) throw new Error('Lydmeldingen overstiger serverens filgrense.');
      setSending(true);
      try { await uploadMatrixFile(client, room.roomId, recorded, false, setProgress, { duration }); stickToBottom.current = true; }
      finally { setSending(false); setProgress(null); }
    }}/>} 
    <form className={styles.composer} onSubmit={send} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!sending) chooseFile(event.dataTransfer.files[0]); }}>
      {file && <div className={styles.filePreview}>{preview ? <img src={preview} alt="Forhåndsvisning"/> : <MatrixIcon name="file"/>}<div><strong>{file.name}</strong><small>{progress === null ? `${(file.size / 1024).toFixed(0)} KB${encrypted ? ' · Krypteres før opplasting' : ''}` : `Laster opp · ${progress}%`}</small></div><button type="button" aria-label="Fjern vedlegg" disabled={sending} className={styles.iconButton} onClick={() => setFile(null)}><MatrixIcon name="close" size={16}/></button></div>}
      {panel === 'emoji' && <div className={styles.composerPanel}><div><strong>Emojier</strong><button type="button" className={styles.iconButton} aria-label="Lukk emojier" onClick={() => setPanel(null)}><MatrixIcon name="close" size={16}/></button></div><MatrixEmojiPicker onSelect={addEmoji}/></div>}
      {panel === 'sticker' && <div className={styles.composerPanel}><div><strong>Stickers</strong><button type="button" className={styles.iconButton} aria-label="Lukk stickers" onClick={() => setPanel(null)}><MatrixIcon name="close" size={16}/></button></div><div className={styles.stickerGrid}>{['🍻', '🐈', '🧙', '🎉', '❤️', '🔥', '👍', '😂', '👀', '🎮', '💯', '🥳'].map(emoji => <button type="button" key={emoji} disabled={sending} aria-label={`Send sticker ${emoji}`} onClick={() => sendSticker(emoji)}>{emoji}</button>)}</div><button type="button" className={styles.textButton} disabled={sending} onClick={() => stickerInput.current?.click()}>Last opp egen sticker</button>{progress !== null && <small role="status">Laster opp · {progress}%</small>}</div>}
      <div className={styles.composeInput}>{markdownPreview ? <div className={styles.markdownPreview}><MatrixMarkdown source={draft || 'Forhåndsvisningen vises her.'}/></div> : <textarea ref={input} aria-label="Melding" placeholder={`Melding til ${room.name} …`} rows={1} maxLength={20000} value={draft} disabled={sending || !ready} onChange={event => setDraft(event.target.value)} onPaste={event => { const pasted = event.clipboardData.files[0]; if (pasted && !sending) { event.preventDefault(); chooseFile(pasted); } }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/>}<button className={styles.sendButton} aria-label="Send melding" disabled={sending || !ready || (!draft.trim() && !file)}>{sending ? <span className={styles.spinner}/> : <MatrixIcon name="send" size={18}/>}</button></div>
      {formatting && <MatrixFormatting input={input} value={draft} onChange={setDraft} preview={markdownPreview} onPreview={() => setMarkdownPreview(!markdownPreview)} disabled={sending || !ready}/>}
      <div className={styles.composerTools}><div><button type="button" className={styles.iconButton} aria-label="Last opp bilde eller fil" title="Bilde eller fil" disabled={sending || !ready} onClick={() => fileInput.current?.click()}><MatrixIcon name="file"/></button><button type="button" className={styles.iconButton} aria-label="Velg emoji" title="Emojier" disabled={sending} aria-expanded={panel === 'emoji'} onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')}><MatrixIcon name="smile"/></button><button type="button" className={styles.iconButton} aria-label="Velg sticker" title="Stickers" disabled={sending || !ready} aria-expanded={panel === 'sticker'} onClick={() => setPanel(panel === 'sticker' ? null : 'sticker')}><MatrixIcon name="sticker"/></button><button type="button" className={styles.iconButton} aria-label="Lag avstemning" title="Avstemning" disabled={sending || !ready} onClick={() => setPanel('poll')}><MatrixIcon name="poll"/></button><button type="button" className={styles.iconButton} aria-label="Del posisjon" title={locating ? "Finner posisjonen …" : "Del posisjon"} disabled={locating || sending || !ready} onClick={findLocation}>{locating ? <span className={styles.spinner}/> : <MatrixIcon name="location"/>}</button><button type="button" className={styles.iconButton} aria-label="Markdown-formatering" title="Markdown-formatering" aria-expanded={formatting} disabled={sending} onClick={() => { setFormatting(!formatting); setMarkdownPreview(false); }}><MatrixIcon name="format"/></button><button type="button" className={styles.iconButton} aria-label="Ta opp lydmelding" title="Lydmelding" disabled={sending || !ready} onClick={() => setVoice(true)}><MatrixIcon name="mic"/></button></div><small>{sending ? 'Sender …' : encrypted ? <><MatrixIcon name="lock" size={11}/> Kryptert</> : 'Enter sender · Shift+Enter gir ny linje'}</small></div>
      <input hidden ref={fileInput} type="file" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }}/><input hidden ref={stickerInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { const selected = event.target.files?.[0]; if (selected) sendSticker(selected); event.target.value = ''; }}/>
    </form>
  </div>;
}
