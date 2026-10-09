import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ClientEvent, EventType, MatrixEventEvent, RoomEvent, SyncState, createClient, type MatrixClient } from 'matrix-js-sdk';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import cryptoWasmUrl from '../../../node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm?url';
import { MatrixVerification } from '@/components/chat/MatrixVerification';
import { MatrixAvatar, MatrixIcon, MatrixModal } from '@/components/chat/MatrixUi';
import { MatrixRoomView } from '@/components/chat/MatrixRoomView';
import { MatrixAddConversation } from './MatrixAddConversation';
import { MatrixSpaceView } from './MatrixSpaceView';
import { Link } from 'react-router-dom';
import { config } from '@/config';
import { isDisplayMessage } from '@/services/matrixMedia';
import { parseGeoUri } from '@/services/matrixLocation';
import styles from '@/pages/Chat2Page.module.css';

type Session = { baseUrl: string; accessToken: string; userId: string; deviceId: string };
const SESSION_KEY = 'gnomguttan.matrix.v1';
function readSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return value && ['baseUrl', 'accessToken', 'userId', 'deviceId'].every(key => typeof value[key] === 'string') ? value : null;
  } catch { return null; }
}
function errorText(error: unknown): string {
  const code = (error as { errcode?: string })?.errcode;
  if (code === 'M_FORBIDDEN') return 'Feil brukernavn eller passord, eller manglende tilgang.';
  if (code === 'M_UNKNOWN_TOKEN') return 'Matrix-økten er utløpt. Logg ut og inn igjen.';
  if (code === 'M_LIMIT_EXCEEDED') return 'For mange forespørsler. Vent litt og prøv igjen.';
  return error instanceof Error ? error.message : 'Kunne ikke kontakte Matrix-serveren.';
}

