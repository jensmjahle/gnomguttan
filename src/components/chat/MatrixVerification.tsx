import { useEffect, useState } from 'react';
import { CryptoEvent, VerificationPhase, VerificationRequestEvent, VerifierEvent, type ShowSasCallbacks, type VerificationRequest, type Verifier } from 'matrix-js-sdk/lib/crypto-api';
import type { MatrixClient } from 'matrix-js-sdk';
import styles from '@/pages/Chat2Page.module.css';

export function MatrixVerification({ client, onRequest }: { client: MatrixClient; onRequest?: () => void }) {
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [phase, setPhase] = useState<VerificationPhase | null>(null);
  const [sas, setSas] = useState<ShowSasCallbacks | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const incoming = (value: VerificationRequest) => {
      if (value.isSelfVerification) { setRequest(value); setError(''); onRequest?.(); }
    };
    client.on(CryptoEvent.VerificationRequestReceived, incoming);
    return () => { client.off(CryptoEvent.VerificationRequestReceived, incoming); };
  }, [client, onRequest]);
  useEffect(() => {
    setSas(null);
    if (!request) { setPhase(null); return; }
    let active = true;
    let attached: Verifier | undefined;
    const show = (value: ShowSasCallbacks) => { if (active) setSas(value); };
    const update = () => {
      if (!active) return;
      setPhase(request.phase);
      if (request.phase === VerificationPhase.Done || request.phase === VerificationPhase.Cancelled) setSas(null);
      const verifier = request.verifier;
      if (verifier && verifier !== attached) {
        attached?.off(VerifierEvent.ShowSas, show);
        attached = verifier;
        verifier.on(VerifierEvent.ShowSas, show);
        const existing = verifier.getShowSasCallbacks();
        if (existing) show(existing);
        void verifier.verify().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Verifiseringen feilet.'); });
      }
    };
    request.on(VerificationRequestEvent.Change, update); update();
    return () => { active = false; request.off(VerificationRequestEvent.Change, update); attached?.off(VerifierEvent.ShowSas, show); };
  }, [request]);
  async function action(operation: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Verifiseringen feilet.'); }
    finally { setBusy(false); }
  }
  const pending = phase === VerificationPhase.Requested || phase === VerificationPhase.Ready || phase === VerificationPhase.Started;
  return <div className={styles.notice}>
    <strong>Enhetsverifisering</strong>
    {!pending && <button disabled={busy} onClick={() => void action(async () => { const next = await client.getCrypto()!.requestOwnUserVerification(); setRequest(next); })}>Verifiser med en annen enhet</button>}
    {pending && <><p>Åpne en innlogget Matrix-klient på en annen enhet og godta forespørselen. Enhet: {request?.otherDeviceId || 'venter på svar'}.</p>
      {phase === VerificationPhase.Requested && !request?.initiatedByMe && <button disabled={busy} onClick={() => void action(() => request!.accept())}>Godta forespørsel</button>}
      {phase === VerificationPhase.Ready && <button disabled={busy} onClick={() => void action(() => request!.startVerification('m.sas.v1'))}>Sammenlign emojier</button>}
      {sas && <><p>Sammenlign alle emojiene eller tallene på begge enhetene før du bekrefter.</p><div className={styles.sas}>{sas.sas.emoji?.map(([emoji, name], index) => <span key={index} title={name}>{emoji}<small>{name}</small></span>)}</div>{sas.sas.decimal && <p>{sas.sas.decimal.join(' · ')}</p>}<button disabled={busy} onClick={() => void action(() => sas.confirm())}>De stemmer</button><button disabled={busy} onClick={() => sas.mismatch()}>De stemmer ikke</button></>}
      <button disabled={busy} onClick={() => void action(() => request!.cancel())}>Avbryt</button></>}
    {phase === VerificationPhase.Done && <p role="status">Enheten er verifisert.</p>}
    {phase === VerificationPhase.Cancelled && <p role="status">Verifiseringen ble avbrutt eller utløp.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
