import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { matrixCall } from '@/services/matrix';
import { MatrixNotice, MatrixButton } from './MatrixForms';
import type { MatrixMessage } from '@/types/matrix';
export function MatrixPollCard({ roomId, message }: { roomId: string; message: MatrixMessage }) {
  const { tokens, font } = useTheme(); const poll = message.poll!; const [selected, setSelected] = useState<string[] | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function action(method: string, args = {}) { if (busy) return; setBusy(true); setError(''); try { await matrixCall(method, { id: roomId, eventId: message.id, ...args }); setSelected(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Avstemningen kunne ikke oppdateres.'); } finally { setBusy(false); } }
  const checked = selected || poll.myVote;
  return <View style={{ gap: 10, minWidth: 210, maxWidth: '100%' }}><Text style={{ color: tokens.textMuted, fontSize: 11, fontFamily: font(700), textTransform: 'uppercase' }}>{poll.ended ? 'Avsluttet avstemning' : 'Avstemning'}</Text><Text style={{ color: tokens.textPrimary, fontFamily: font(700), fontSize: 17 }}>{poll.question}</Text>
    {poll.answers.map(answer => <Pressable key={answer.id} accessibilityRole="checkbox" accessibilityState={{ checked: checked.includes(answer.id), disabled: poll.ended || busy }} disabled={poll.ended || busy} onPress={() => { if (poll.maxSelections === 1) void action('votePoll', { answers: [answer.id] }); else setSelected(old => (old || poll.myVote).includes(answer.id) ? (old || poll.myVote).filter(id => id !== answer.id) : (old || poll.myVote).length < poll.maxSelections ? [...(old || poll.myVote), answer.id] : old); }} style={{ borderWidth: 1, borderColor: checked.includes(answer.id) ? tokens.accent : tokens.border, backgroundColor: tokens.bgCard, borderRadius: 12, overflow: 'hidden', padding: 12, flexDirection: 'row', gap: 8 }}>
      {poll.showResults && poll.total > 0 && <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${answer.count / poll.total * 100}%`, backgroundColor: tokens.bgHover }} />}
      <Text style={{ flex: 1, color: tokens.textPrimary }}>{checked.includes(answer.id) ? '✓ ' : ''}{answer.text}</Text>{poll.showResults && <Text style={{ color: tokens.textMuted }}>{answer.count}</Text>}
    </Pressable>)}
    {poll.maxSelections > 1 && !poll.ended && <MatrixButton title="Stem" disabled={busy || !checked.length} onPress={() => void action('votePoll', { answers: checked })} />}
    <MatrixNotice text={poll.loading ? 'Henter stemmer …' : poll.showResults ? `${poll.total} stemmer` : 'Resultatet vises når avstemningen avsluttes.'} />
    {poll.canEnd && !poll.ended && <MatrixButton title="Avslutt avstemning" secondary disabled={busy} onPress={() => void action('endPoll')} />}
    <MatrixNotice text={error || poll.error} error />{poll.error && <MatrixButton title="Hent stemmene på nytt" secondary onPress={() => void action('pollRefresh')} />}
  </View>;
}
