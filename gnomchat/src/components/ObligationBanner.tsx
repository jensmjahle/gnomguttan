import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@/theme/useTheme';
import { Button, Card, T } from '@/components/ui';
import { resolveNoPhotos, snoozeObligation, usePhotoObligations } from '@/data/obligations';
import { errorText } from '@/services/appApi';

/** "Legg inn bilder fra …": the photo obligations that lock some actions until resolved. */
export function ObligationBanner() {
  const { tokens } = useTheme();
  const navigation = useNavigation();
  const { data = [] } = usePhotoObligations();
  if (!data.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {data.map((obligation) => (
        <Card key={obligation.id} style={{ borderColor: tokens.warning, borderWidth: 1 }}>
          <T weight={700}>📸 Gjøremål</T>
          <T size={14}>Legg inn bilder fra «{obligation.eventTitle}». Du er låst fra å svare på arrangementer og legge til statusrapporter til det er gjort.</T>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Button small title="Last opp bilder" icon="cloud-upload-outline" onPress={() => navigation.navigate('Album', { albumId: obligation.albumId, title: obligation.eventTitle })} />
            <Button small variant="secondary" title="Jeg har ingen bilder" onPress={() => void resolveNoPhotos(obligation.id).catch((e) => Alert.alert('Feil', errorText(e)))} />
            <Button small variant="ghost" title="Minn meg senere" onPress={() => void snoozeObligation(obligation.id).catch((e) => Alert.alert('Feil', errorText(e)))} />
          </View>
        </Card>
      ))}
    </View>
  );
}
