import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '@/store/authStore';
import { config } from '@/config';
import { Divider, Row, Screen, Section, type IconName } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

type Entry = { icon: IconName; title: string; subtitle?: string; screen?: keyof RootStackParamList; url?: string; admin?: boolean };

const GROUPS: Array<{ title: string; entries: Entry[] }> = [
  {
    title: 'Gjengen',
    entries: [
      { icon: 'person-circle-outline', title: 'Min profil', screen: 'Profile' },
      { icon: 'ear-outline', title: 'Overhørt', subtitle: 'Sitatene', screen: 'Quotes' },
      { icon: 'archive-outline', title: 'Arkiv', subtitle: 'Alt fra den gamle chatten', screen: 'Archive' },
    ],
  },
  {
    title: 'Tjenester',
    entries: [
      { icon: 'film-outline', title: 'Kino', subtitle: 'Hubert Cinema', screen: 'Kino' },
      { icon: 'bulb-outline', title: 'Lampa til Jens', screen: 'Lampa' },
      { icon: 'beer-outline', title: 'Ølbørs', screen: 'Olbors' },
      { icon: 'shield-outline', title: 'Valheim-server', screen: 'Valheim' },
      { icon: 'bus-outline', title: 'Buss', subtitle: 'Avganger fra Entur', screen: 'Buss' },
      { icon: 'flask-outline', title: 'Bryggeri', url: config.bryggeriUrl },
    ],
  },
  {
    title: 'Spill',
    entries: [
      { icon: 'sync-outline', title: 'Lykkehjulet', screen: 'Spin' },
      { icon: 'dice-outline', title: 'Kast grisene', screen: 'Pigs' },
      { icon: 'skull-outline', title: 'Krokodil', screen: 'Krokodil' },
      { icon: 'trophy-outline', title: 'Turnering', screen: 'Tournament' },
    ],
  },
  {
    title: 'Annet',
    entries: [
      { icon: 'code-slash-outline', title: 'Dev', subtitle: 'Issues, PR-er og releaser', screen: 'Dev' },
      { icon: 'settings-outline', title: 'Innstillinger', screen: 'Settings' },
      { icon: 'key-outline', title: 'Administrasjon', subtitle: 'Brukere og invitasjoner', screen: 'Admin', admin: true },
    ],
  },
];

/** Everything on the website that doesn't have its own tab. */
export function MoreScreen() {
  const navigation = useNavigation();
  const isAdmin = useAuthStore((s) => Boolean(s.user?.isAdmin));
  return (
    <Screen>
      {GROUPS.map((group) => (
        <Section key={group.title} title={group.title}>
          {group.entries.filter((entry) => !entry.admin || isAdmin).map((entry, index) => (
            <View key={entry.title}>
              {index ? <Divider /> : null}
              <Row
                icon={entry.icon}
                title={entry.title}
                subtitle={entry.subtitle}
                onPress={() => (entry.url ? void WebBrowser.openBrowserAsync(entry.url) : (navigation.navigate as (screen: string, params?: object) => void)(entry.screen!, {}))}
              />
            </View>
          ))}
        </Section>
      ))}
    </Screen>
  );
}
