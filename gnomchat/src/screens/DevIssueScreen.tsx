import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { qk, queryClient } from '@/data/queryClient';
import { COLUMNS, addIssueComment, getIssueDetail, issueColumn, patchForColumn, patchIssue, uploadDevImage } from '@/services/dev';
import { errorText } from '@/services/appApi';
import { pickImage } from '@/utils/images';
import { formatRelativeTime } from '@/utils/relativeTime.generated';
import { MarkdownText } from '@/components/MarkdownText';
import { useTheme } from '@/theme/useTheme';
import { Button, Card, Chip, ErrorBox, Field, Loading, Screen, T } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DevIssue'>;

export function DevIssueScreen({ route }: Props) {
  const { number } = route.params;
  const { tokens } = useTheme();
  const detail = useQuery({ queryKey: ['devIssue', number], queryFn: () => getIssueDetail(number) });
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await detail.refetch(); void queryClient.invalidateQueries({ queryKey: qk.dev }); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };

  const data = detail.data;
  if (!data) return <Screen>{detail.error ? <ErrorBox message={errorText(detail.error)} onRetry={() => void detail.refetch()} /> : <Loading />}</Screen>;
  const { issue, comments, assignableUsers } = data;
  const column = issueColumn(issue);
  const assigned = new Set(issue.assignees.map((a) => a.login));

  return (
    <Screen refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()}>
      <Card>
        <T weight={800} size={19}>{issue.title}</T>
        <T size={12} muted>#{issue.number} · åpnet av {issue.user.login} {formatRelativeTime(Date.parse(issue.created_at))}</T>
        {issue.body ? <MarkdownText content={issue.body} contentType="text/markdown" color={tokens.textPrimary} /> : <T muted>Ingen beskrivelse.</T>}
        <Button small variant="ghost" icon="open-outline" title="Åpne på GitHub" onPress={() => void Linking.openURL(issue.html_url)} />
      </Card>
      <Card>
        <T weight={700}>Status</T>
        <View style={styles.wrap}>{COLUMNS.map((option) => <Chip key={option.id} label={option.name} selected={column === option.id} onPress={() => column !== option.id && void run(() => patchIssue(issue.number, patchForColumn(issue, option.id)))} />)}</View>
        <T weight={700}>Tildelt</T>
        <View style={styles.wrap}>
          {assignableUsers.map((user) => (
            <Chip key={user.login} label={user.login} selected={assigned.has(user.login)} onPress={() => void run(() => patchIssue(issue.number, { assignees: assigned.has(user.login) ? [...assigned].filter((l) => l !== user.login) : [...assigned, user.login] }))} />
          ))}
        </View>
      </Card>
      {comments.map((entry) => (
        <Card key={entry.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image source={{ uri: entry.user.avatar_url }} style={{ width: 22, height: 22, borderRadius: 11 }} />
            <T weight={700} size={13}>{entry.user.login}</T>
            <T size={11} muted>{formatRelativeTime(Date.parse(entry.created_at))}</T>
          </View>
          <MarkdownText content={entry.body} contentType="text/markdown" color={tokens.textPrimary} />
        </Card>
      ))}
      <Card>
        <Field label="Ny kommentar" value={comment} onChangeText={setComment} multiline maxLength={20000} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small variant="secondary" icon="image-outline" title="Bilde" disabled={busy} onPress={() => void pickImage({ maxSize: 1600 }).then(async (image) => {
            if (!image) return;
            setBusy(true);
            try { const { url } = await uploadDevImage(image.dataUrl); setComment((current) => `${current}${current ? '\n' : ''}![bilde](${url})`); }
            catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
          })} />
          <View style={{ flex: 1 }} />
          <Button small title="Kommenter" busy={busy} disabled={!comment.trim()} onPress={() => void run(async () => { await addIssueComment(issue.number, comment.trim()); setComment(''); })} />
        </View>
        <ErrorBox message={error} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 } });
