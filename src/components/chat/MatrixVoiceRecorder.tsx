import { useEffect, useRef, useState } from 'react';
import { MatrixIcon, MatrixModal } from './MatrixUi';
import styles from '@/pages/Chat2Page.module.css';

export function MatrixVoiceRecorder({ onClose, onSend }: { onClose: () => void; onSend: (file: File, duration: number) => Promise<void> }) {
  const [recording, setRecording] = useState(false); const [requesting, setRequesting] = useState(false);
  const [elapsed, setElapsed] = useState(0); const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0); const [preview, setPreview] = useState('');
  const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const started = useRef(0); const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (recorder.current) { recorder.current.onstop = null; recorder.current.onerror = null; if (recorder.current.state !== 'inactive') recorder.current.stop(); } stream.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => { const seconds = Math.floor((Date.now() - started.current) / 1000); setElapsed(seconds); if (seconds >= 300 && recorder.current?.state === 'recording') recorder.current.stop(); }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Denne nettleseren støtter ikke lydopptak. Bruk en oppdatert nettleser over HTTPS.'); return; }
    setRequesting(true); setError(''); setFile(null);
    try {
      const source = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { source.getTracks().forEach(track => track.stop()); return; }
      stream.current = source;
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(source, mimeType ? { mimeType } : undefined); recorder.current = next;
      const chunks: Blob[] = [];
      next.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        source.getTracks().forEach(track => track.stop()); stream.current = null;
        if (!mounted.current) return;
        setRecording(false); const milliseconds = Date.now() - started.current;
        const blob = new Blob(chunks, { type: next.mimeType || 'audio/webm' });
        if (!blob.size) { setError('Opptaket var tomt. Prøv igjen.'); return; }
        const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        setDuration(milliseconds); setFile(new File([blob], `Lydmelding.${extension}`, { type: blob.type }));
      };
      next.onerror = () => { source.getTracks().forEach(track => track.stop()); if (mounted.current) { setRecording(false); setError('Lydopptaket feilet. Prøv igjen.'); } };
      started.current = Date.now(); setElapsed(0); next.start(); setRecording(true);
    } catch (reason) {
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (mounted.current) setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'Mikrofontilgang ble avslått. Tillat mikrofonen i nettleseren for å ta opp.' : 'Kunne ikke starte mikrofonen.');
    } finally { if (mounted.current) setRequesting(false); }
  }
  async function send() {
    if (!file || sending) return;
    setSending(true); setError('');
    try { await onSend(file, duration); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke sende lydmeldingen.'); }
    finally { if (mounted.current) setSending(false); }
  }
  return <MatrixModal title="Lydmelding" onClose={() => { if (!sending) onClose(); }}><div className={styles.voiceRecorder}>
    <div className={`${styles.voiceMic} ${recording ? styles.recording : ''}`}><MatrixIcon name="mic" size={32}/></div>
    {recording ? <><strong role="status">Tar opp · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</strong><button className={styles.primary} onClick={() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }}>Stopp opptak</button></> : file ? <><strong>Lytt før du sender</strong><audio aria-label="Forhåndslytt lydmelding" controls src={preview}/><div><button disabled={sending} onClick={() => void start()}>Ta opp på nytt</button><button className={styles.primary} disabled={sending} onClick={() => void send()}>{sending ? 'Sender …' : 'Send lydmelding'}</button></div></> : <><p>Ta opp en lydmelding på opptil fem minutter.</p><button className={styles.primary} disabled={requesting} onClick={() => void start()}>{requesting ? 'Åpner mikrofonen …' : 'Start opptak'}</button></>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div></MatrixModal>;
}
