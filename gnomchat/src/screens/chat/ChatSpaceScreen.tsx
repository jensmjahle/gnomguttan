import { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { call } from '@/matrix/engine';
import { useMatrixStore } from '@/matrix/store';
import { MatrixAvatar } from '@/components/chat/MatrixAvatar';
import { Button, Divider, Empty, ErrorBox, IconButton, Loading, Row, Screen, Section } from '@/components/ui';
import { ActionSheet } from '@/components/Sheet';
import type { RootStackParamList } from '@/navigation/types';
import type { SpaceChild } from '@/matrix/protocol.generated';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatSpace'>;

/** A space: the rooms collected in it, to open or join. */
export function ChatSpaceScreen({ navigation, route }: Props) {
  const { roomId } = route.params;
  const rooms = useMatrixStore((s) => s.rooms);
  const [children, setChildren] = useState<SpaceChild[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <IconButton icon="settings-outline" label="Space-innstillinger" onPress={() => navigation.navigate('ChatRoomSettings', { roomId })} /> });
  }, [navigation, roomId]);

  const load = useCallback(async () => {
    setError('');
    try { setChildren(await call('spaceChildren', { roomId })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke hente rommene.'); }
  }, [roomId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = async (child: SpaceChild) => {
    if (child.isSpace) { navigation.push('ChatSpace', { roomId: child.roomId, title: child.name }); return; }
    setBusy(true);
    try {
      if (!child.joined) await call('join', { target: child.roomId });
      navigation.navigate('ChatRoom', { roomId: child.roomId, title: child.name });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke bli med.'); }
    finally { setBusy(false); }
  };

  const candidates = rooms.filter((room) => room.membership === 'join' && !room.isSpace && room.roomId !== roomId && !children?.some((child) => child.roomId === room.roomId));

  return (
    <Screen refreshing={false} onRefresh={() => void load()}>
      <ErrorBox message={error} onRetry={() => void load()} />
      {!children ? <Loading /> : children.length === 0 ? <Empty icon="albums-outline" title="Ingen rom i spacet ennå" /> : (
        <Section title="Rom i spacet">
          {children.map((child, index) => (
            <View key={child.roomId}>
              {index ? <Divider /> : null}
              <Row title={child.name} subtitle={`${child.isSpace ? 'Space' : child.joined ? 'Åpne' : 'Bli med'}${child.topic ? ` · ${child.topic}` : ''}`} right={<MatrixAvatar name={child.name} avatar={child.avatar} size={34} square={child.isSpace} />} onPress={busy ? undefined : () => void open(child)} />
            </View>
          ))}
        </Section>
      )}
      <Button variant="secondary" icon="add" title="Legg til et rom" onPress={() => setAdding(true)} />
      <ActionSheet
        visible={adding}
        onClose={() => setAdding(false)}
        title="Legg til rom i spacet"
        actions={candidates.map((room) => ({ label: room.name, icon: 'chatbubbles-outline', onPress: () => void call('addToSpace', { spaceId: roomId, roomId: room.roomId }).then(load).catch((e) => Alert.alert('Kunne ikke legge til', e instanceof Error ? e.message : '')) }))}
      />
    </Screen>
  );
}
