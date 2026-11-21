import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { qk, queryClient } from '@/data/queryClient';
import { COLUMNS, createIssue, issueColumn } from '@/services/dev';
import { loadDevData } from '@/services/dev';
import { errorText } from '@/services/appApi';
import { formatRelativeTime } from '@/utils/relativeTime.generated';
import { Button, Card, Chip, ErrorBox, Field, Loading, Screen, T } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import type { RootStackParamList } from '@/navigation/types';
import type { IssueColumnId } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dev'>;
type Tab = 'issues' | 'prs' | 'releases' | 'actions';

export function DevScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const dev = useQuery({ queryKey: qk.dev, queryFn: loadDevData });
  const [tab, setTab] = useState<Tab>('issues');
  const [column, setColumn] = useState<IssueColumnId>('todo');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const issues = useMemo(() => (dev.data?.issues ?? []).filter((issue) => issueColumn(issue) === column), [dev.data, column]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const issue = await createIssue({ title: title.trim(), body: body.trim() || undefined, labels });
      setTitle(''); setBody(''); setLabels([]); setCreating(false);
      void queryClient.invalidateQueries({ queryKey: qk.dev });
      navigation.navigate('DevIssue', { number: issue.number, title: issue.title });
    } catch (reason) { setError(errorText(reason, 'Kunne ikke lage issuen.')); }
    finally { setBusy(false); }
  };

  return (
    <Screen refreshing={dev.isRefetching} onRefresh={() => void dev.refetch()}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip icon="bug-outline" label={`Issues ${dev.data?.issues.length ?? ''}`} selected={tab === 'issues'} onPress={() => setTab('issues')} />
        <Chip icon="git-pull-request-outline" label="Pull requests" selected={tab === 'prs'} onPress={() => setTab('prs')} />
        <Chip icon="rocket-outline" label="Releaser" selected={tab === 'releases'} onPress={() => setTab('releases')} />
        <Chip icon="play-circle-outline" label="Actions" selected={tab === 'actions'} onPress={() => setTab('actions')} />
      </ScrollView>
      {dev.isLoading && !dev.data ? <Loading /> : null}
      <ErrorBox message={dev.error && !dev.data ? errorText(dev.error, 'Kunne ikke hente fra GitHub.') : ''} onRetry={() => void dev.refetch()} />

      {tab === 'issues' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {COLUMNS.map((option) => <Chip key={option.id} label={`${option.name} ${(dev.data?.issues ?? []).filter((issue) => issueColumn(issue) === option.id).length}`} selected={column === option.id} onPress={() => setColumn(option.id)} />)}
            <View style={{ flex: 1 }} />
            <Button small icon="add" title="Ny" onPress={() => setCreating(true)} />
          </View>
          {issues.map((issue) => (
            <Card key={issue.number} onPress={() => navigation.navigate('DevIssue', { number: issue.number, title: issue.title })}>
              <T weight={700}><T weight={700} color={tokens.textMuted}>#{issue.number} </T>{issue.title}</T>
              <View style={styles.labels}>
                {issue.labels.map((label) => <View key={label.id} style={[styles.label, { backgroundColor: `#${label.color}33`, borderColor: `#${label.color}` }]}><T size={11}>{label.name}</T></View>)}
              </View>
              <T size={12} muted>{issue.user.login} · {formatRelativeTime(Date.parse(issue.updated_at))}{issue.comments ? ` · 💬 ${issue.comments}` : ''}{issue.assignees.length ? ` · ${issue.assignees.map((a) => a.login).join(', ')}` : ''}</T>
            </Card>
          ))}
          {!dev.isLoading && !issues.length ? <T muted>Ingen issues her.</T> : null}
        </>
      ) : null}

      {tab === 'prs' ? (dev.data?.pullRequests ?? []).map((pr) => (
        <Card key={pr.number} onPress={() => void Linking.openURL(pr.html_url)}>
          <T weight={700}><T weight={700} color={tokens.textMuted}>#{pr.number} </T>{pr.title}{pr.draft ? ' (utkast)' : ''}</T>
          <T size={12} muted>{pr.user.login} · {pr.head.ref} → {pr.base.ref} · {formatRelativeTime(Date.parse(pr.updated_at))}</T>
        </Card>
      )) : null}

      {tab === 'releases' ? (dev.data?.releases ?? []).map((release) => (
        <Card key={release.id} onPress={() => void Linking.openURL(release.html_url)}>
          <T weight={700}>{release.tag_name}{release.name && release.name !== release.tag_name ? ` · ${release.name}` : ''}{release.prerelease ? ' (pre-release)' : ''}</T>
          <T size={12} muted>{new Date(release.published_at).toLocaleString('nb-NO')}</T>
          {release.body ? <T size={13} numberOfLines={8}>{release.body}</T> : null}
        </Card>
      )) : null}

      {tab === 'actions' ? (dev.data?.workflowRuns ?? []).map((run) => (
        <Pressable key={run.id} onPress={() => void Linking.openURL(run.html_url)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name={run.status !== 'completed' ? 'time-outline' : run.conclusion === 'success' ? 'checkmark-circle' : run.conclusion === 'failure' ? 'close-circle' : 'remove-circle-outline'} size={22} color={run.status !== 'completed' ? tokens.warning : run.conclusion === 'success' ? tokens.success : run.conclusion === 'failure' ? tokens.error : tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <T weight={600}>{run.name}</T>
              <T size={12} muted numberOfLines={1}>{run.head_branch} · {run.head_commit?.message?.split('\n')[0]} · {formatRelativeTime(Date.parse(run.created_at))}</T>
            </View>
          </Card>
        </Pressable>
      )) : null}

      <Sheet visible={creating} onClose={() => setCreating(false)} title="Ny issue">
        <Field label="Tittel" value={title} onChangeText={setTitle} maxLength={200} />
        <Field label="Beskrivelse" value={body} onChangeText={setBody} multiline maxLength={20000} />
        <View style={styles.labels}>
          {(dev.data?.labels ?? []).map((label) => <Chip key={label.id} label={label.name} selected={labels.includes(label.name)} onPress={() => setLabels((current) => (current.includes(label.name) ? current.filter((l) => l !== label.name) : [...current, label.name]))} />)}
        </View>
        <ErrorBox message={error} />
        <Button title="Lag issue" busy={busy} disabled={!title.trim()} onPress={() => void submit()} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  label: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
});
