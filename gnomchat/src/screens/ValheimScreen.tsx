import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { qk } from '@/data/queryClient';
import { loadValheimServers, type ValheimServer } from '@/services/services';
import { errorText } from '@/services/appApi';
import { Card, Divider, ErrorBox, Loading, Row, Screen, Section, T } from '@/components/ui';

const STEPS = [
  ['Last ned WireGuard', 'Serveren ligger bak et privat nettverk. WireGuard er VPN-en som slipper deg inn. Finnes i Play Store og App Store.'],
  ['Spør Jens Martin pent', 'Du trenger din egen tilgang: en .conf-fil eller en QR-kode. Den er personlig – ikke send den videre.'],
  ['Legg tunnelen inn i WireGuard', 'Mobil: trykk + nede til høyre og velg «Scan from QR code». PC/Mac: «Import tunnel(s) from file».'],
  ['Slå den på', 'Dra bryteren til på. VPN-en må stå på så lenge du spiller.'],
  ['Bli med i spillet', 'Start Valheim, trykk «Join IP», lim inn adressen fra kortet over med portnummer, og skriv passordet.'],
];

function ServerCard({ server }: { server: ValheimServer }) {
  const { tokens } = useTheme();
  const copy = (value: string | null) => value && void Clipboard.setStringAsync(value);
  return (
    <Section title={server.name}>
      <Row icon={server.online ? 'checkmark-circle' : 'close-circle'} title={server.online ? 'Oppe' : 'Nede'} subtitle={server.online ? `${server.players ? `${server.players.online}/${server.players.max} spillere` : ''}${server.latencyMs !== null ? ` · ${server.latencyMs} ms` : ''}` : server.error ?? undefined} chevron={false} right={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: server.online ? tokens.success : tokens.error }} />} />
      {server.world ? <><Divider /><Row icon="earth-outline" title="Verden" subtitle={server.world} chevron={false} /></> : null}
      <Divider />
      <Row icon="link-outline" title="Adresse" subtitle={`${server.address} · trykk for å kopiere`} onPress={() => copy(server.address)} chevron={false} />
      {server.password ? <><Divider /><Row icon="key-outline" title="Passord" subtitle={`${server.password} · trykk for å kopiere`} onPress={() => copy(server.password)} chevron={false} /></> : null}
      {server.joinCode ? <><Divider /><Row icon="game-controller-outline" title="Crossplay-kode" subtitle={`${server.joinCode} · trykk for å kopiere`} onPress={() => copy(server.joinCode)} chevron={false} /></> : null}
      {server.playerList.length ? <><Divider /><Row icon="people-outline" title="Pålogget" subtitle={server.playerList.map((p) => p.name).join(', ')} chevron={false} /></> : null}
    </Section>
  );
}

export function ValheimScreen() {
  const { tokens } = useTheme();
  const data = useQuery({ queryKey: qk.valheim, queryFn: loadValheimServers, refetchInterval: 30_000 });
  return (
    <Screen refreshing={data.isRefetching} onRefresh={() => void data.refetch()}>
      <T weight={800} size={22}>Valheim Server</T>
      <T muted>Guttas viking server, her kan vi kose oss.</T>
      {data.isLoading && !data.data ? <Loading /> : null}
      <ErrorBox message={data.error && !data.data ? errorText(data.error, 'Kunne ikke hente status.') : ''} onRetry={() => void data.refetch()} />
      {data.data && !data.data.configured ? <T muted>Ingen server er satt opp.</T> : null}
      {(data.data?.servers ?? []).map((server) => <ServerCard key={server.id} server={server} />)}
      <Card>
        <T weight={800} size={18}>Hvordan bli med</T>
        {STEPS.map(([title, body], index) => (
          <View key={title} style={{ flexDirection: 'row', gap: 10 }}>
            <T weight={800} color={tokens.accent} size={18}>{index + 1}</T>
            <View style={{ flex: 1 }}><T weight={700}>{title}</T><T size={13} muted>{body}</T></View>
          </View>
        ))}
        <Row icon="download-outline" title="Hent WireGuard" onPress={() => void Linking.openURL('https://www.wireguard.com/install/')} />
      </Card>
    </Screen>
  );
}
