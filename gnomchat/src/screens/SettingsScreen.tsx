import { Alert, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme/useTheme';
import { queryClient } from '@/data/queryClient';
import { clearMatrixMedia } from '@/matrix/media';
import { config } from '@/config';
import { Divider, Row, Screen, Section, T } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { logout, user } = useAuth();
  const { themes, themeId } = useTheme();
  const theme = themes.find((t) => t.id === themeId);

  return (
    <Screen>
      {user ? <T size={13} muted>Innlogget som {user.name} ({user.email})</T> : null}
      <Section title="App">
        <Row icon="color-palette-outline" title="Utseende" subtitle={theme?.label} onPress={() => navigation.navigate('Themes')} />
        <Divider />
        <Row icon="notifications-outline" title="Varsler" subtitle="Push og hva du varsles om" onPress={() => navigation.navigate('NotificationSettings')} />
        <Divider />
        <Row icon="chatbubbles-outline" title="Chat" subtitle="Matrix-konto, kryptering og enheter" onPress={() => navigation.navigate('ChatSettings')} />
      </Section>
      <Section title="Konto">
        <Row icon="person-outline" title="Profil" onPress={() => navigation.navigate('ProfileEdit')} />
        <Divider />
        <Row icon="shield-checkmark-outline" title="Passord og innlogginger" onPress={() => navigation.navigate('Account')} />
      </Section>
      <Section title="Lagring">
        <Row icon="trash-bin-outline" title="Tøm hurtiglager" subtitle="Henter alt på nytt neste gang" onPress={() => Alert.alert('Tømme hurtiglageret?', 'Lagrede innlegg, bilder og chatmedier slettes fra telefonen og hentes på nytt.', [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Tøm', style: 'destructive', onPress: () => { queryClient.clear(); void clearMatrixMedia(); void queryClient.invalidateQueries(); } },
        ])} />
      </Section>
      <Section>
        <Row icon="globe-outline" title="Åpne nettsiden" onPress={() => void WebBrowser.openBrowserAsync(config.appApiHost)} />
        <Divider />
        <Row icon="log-out-outline" danger title="Logg ut" onPress={() => Alert.alert('Logge ut?', 'Du logges ut av Gnomguttan og chatten på denne telefonen.', [{ text: 'Avbryt', style: 'cancel' }, { text: 'Logg ut', style: 'destructive', onPress: () => void logout() }])} />
      </Section>
      <View style={{ alignItems: 'center' }}><T size={12} muted>GnomChat {Constants.expoConfig?.version ?? ''}</T></View>
    </Screen>
  );
}