export function MatrixClientPanel({ embedded = false }: { embedded?: boolean }) {
  const [session, setSession] = useState<Session | null>(readSession);
  const [server, setServer] = useState(config.matrixHomeserverUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [client, setClient] = useState<MatrixClient | null>(null);
  const [revision, refresh] = useState(0);
  const [selected, select] = useState('');
  const [status, setStatus] = useState('Kobler til …');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cryptoReady, setCryptoReady] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState('');
  const secretKey = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const [settings, setSettings] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileChat, setMobileChat] = useState(false);
  const [compact, setCompact] = useState(() => localStorage.getItem('gnomguttan.matrix.compact') !== 'false');
  const [showTime, setShowTime] = useState(() => localStorage.getItem('gnomguttan.matrix.timestamps') !== 'false');
  const [profileName, setProfileName] = useState('');
  const [profile, setProfile] = useState<{ name: string; avatar?: string }>({ name: '' });
  const avatarInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!client || !session) return;
    let disposed = false;
    void client.getProfileInfo(session.userId).then(value => {
      if (!disposed) { const name = value.displayname || session.userId; setProfile({ name, avatar: value.avatar_url }); setProfileName(name); }
    }).catch(() => { if (!disposed) { setProfile({ name: session.userId }); setProfileName(session.userId); } });
    return () => { disposed = true; };
  }, [client, session]);

  useEffect(() => {
    if (!session) return;
    setClient(null); setCryptoReady(false);
    let disposed = false;
    let release: (() => void) | undefined;
    const abort = new AbortController();
    const connection = createClient({ ...session, verificationMethods: ['m.sas.v1'], cryptoCallbacks: {
      getSecretStorageKey: async ({ keys }) => {
        const keyId = await connection.secretStorage.getDefaultKeyId();
        return keyId && keys[keyId] && secretKey.current ? [keyId, secretKey.current] : null;
      },
    } });
    const update = () => refresh(value => value + 1);
    const sync = (state: SyncState, _previous: SyncState | null, data?: { error?: Error }) => {
      setStatus(state === SyncState.Prepared || state === SyncState.Syncing ? 'Tilkoblet' : state === SyncState.Error ? 'Mistet forbindelsen. Prøver igjen …' : 'Synkroniserer …');
      if (data?.error && (data.error as { errcode?: string }).errcode === 'M_UNKNOWN_TOKEN') setError(errorText(data.error));
      update();
    };
    connection.on(ClientEvent.Sync, sync);
    connection.on(ClientEvent.AccountData, update);
    connection.on(RoomEvent.Timeline, update);
    connection.on(RoomEvent.Name, update);
    connection.on(RoomEvent.MyMembership, update);
    connection.on(RoomEvent.LocalEchoUpdated, update);
    connection.on(MatrixEventEvent.Decrypted, update);
    const start = async () => {
      try {
        if (disposed) return;
        setStatus('Klargjør kryptering …');
        await initAsync(cryptoWasmUrl);
        await connection.initRustCrypto({ cryptoDatabasePrefix: `gnomguttan-matrix-${encodeURIComponent(`${session.baseUrl}|${session.userId}|${session.deviceId}`)}` });
        if (disposed) return;
        setClient(connection); setCryptoReady(true);
        await connection.startClient({ initialSyncLimit: 40 });
        if (!disposed) await new Promise<void>(resolve => { release = resolve; });
      } finally { connection.stopClient(); connection.removeAllListeners(); }
    };
    // A persistent crypto store must only be opened by one client, including StrictMode remounts and other tabs.
    if (!navigator.locks) setError('Denne nettleseren mangler støtte for sikker lagring av Matrix-økten. Bruk en oppdatert nettleser over HTTPS.');
    else {
      setStatus('Venter på Matrix-økten i en annen fane …');
      void navigator.locks.request(`gnomguttan-matrix-${session.baseUrl}|${session.userId}|${session.deviceId}`, { signal: abort.signal }, start)
        .catch(reason => { if (!disposed) { setCryptoReady(false); setError(`Kunne ikke starte kryptering: ${errorText(reason)}`); } });
    }
    return () => { disposed = true; abort.abort(); release?.(); secretKey.current = null; connection.stopClient(); };
  }, [session]);

  const rooms = client?.getRooms().filter(room => ['join', 'invite'].includes(room.getMyMembership())).sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp()) || [];
  const directIds = new Set(Object.values(client?.getAccountData(EventType.Direct)?.getContent() || {}).flat());
  const openRoom = (roomId: string) => { select(roomId); setMobileChat(true); refresh(value => value + 1); };
  const room = client?.getRoom(selected || rooms.find(item => item.getMyMembership() === 'join')?.roomId || '');

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const url = new URL(server.includes('://') ? server.trim() : `https://${server.trim()}`);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Bruk en HTTPS-adresse til Matrix-serveren.');
      if (url.username || url.password || url.search || url.hash) throw new Error('Oppgi serveradressen uten brukernavn, passord eller parametere.');
      const baseUrl = url.href.replace(/\/$/, '');
      const connection = createClient({ baseUrl });
      const flows = await connection.loginFlows();
      if (!flows.flows.some(flow => flow.type === 'm.login.password')) throw new Error('Denne serveren støtter ikke passordinnlogging. Chat2.0 krever foreløpig passordinnlogging.');
      const result = await connection.login('m.login.password', { identifier: { type: 'm.id.user', user: username.trim() }, password, initial_device_display_name: 'Gnomguttan Chat2.0' });
      const next = { baseUrl, accessToken: result.access_token, userId: result.user_id, deviceId: result.device_id };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* The current session still works without storage. */ }
      setPassword(''); setSession(next);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await client?.logout(); }
    catch (reason) { setError(`Kunne ikke avslutte økten på serveren: ${errorText(reason)}`); setBusy(false); return; }
    sessionStorage.removeItem(SESSION_KEY); setSession(null); setClient(null); select(''); setSettings(false); setBusy(false);
  }
  async function join(target: string) {
    if (!client || !target.trim()) return;
    setBusy(true); setError('');
    try { const joined = await client.joinRoom(target.trim()); select(joined.roomId); setShowJoin(false); setMobileChat(true); refresh(value => value + 1); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!client || !profileName.trim()) return;
    setBusy(true); setError('');
    try { await client.setDisplayName(profileName.trim()); setProfile(current => ({ ...current, name: profileName.trim() })); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  async function updateAvatar(file?: File) {
    if (!client || !file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { setError('Velg et PNG-, JPEG-, WebP- eller GIF-bilde.'); return; }
    setBusy(true); setError('');
    try { const upload = await client.uploadContent(file); await client.setAvatarUrl(upload.content_uri); setProfile(current => ({ ...current, avatar: upload.content_uri })); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  function preference(key: string, value: boolean) {
    try { localStorage.setItem(`gnomguttan.matrix.${key}`, String(value)); } catch { /* Preferences still apply during this visit. */ }
  }

  async function restoreHistory(event: FormEvent) {
    event.preventDefault();
    if (!client?.getCrypto()) return;
    setBusy(true); setError(''); setRecoveryStatus('Gjenoppretter nøkler …');
    try {
      if (recoveryKey.trim()) secretKey.current = decodeRecoveryKey(recoveryKey.trim());
      const crypto = client.getCrypto()!;
      if (secretKey.current) {
        const keyId = await client.secretStorage.getDefaultKeyId();
        if (!keyId || !await client.secretStorage.checkKey(secretKey.current, (await client.secretStorage.getKey(keyId))![1])) throw new Error('Gjenopprettingsnøkkelen passer ikke til denne kontoen.');
        if (await crypto.userHasCrossSigningKeys()) await crypto.bootstrapCrossSigning({ setupNewCrossSigning: false });
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      }
      const result = await crypto.restoreKeyBackup();
      await Promise.all(client.getRooms().flatMap(item => item.getLiveTimeline().getEvents())
        .filter(message => message.isDecryptionFailure()).map(message => client.decryptEventIfNeeded(message).catch(() => undefined)));
      setRecoveryStatus(`${result.imported} meldingsnøkler gjenopprettet.`); setRecoveryKey('');
      refresh(value => value + 1);
    } catch (reason) { setRecoveryStatus(''); setError(`Kunne ikke gjenopprette historikken: ${errorText(reason)}`); }
    finally { secretKey.current = null; setBusy(false); }
  }

  return <section aria-label={embedded ? "Chat2.0-widget" : "Chat2.0"} className={`${styles.page} ${embedded ? styles.widget : ''}`}>
    {embedded && <header className={styles.widgetHeading}>{session && mobileChat ? <button className={styles.widgetBack} aria-label="Tilbake til samtaler" onClick={() => { setMobileChat(false); setError(''); }}><MatrixIcon name="back" size={18}/><span>Samtaler</span></button> : <h2>Chat2.0</h2>}<Link to="/chat2" aria-label="Åpne full Chat2.0">Åpne chat ↗</Link></header>}
    {error && <div className={styles.error} role="alert"><span>{error}</span><button className={styles.iconButton} aria-label="Lukk feilmelding" onClick={() => setError('')}><MatrixIcon name="close" size={16}/></button></div>}
    {!session ? <div className={styles.loginWrap}><form className={styles.login} onSubmit={login}>
      <MatrixIcon name="chat" size={36}/><h2>Din Matrix-chat</h2><p>Logg inn og fortsett samtalen med gjengen.</p>
      <label>Matrix-server<input required placeholder="https://matrix.example.no" autoComplete="url" value={server} onChange={event => setServer(event.target.value)} /></label>
      <label>Brukernavn<input required placeholder="@bruker:example.no" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
      <label>Passord<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className={styles.primary} disabled={busy}>{busy ? 'Logger inn …' : 'Logg inn'}</button>
      <small>Innloggingen er separat fra Gnomguttan. Krypteringsnøkler lagres lokalt i nettleseren.</small>
    </form></div> : <div className={`${styles.client} ${!embedded && mobileChat ? styles.mobileChat : ''}`}>
      {(!embedded || !mobileChat) && <aside className={styles.sidebar}>
        <div className={styles.sidebarHeading}><h2>Samtaler</h2><button className={styles.iconButton} aria-label="Legg til samtale" title="Rom, direktemelding eller space" onClick={() => setShowJoin(true)}><MatrixIcon name="plus"/></button></div>
        <label className={styles.search}><MatrixIcon name="search" size={17}/><input aria-label="Søk i rom" placeholder="Søk i samtaler" value={search} onChange={event => setSearch(event.target.value)}/></label>
        <div className={styles.sidebarLabel}><span>Dine samtaler</span><small>{rooms.length}</small></div>
        <nav aria-label="Matrix-rom" className={styles.roomList}>{rooms.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => {
          const last = [...item.getLiveTimeline().getEvents()].reverse().find(event => isDisplayMessage(event.getType()));
          const content = last?.getContent()['m.new_content'] || last?.getContent();
          const preview = item.getMyMembership() === 'invite' ? 'Du er invitert' : last?.isRedacted() ? 'Melding slettet' : last?.getType() === 'm.room.encrypted' || last?.isDecryptionFailure() ? 'Kryptert melding' : parseGeoUri(content?.geo_uri || content?.body) ? 'Delt posisjon' : content?.msgtype === 'm.audio' ? 'Lydmelding' : content?.body || (last ? 'Avstemning' : 'Start samtalen');
          const unread = item.getUnreadNotificationCount();
          return <button key={item.roomId} className={`${styles.roomRow} ${room?.roomId === item.roomId ? styles.active : ''}`} aria-current={room?.roomId === item.roomId ? 'page' : undefined} onClick={() => { select(item.roomId); setMobileChat(true); setError(''); }}>
            {client && <MatrixAvatar client={client} name={item.name} mxc={item.currentState.getStateEvents(EventType.RoomAvatar, '')?.getContent().url} large/>}
            <span className={styles.roomRowText}><span><strong>{item.name}</strong>{last && <time>{new Date(last.getTs()).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</time>}</span><span><small>{item.isSpaceRoom() ? 'Space · Rom og samtaler' : directIds.has(item.roomId) ? `DM · ${preview}` : preview}</small>{unread > 0 && <b className={styles.unread}>{unread > 99 ? '99+' : unread}</b>}</span></span>
          </button>;
        })}</nav>
        {!rooms.length && <p className={styles.sidebarEmpty}>{status === 'Tilkoblet' ? 'Bli med i et rom for å starte en samtale.' : status}</p>}
        {search && !rooms.some(item => item.name.toLowerCase().includes(search.toLowerCase())) && <p className={styles.sidebarEmpty}>Ingen rom passer søket.</p>}
        <button className={styles.accountRow} onClick={() => setSettings(true)} aria-label="Åpne Matrix-innstillinger">
          {client && <MatrixAvatar client={client} name={profile.name || session.userId} mxc={profile.avatar}/>}
          <span><strong>{profile.name || session.userId}</strong><small><i className={status === 'Tilkoblet' ? styles.online : ''}/>{status}</small></span><MatrixIcon name="settings" size={19}/>
        </button>
      </aside>}
      {(!embedded || mobileChat) && (client && room ? room.getMyMembership() === 'invite' ? <div className={styles.empty}><MatrixIcon name="chat" size={40}/><h2>{room.name}</h2><p>Du er invitert til dette rommet.</p><button className={styles.primary} disabled={busy} onClick={() => void join(room.roomId)}>Godta invitasjon</button><button className={styles.textButton} onClick={() => setMobileChat(false)}>Tilbake til romlisten</button></div> : room.isSpaceRoom() ? <MatrixSpaceView key={room.roomId} client={client} room={room} revision={revision} onOpen={openRoom} onLeft={() => { select(''); setMobileChat(false); }} onBack={() => setMobileChat(false)}/> : <MatrixRoomView key={room.roomId} client={client} room={room} revision={revision} ready={cryptoReady} compact={compact} showTime={showTime} onError={setError} onLeft={() => { select(''); setMobileChat(false); }} onBack={() => setMobileChat(false)}/> : <div className={styles.empty}><MatrixIcon name="chat" size={44}/><h2>En plass for samtalene</h2><p>Velg et rom i sidemenyen, eller bli med i et nytt.</p><button className={styles.textButton} onClick={() => setShowJoin(true)}>Legg til samtale</button></div>)}
      {showJoin && client && <MatrixAddConversation client={client} onClose={() => setShowJoin(false)} onOpen={openRoom}/>}
      {client && <MatrixModal title="Innstillinger" open={settings} onClose={() => setSettings(false)}>
        <div className={styles.settingsSections}>
          <section><h3>Profil</h3><div className={styles.profileRow}><MatrixAvatar client={client} name={profile.name || session.userId} mxc={profile.avatar} large/><div><strong>{profile.name || session.userId}</strong><small>{session.userId}</small></div><button disabled={busy} onClick={() => avatarInput.current?.click()}>Endre bilde</button></div><input hidden type="file" ref={avatarInput} accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { void updateAvatar(event.target.files?.[0]); event.target.value = ''; }}/><form className={styles.profileForm} onSubmit={saveProfile}><label>Visningsnavn<input value={profileName} maxLength={100} onChange={event => setProfileName(event.target.value)}/></label><button className={styles.primary} disabled={busy || !profileName.trim() || profileName.trim() === profile.name}>Lagre</button></form></section>
          <section><h3>Utseende</h3><label className={styles.settingRow}><span><strong>Kompakte meldinger</strong><small>Mer av historikken på skjermen.</small></span><input type="checkbox" checked={compact} onChange={event => { setCompact(event.target.checked); preference('compact', event.target.checked); }}/></label><label className={styles.settingRow}><span><strong>Vis klokkeslett</strong><small>Tidspunkt ved siden av avsender.</small></span><input type="checkbox" checked={showTime} onChange={event => { setShowTime(event.target.checked); preference('timestamps', event.target.checked); }}/></label></section>
          <section><h3>Kryptering og enheter</h3>{cryptoReady ? <><MatrixVerification client={client} onRequest={() => setSettings(true)}/><details className={styles.security}><summary>Gjenopprett eldre meldinger</summary><form className={styles.settingsForm} onSubmit={restoreHistory}><label>Gjenopprettingsnøkkel<input type="password" autoComplete="off" value={recoveryKey} onChange={event => setRecoveryKey(event.target.value)}/></label><small>Bruk nøkkelen fra Matrix-kontoen din, eller verifiser med en annen enhet først.</small><button disabled={busy}>{busy ? 'Gjenoppretter …' : 'Gjenopprett historikk'}</button>{recoveryStatus && <p role="status">{recoveryStatus}</p>}</form></details></> : <p>{status}</p>}</section>
          <section><h3>Konto</h3><dl className={styles.accountInfo}><dt>Server</dt><dd>{session.baseUrl}</dd><dt>Enhet</dt><dd>{session.deviceId}</dd></dl><button className={styles.logoutRow} disabled={busy} onClick={() => void logout()}><MatrixIcon name="logout" size={18}/>Logg ut av Matrix</button><small>Dette avslutter bare Matrix-økten.</small></section>
      
    {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </MatrixModal>}
    </div>}
  </section>;
}
