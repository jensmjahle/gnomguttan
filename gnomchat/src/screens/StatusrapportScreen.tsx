import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { queryClient, qk } from '@/data/queryClient';
import { postStatusrapport } from '@/services/feed';
import { errorText } from '@/services/appApi';
import { pickImage, type PickedImage } from '@/utils/images';
import { MentionInput } from '@/components/comments/MentionInput';
import { Button, ErrorBox, Screen, T } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import type { CommentMention } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Statusrapport'>;

export function StatusrapportScreen({ navigation }: Props) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<CommentMention[]>([]);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await postStatusrapport(text.trim(), image?.dataUrl, mentions);
      void queryClient.invalidateQueries({ queryKey: qk.feedAll });
      navigation.goBack();
    } catch (reason) { setError(errorText(reason, 'Kunne ikke legge ut statusrapporten.')); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <T muted>Hva skjer? Fortell gjengen. Bruk @ for å nevne noen.</T>
      <MentionInput value={text} onChange={setText} mentions={mentions} onMentionsChange={setMentions} placeholder="Statusrapport …" maxLength={2000} style={{ minHeight: 140 }} autoFocus />
      {image ? <Image source={{ uri: image.uri }} style={{ width: '100%', aspectRatio: image.width / image.height, borderRadius: 12 }} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" icon="image-outline" title={image ? 'Bytt bilde' : 'Bilde'} onPress={() => void pickImage().then((picked) => picked && setImage(picked)).catch((e) => setError(errorText(e)))} style={{ flex: 1 }} />
        <Button variant="secondary" icon="camera-outline" title="Kamera" onPress={() => void pickImage({ camera: true }).then((picked) => picked && setImage(picked)).catch((e) => setError(errorText(e)))} style={{ flex: 1 }} />
        {image ? <Button variant="ghost" icon="trash-outline" title="" onPress={() => setImage(null)} /> : null}
      </View>
      <ErrorBox message={error} />
      <Button title="Legg ut" icon="send" busy={busy} disabled={!text.trim() && !image} onPress={() => void submit()} />
    </Screen>
  );
}
