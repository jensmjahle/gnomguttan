import { useState } from 'react';
import { Alert, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/data/queryClient';
import { createInvite, createResetLink, deleteInvite, listInvites, listUsersForAdmin, setAdminRole, type CreatedLink } from '@/services/auth';
import { errorText } from '@/services/appApi';
import { formatRelativeTime } from '@/utils/relativeTime.generated';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Divider, ErrorBox, Field, IconButton, Loading, Row, Screen, Section, T } from '@/components/ui';
import { ActionSheet } from '@/components/Sheet';
import type { AdminUser } from '@/services/auth';

export function AdminScreen() {
  const users = useQuery({ queryKey: qk.adminUsers, queryFn: listUsersForAdmin });
  const invites = useQuery({ queryKey: qk.invites, queryFn: listInvites });
  const [note, setNote] = useState('');
  const [link, setLink] = useState<(CreatedLink & { label: string }) | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); void users.refetch(); void invites.refetch(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };

  return (
    <Screen refreshing={users.isRefetching} onRefresh={() => { void users.refetch(); void invites.refetch(); }}>
      <ErrorBox message={error || (users.error ? errorText(users.error) : '')} />
      {link ? (
        <Card>
          <T weight={700}>{link.label}</T>
          <T selectable size={13}>{link.url}</T>
          <T size={12} muted>Gyldig til {new Date(link.expiresAt).toLocaleString('nb-NO')}. Lenken vises bare nå.</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small icon="copy-outline" title="Kopier" onPress={() => void Clipboard.setStringAsync(link.url)} />
            <Button small variant="secondary" icon="share-outline" title="Del" onPress={() => void Share.share({ message: link.url })} />
            <Button small variant="ghost" title="Lukk" onPress={() => setLink(null)} />
          </View>
        </Card>
      ) : null}
      <Section title="Inviter noen">
        <View style={{ padding: 14, gap: 10 }}>
          <Field label="Notat (hvem er det til?)" value={note} onChangeText={setNote} maxLength={100} />
          <Button title="Lag invitasjonslenke" icon="person-add-outline" busy={busy} onPress={() => void run(async () => { const created = await createInvite(note.trim()); setNote(''); setLink({ ...created, label: 'Invitasjonslenke' }); })} />
        </View>
        {(invites.data ?? []).map((invite) => (
          <View key={invite.id}>
            <Divider />
            <Row title={invite.note || 'Invitasjon'} subtitle={`Av ${invite.createdBy.name} · utløper ${new Date(invite.expiresAt).toLocaleDateString('nb-NO')}`} chevron={false} right={<IconButton icon="trash-outline" label="Slett invitasjon" onPress={() => void run(() => deleteInvite(invite.id).then(() => {}))} />} />
          </View>
        ))}
      </Section>
      <Section title="Brukere">
        {users.isLoading ? <Loading /> : (users.data ?? []).map((user, index) => (
          <View key={user.uid}>
            {index ? <Divider /> : null}
            <Row
              title={`${user.name}${user.isAdmin ? ' · admin' : ''}`}
              subtitle={`${user.email} · ${user.lastSeenAt ? `sist sett ${formatRelativeTime(user.lastSeenAt)}` : 'aldri sett'}${user.hasAccount ? '' : ' · ingen konto ennå'}`}
              right={<Avatar uid={user.uid} name={user.name} avatarUpdatedAt={user.avatarUpdatedAt} size={30} />}
              onPress={() => setSelected(user)}
            />
          </View>
        ))}
      </Section>
      <ActionSheet
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name}
        actions={selected ? [
          { label: 'Lag lenke for nytt passord', icon: 'key-outline', onPress: () => void run(async () => { const created = await createResetLink(selected.uid); setLink({ ...created, label: `Nytt passord for ${selected.name}` }); }) },
          { label: selected.isAdmin ? 'Fjern som administrator' : 'Gjør til administrator', icon: 'shield-outline', onPress: () => Alert.alert(selected.isAdmin ? 'Fjerne admin?' : 'Gjøre til admin?', selected.name, [{ text: 'Avbryt', style: 'cancel' }, { text: 'Ja', onPress: () => void run(() => setAdminRole(selected.uid, !selected.isAdmin).then(() => {})) }]) },
        ] : []}
      />
    </Screen>
  );
}
