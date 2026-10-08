import { useEffect, useMemo, useState } from 'react';
import { MatrixEventEvent, RoomEvent, type MatrixClient, type MatrixEvent, type Room } from 'matrix-js-sdk';
import { Poll, PollEvent } from 'matrix-js-sdk/lib/models/poll';
import { PollStartEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollStartEvent';
import { PollResponseEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollResponseEvent';
import { PollEndEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollEndEvent';
import { M_POLL_KIND_DISCLOSED } from 'matrix-js-sdk/lib/@types/polls';
import type { TimelineEvents } from 'matrix-js-sdk/lib/@types/event';
import styles from '@/pages/Chat2Page.module.css';

export function sendPollEvent(client: MatrixClient, roomId: string, event: { type: string; content: object }) {
  return client.sendEvent(roomId, event.type as keyof TimelineEvents, event.content as never);
}
export function createPoll(client: MatrixClient, roomId: string, question: string, answers: string[]) {
  return sendPollEvent(client, roomId, PollStartEvent.from(question, answers, M_POLL_KIND_DISCLOSED, 1).serialize());
}

export function MatrixPoll({ client, room, event }: { client: MatrixClient; room: Room; event: MatrixEvent }) {
  const poll = useMemo(() => {
    try { return room.polls.get(event.getId()!) || new Poll(event, client, room); } catch { return null; }
  }, [event, room, client]);
  const [responses, setResponses] = useState<MatrixEvent[]>([]);
  const [ended, setEnded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!poll) return;
    let disposed = false;
    const update = () => {
      setEnded(poll.isEnded);
      void poll.getResponses().then(relations => { if (!disposed && relations) { setResponses([...relations.getRelations()]); setError(''); } }).catch(() => { if (!disposed) setError('Kunne ikke hente alle stemmene.'); });
    };
    const incoming = (value: MatrixEvent) => {
      if (value.getRelation()?.event_id === event.getId()) { poll.onNewRelation(value); update(); }
    };
    poll.on(PollEvent.Responses, update); poll.on(PollEvent.End, update);
    client.on(RoomEvent.Timeline, incoming);
    client.on(MatrixEventEvent.Decrypted, incoming);
    update();
    return () => { disposed = true; poll.off(PollEvent.Responses, update); poll.off(PollEvent.End, update); client.off(RoomEvent.Timeline, incoming); client.off(MatrixEventEvent.Decrypted, incoming); };
  }, [client, event, poll]);
  if (!poll) return <p>Avstemningen kunne ikke leses.</p>;
  const answers = poll.pollEvent.answers;
  const latest = new Map<string, MatrixEvent>();
  for (const response of responses) {
    if (response.isRedacted() || response.isDecryptionFailure() || response.status === 'not_sent') continue;
    const sender = response.getSender(); if (!sender) continue;
    if (!latest.has(sender) || latest.get(sender)!.getTs() <= response.getTs()) latest.set(sender, response);
  }
  const votes = [...latest.values()].flatMap(response => {
    const content = response.getContent();
    const ids: unknown = (content['m.poll.response'] || content['org.matrix.msc3381.poll.response'])?.answers;
    if (!Array.isArray(ids) || ids.length > poll.pollEvent.maxSelections || new Set(ids).size !== ids.length || ids.some(id => !answers.some(answer => answer.id === id))) return [];
    return [{ sender: response.getSender(), ids: ids as string[] }];
  });
  const myVote = votes.find(vote => vote.sender === client.getUserId())?.ids || [];
  const showResults = ended || M_POLL_KIND_DISCLOSED.matches(poll.pollEvent.rawKind);
  async function act(operation: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await operation(); } catch { setError('Kunne ikke sende avstemningshandlingen. Prøv igjen.'); }
    finally { setBusy(false); }
  }
  return <div className={styles.pollCard}>
    <span className={styles.pollLabel}>{ended ? 'Avsluttet avstemning' : 'Avstemning'}</span>
    <h3>{poll.pollEvent.question.text}</h3>
    {answers.map(answer => {
      const count = votes.filter(vote => vote.ids.includes(answer.id)).length;
      const checked = (selected.length ? selected : myVote).includes(answer.id);
      return <button type="button" key={answer.id} className={styles.pollAnswer} disabled={busy || ended} aria-pressed={checked} onClick={() => {
        if (poll.pollEvent.maxSelections === 1) void act(() => sendPollEvent(client, room.roomId, PollResponseEvent.from([answer.id], event.getId()!).serialize()));
        else setSelected(current => current.includes(answer.id) ? current.filter(id => id !== answer.id) : current.length < poll.pollEvent.maxSelections ? [...current, answer.id] : current);
      }}><span className={styles.pollBar} style={{ width: showResults && votes.length ? `${count / votes.length * 100}%` : '0%' }}/><span>{checked ? '✓ ' : ''}{answer.text}</span>{showResults && <small>{count}</small>}</button>;
    })}
    {poll.pollEvent.maxSelections > 1 && !ended && <button disabled={busy || !selected.length} onClick={() => void act(() => sendPollEvent(client, room.roomId, PollResponseEvent.from(selected, event.getId()!).serialize()))}>Stem</button>}
    <div className={styles.pollFooter}><small>{showResults ? `${votes.length} stemmer` : 'Resultatet vises når avstemningen avsluttes'}</small>{!ended && event.getSender() === client.getUserId() && <button disabled={busy} onClick={() => void act(() => sendPollEvent(client, room.roomId, PollEndEvent.from(event.getId()!, 'Avstemningen er avsluttet.').serialize()))}>Avslutt</button>}</div>
    {error && <small role="alert">{error}</small>}
  </div>;
}
