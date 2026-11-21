import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { call } from '@/matrix/engine';
import { useRoom } from '@/matrix/store';
import { MatrixAvatar } from '@/components/chat/MatrixAvatar';
import { Button, Chip, Divider, ErrorBox, Field, Loading, Row, Screen, Section, T } from '@/components/ui';
import { pickImage } from '@/utils/images';
import type { RootStackParamList } from '@/navigation/types';
import type { RoomDetails } from '@/matrix/protocol.generated';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoomSettings'>;

const JOIN_RULES = [{ value: 'invite', label: 'Bare inviterte' }, { value: 'public', label: 'Alle med adressen' }];
const HISTORY = [
  { value: 'joined', label: 'Fra de ble med' },
  { value: 'invited', label: 'Fra de ble invitert' },
  { value: 'shared', label: 'Alle medlemmer' },
  { value: 'world_readable', label: 'Alle' },
];

export function ChatRoomSettingsScreen({ navigation, route }: Props) {
  const { roomId } = route.params;
  const room = useRoom(roomId);
  const [details, setDetails] = useState<RoomDetails | null>(null);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [invitee, setInvitee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await call('roomDetails', { roomId });
      setDetails(next); setName(next.name); setTopic(next.topic);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke hente rommet.'); }
  }, [roomId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); if (done) setNotice(done); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Det gikk ikke.'); }
    finally { setBusy(false); }
  };

  if (!details) return <Screen>{error ? <ErrorBox message={error} onRetry={() => void load()} /> : <Loading />}</Screen>;
  const { canEdit } = details;

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <MatrixAvatar name={details.name} avatar={details.avatar} size={84} square={details.isSpace} />
        {canEdit.avatar ? <Button small variant="ghost" title="Endre bilde" disabled={busy} onPress={() => void pickImage({ maxSize: 800 }).then((image) => image && run(() => call('setRoomAvatar', { roomId, base64: image.base64, mimetype: image.mimetype }), 'Rombildet er oppdatert.'))} /> : null}
        <T size={12} muted>{details.members.filter((m) => m.membership === 'join').length} medlemmer · {details.encrypted ? '🔒 Ende-til-ende-kryptert' : 'Ikke kryptert'}</T>
      </View>
      {notice ? <T size={13} style={{ textAlign: 'center' }}>{notice}</T> : null}
      <ErrorBox message={error} />

      <Section title="Rommet">
        <View style={{ padding: 14, gap: 10 }}>
          <Field label="Navn" value={name} onChangeText={setName} editable={canEdit.name && !busy} maxLength={200} />
          <Field label="Beskrivelse" value={topic} onChangeText={setTopic} editable={canEdit.topic && !busy} multiline maxLength={2000} />
          {canEdit.joinRules ? (
            <View style={{ gap: 6 }}><T size={13} muted weight={600}>Hvem kan bli med?</T><View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{JOIN_RULES.map((rule) => <Chip key={rule.value} label={rule.label} selected={details.joinRule === rule.value} onPress={() => void run(() => call('updateRoom', { roomId, joinRule: rule.value }))} />)}</View></View>
          ) : null}
          {canEdit.history ? (
            <View style={{ gap: 6 }}><T size={13} muted weight={600}>Hvem kan lese historikken?</T><View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{HISTORY.map((rule) => <Chip key={rule.value} label={rule.label} selected={details.historyVisibility === rule.value} onPress={() => void run(() => call('updateRoom', { roomId, historyVisibility: rule.value }))} />)}</View></View>
          ) : null}
          {canEdit.name || canEdit.topic ? <Button title="Lagre" busy={busy} disabled={!name.trim() || (name === details.name && topic === details.topic)} onPress={() => void run(() => call('updateRoom', { roomId, name, topic }), 'Lagret.')} /> : <T size={12} muted>En romadministrator må endre innstillingene.</T>}
        </View>
      </Section>

      {details.canInvite ? (
        <Section title="Inviter">
          <View style={{ padding: 14, gap: 10 }}>
            <Field value={invitee} onChangeText={setInvitee} placeholder="@gnomen:gnomchat.gnomguttan.no" autoCapitalize="none" autoCorrect={false} />
            <Button title="Send invitasjon" icon="person-add-outline" busy={busy} disabled={!invitee.trim()} onPress={() => void run(async () => { await call('invite', { roomId, userId: invitee.trim() }); setInvitee(''); }, 'Invitasjonen er sendt.')} />
          </View>
        </Section>
      ) : null}

      <Section title={`Medlemmer · ${details.members.length}`}>
        {details.members.map((member, index) => (
          <View key={member.userId}>
            {index ? <Divider /> : null}
            <Row title={member.name} subtitle={`${member.userId}${member.membership === 'invite' ? ' · invitert' : member.powerLevel >= 100 ? ' · administrator' : member.powerLevel >= 50 ? ' · moderator' : ''}`} right={<MatrixAvatar name={member.name} avatar={member.avatar} size={30} />} chevron={false} />
          </View>
        ))}
      </Section>

      <Section title="Om rommet">
        <Row icon="finger-print-outline" title="Rom-ID" subtitle={details.roomId} onPress={() => void Clipboard.setStringAsync(details.roomId)} chevron={false} />
        {details.alias ? <><Divider /><Row icon="at-outline" title="Adresse" subtitle={details.alias} onPress={() => void Clipboard.setStringAsync(details.alias)} chevron={false} /></> : null}
        {!details.encrypted && !details.isSpace && canEdit.encryption ? (
          <><Divider /><Row icon="lock-closed-outline" title="Slå på ende-til-ende-kryptering" subtitle="Kan ikke slås av igjen." onPress={() => Alert.alert('Slå på kryptering?', 'Det kan ikke slås av igjen.', [{ text: 'Avbryt', style: 'cancel' }, { text: 'Slå på', onPress: () => void run(() => call('enableEncryption', { roomId }), 'Krypteringen er på.') }])} /></>
        ) : null}
        <Divider />
        <Row icon="exit-outline" danger title={details.isSpace ? 'Forlat spacet' : 'Forlat rommet'} onPress={() => Alert.alert(`Forlate ${room?.name ?? 'rommet'}?`, undefined, [{ text: 'Avbryt', style: 'cancel' }, { text: 'Forlat', style: 'destructive', onPress: () => void run(async () => { await call('leave', { roomId }); navigation.popToTop(); }) }])} />
      </Section>
    </Screen>
  );
}
