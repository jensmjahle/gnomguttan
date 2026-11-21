import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { queryClient, qk } from '@/data/queryClient';
import { createAlbum, deleteAlbum, loadAlbum, updateAlbum } from '@/services/albums';
import { errorText } from '@/services/appApi';
import { Button, ErrorBox, Field, Screen } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AlbumEditor'>;

export function AlbumEditorScreen({ navigation, route }: Props) {
  const albumId = route.params?.albumId;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!albumId) return;
    void loadAlbum(albumId).then((album) => { setTitle(album.title); setDescription(album.description ?? ''); }).catch((e) => setError(errorText(e)));
  }, [albumId]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      const album = albumId ? await updateAlbum(albumId, { title: title.trim(), description: description.trim() }) : await createAlbum({ title: title.trim(), description: description.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: qk.albums });
      if (albumId) { void queryClient.invalidateQueries({ queryKey: qk.album(albumId) }); navigation.goBack(); }
      else navigation.replace('Album', { albumId: album.id, title: album.title });
    } catch (reason) { setError(errorText(reason, 'Kunne ikke lagre albumet.')); }
    finally { setBusy(false); }
  };

  const remove = () => Alert.alert('Slette albumet?', 'Alle bildene i albumet slettes. Dette kan ikke angres.', [
    { text: 'Avbryt', style: 'cancel' },
    { text: 'Slett', style: 'destructive', onPress: () => void deleteAlbum(albumId!).then(async () => { await queryClient.invalidateQueries({ queryKey: qk.albums }); navigation.popToTop(); }).catch((e) => setError(errorText(e))) },
  ]);

  return (
    <Screen>
      <Field label="Tittel" value={title} onChangeText={setTitle} maxLength={120} autoFocus={!albumId} />
      <Field label="Beskrivelse" value={description} onChangeText={setDescription} multiline maxLength={1000} />
      <ErrorBox message={error} />
      <Button title={albumId ? 'Lagre' : 'Lag album'} busy={busy} disabled={!title.trim()} onPress={() => void save()} />
      {albumId ? <Button variant="danger" title="Slett album" icon="trash-outline" onPress={remove} /> : null}
    </Screen>
  );
}
