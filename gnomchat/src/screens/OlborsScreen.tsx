import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import EventSource from 'react-native-sse';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { qk, queryClient } from '@/data/queryClient';
import { appApi, appUrl, errorText } from '@/services/appApi';
import { useAuthStore } from '@/store/authStore';
import { config } from '@/config';
import { pickImage } from '@/utils/images';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Chip, Divider, Empty, ErrorBox, Field, IconButton, Loading, Row, Screen, Section, T, ToggleRow } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import type { RootStackParamList } from '@/navigation/types';

// Ølbørs: the beer stock exchange (docs/olbors.md). Prices move with demand; the
// server computes every quote and receipt. Advanced admin settings stay on the website.

type Volume = { volume_ml: number; stock?: number };
type Beer = {
  id: string; name: string; brewery: string; style: string; description: string; image_url: string; abv: number; ibu: number;
  position: number; active: boolean; base_price: number; min_price: number; max_price: number; current_price: number; normal_price?: number;
  volumes: Volume[]; last_hours_change?: number;
};
type Customer = { id: string; uid?: number; avatarUpdatedAt?: number; name: string; liters: number; spend: number; bac: number; drinks?: number };
type Tx = { id: string; beer_name: string; customer_name: string; qty: number; volume_ml: number; unit_price: number; total_price?: number; customer_id: string; created_at: string };
type Exchange = { id: string; name: string; status: 'draft' | 'live' | 'closed' | string; currency: string; adminUids: number[]; image_url?: string; maxUnitsPerPurchase?: number; checkoutRevision?: number };
type Snapshot = { event: Exchange; beers: Beer[]; customers: Customer[]; transactions: Tx[]; isAdmin: boolean; myCustomerId: string | null };
type Quote = { id: string; expectedPrice: number; expiresAt: string; unitPrice: number; subtotal: number; commissionFee: number; adjustments: { name: string; percent: number }[]; total: number; superOfferApplied: boolean };

const money = (n: number) => Number(n).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const media = (url?: string) => (url ? (url.startsWith('http') ? url : `${config.appApiHost}${url}`) : undefined);
const STATUS: Record<string, string> = { draft: 'Utkast', live: 'Åpen', closed: 'Stengt' };
const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function ExchangeList({ onOpen }: { onOpen: (id: string) => void }) {
  const { tokens } = useTheme();
  const list = useQuery({ queryKey: qk.olborsEvents, queryFn: () => appApi.get<Exchange[]>('/olbors') });
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <ErrorBox message={error || (list.error && !list.data ? errorText(list.error) : '')} />
      {list.isLoading && !list.data ? <Loading /> : null}
      {(list.data ?? []).map((exchange) => (
        <Card key={exchange.id} onPress={() => onOpen(exchange.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {exchange.image_url ? <Image source={{ uri: media(exchange.image_url) }} style={{ width: 54, height: 54, borderRadius: 10 }} /> : <Ionicons name="beer" size={40} color={tokens.accent} />}
          <View style={{ flex: 1 }}><T weight={800} size={17}>{exchange.name}</T><T size={12} muted>{STATUS[exchange.status] ?? exchange.status}</T></View>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: exchange.status === 'live' ? tokens.success : exchange.status === 'draft' ? tokens.warning : tokens.textMuted }} />
        </Card>
      ))}
      {list.data && !list.data.length ? <Empty icon="beer-outline" title="Ingen børser ennå" /> : null}
      <Button variant="secondary" icon="add" title="Ny børs" onPress={() => setCreating(true)} />
      <Sheet visible={creating} onClose={() => setCreating(false)} title="Ny børs">
        <Field label="Navn" value={name} onChangeText={setName} maxLength={100} autoFocus />
        <Button title="Lag børs" disabled={!name.trim()} onPress={() => void appApi.post<Exchange>('/olbors', { name: name.trim() }).then((exchange) => { setCreating(false); setName(''); void list.refetch(); onOpen(exchange.id); }).catch((e) => setError(errorText(e)))} />
      </Sheet>
    </Screen>
  );
}

function BeerRow({ beer, currency, onPress }: { beer: Beer; currency: string; onPress: () => void }) {
  const { tokens } = useTheme();
  const change = beer.last_hours_change ?? (beer.normal_price ? beer.current_price - beer.normal_price : 0);
  const color = change > 0 ? tokens.error : change < 0 ? tokens.success : tokens.textMuted;
  const soldOut = beer.volumes.every((volume) => volume.stock === 0);
  return (
    <Pressable onPress={onPress} disabled={!beer.active || soldOut} style={({ pressed }) => [styles.beer, { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard, borderColor: tokens.border, opacity: beer.active && !soldOut ? 1 : 0.5 }]}>
      {beer.image_url ? <Image source={{ uri: media(beer.image_url) }} style={styles.beerImage} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[styles.beerImage, { backgroundColor: tokens.accentMuted, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="beer" size={26} color={tokens.accent} /></View>}
      <View style={{ flex: 1 }}>
        <T weight={800}>{beer.name}</T>
        <T size={12} muted numberOfLines={1}>{[beer.brewery, beer.style, `${beer.abv} %`].filter(Boolean).join(' · ')}</T>
        {soldOut ? <T size={12} color={tokens.error}>Utsolgt</T> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T weight={800} size={18}>{money(beer.current_price)}</T>
        <T size={11} color={color}>{change > 0 ? '▲' : change < 0 ? '▼' : '•'} {money(Math.abs(change))} {currency}</T>
      </View>
    </Pressable>
  );
}

function BuySheet({ exchangeId, beer, snapshot, onClose }: { exchangeId: string; beer: Beer; snapshot: Snapshot; onClose: () => void }) {
  const { tokens } = useTheme();
  const max = snapshot.event.maxUnitsPerPurchase ?? 1;
  const [volume, setVolume] = useState(beer.volumes[0]?.volume_ml ?? 500);
  const [qty, setQty] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(newRequestId());

  useEffect(() => {
    let cancelled = false;
    setQuote(null); setError('');
    void appApi.post<Quote>(`/olbors/${exchangeId}/quote`, { beerId: beer.id, qty, volume_ml: volume })
      .then((next) => { if (!cancelled) setQuote(next); })
      .catch((e) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [exchangeId, beer.id, beer.current_price, qty, volume, nonce, snapshot.event.checkoutRevision]);

  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setNonce((n) => n + 1), Math.max(500, Date.parse(quote.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [quote]);

  const buy = async () => {
    if (!quote) return;
    setBusy(true); setError('');
    try {
      await appApi.post(`/olbors/${exchangeId}/purchases`, { requestId: requestId.current, beerId: beer.id, quoteId: quote.id, qty, volume_ml: volume, expectedPrice: quote.expectedPrice });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    } catch (reason) {
      setError(errorText(reason, 'Kjøpet gikk ikke gjennom. Sjekk prisen og prøv igjen.'));
      setNonce((n) => n + 1);
    } finally { setBusy(false); }
  };

  return (
    <Sheet visible onClose={onClose} title={`Kjøp ${beer.name}`}>
      <T weight={600} muted>Volum</T>
      <View style={styles.wrap}>{beer.volumes.map((v) => <Chip key={v.volume_ml} label={`${v.volume_ml} ml${v.stock != null ? ` (${v.stock} igjen)` : ''}`} selected={volume === v.volume_ml} onPress={() => setVolume(v.volume_ml)} />)}</View>
      {max > 1 ? (
        <View style={styles.qty}>
          <T style={{ flex: 1 }}>Antall</T>
          <IconButton icon="remove-circle-outline" label="Færre" disabled={qty <= 1} onPress={() => setQty(qty - 1)} />
          <T weight={800} size={18}>{qty}</T>
          <IconButton icon="add-circle-outline" label="Flere" disabled={qty >= max} onPress={() => setQty(qty + 1)} />
        </View>
      ) : null}
      {quote ? (
        <Card>
          <View style={styles.line}><T>Ølpris{quote.superOfferApplied ? ' · Supertilbud' : ''}</T><T weight={700}>{money(quote.subtotal)} kr</T></View>
          <View style={styles.line}><T>Kurtasje</T><T weight={700}>{money(quote.commissionFee)} kr</T></View>
          {quote.adjustments.map((adjustment, index) => <View key={index} style={styles.line}><T>{adjustment.name}</T><T color={adjustment.percent < 0 ? tokens.success : tokens.error}>{adjustment.percent > 0 ? '+' : ''}{money(adjustment.percent)} %</T></View>)}
          <Divider />
          <View style={styles.line}><T weight={800}>Total</T><T weight={800} size={18}>{money(quote.total)} kr</T></View>
        </Card>
      ) : <Loading label="Henter pris …" />}
      <ErrorBox message={error} />
      <Button title={quote ? `Kjøp for ${money(quote.total)} kr` : 'Kjøp'} icon="cart" busy={busy} disabled={!quote} onPress={() => void buy()} />
    </Sheet>
  );
}

function BeerEditor({ exchangeId, beer, onClose }: { exchangeId: string; beer: Beer | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: beer?.name ?? '', brewery: beer?.brewery ?? '', style: beer?.style ?? '', description: beer?.description ?? '', image_url: beer?.image_url ?? '',
    abv: String(beer?.abv ?? 4.5), base_price: String(beer?.base_price ?? 100), min_price: String(beer?.min_price ?? 50), max_price: String(beer?.max_price ?? 200),
    volumes: (beer?.volumes ?? [{ volume_ml: 500 }]).map((v) => `${v.volume_ml}${v.stock != null ? `:${v.stock}` : ''}`).join(', '), active: beer?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const save = async () => {
    setBusy(true); setError('');
    try {
      const volumes = form.volumes.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
        const [ml, stock] = part.split(':').map((value) => Number(value.trim()));
        return { volume_ml: ml, ...(Number.isFinite(stock) ? { stock } : {}) };
      });
      const body = { ...form, abv: Number(form.abv.replace(',', '.')), base_price: Number(form.base_price), min_price: Number(form.min_price), max_price: Number(form.max_price), volumes };
      if (beer) await appApi.put(`/olbors/${exchangeId}/beers/${beer.id}`, body);
      else await appApi.post(`/olbors/${exchangeId}/beers`, body);
      onClose();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible onClose={onClose} title={beer ? `Rediger ${beer.name}` : 'Nytt øl'}>
      <Field label="Navn" value={form.name} onChangeText={(name) => set({ name })} />
      <Field label="Bryggeri" value={form.brewery} onChangeText={(brewery) => set({ brewery })} />
      <Field label="Stil" value={form.style} onChangeText={(style) => set({ style })} />
      <Field label="Beskrivelse" value={form.description} onChangeText={(description) => set({ description })} multiline />
      <Field label="Alkohol (%)" value={form.abv} onChangeText={(abv) => set({ abv })} keyboardType="decimal-pad" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label="Min" value={form.min_price} onChangeText={(min_price) => set({ min_price })} keyboardType="decimal-pad" style={{ flex: 1 }} />
        <Field label="Start" value={form.base_price} onChangeText={(base_price) => set({ base_price })} keyboardType="decimal-pad" style={{ flex: 1 }} />
        <Field label="Maks" value={form.max_price} onChangeText={(max_price) => set({ max_price })} keyboardType="decimal-pad" style={{ flex: 1 }} />
      </View>
      <Field label="Volum (ml:lager, …)" value={form.volumes} onChangeText={(volumes) => set({ volumes })} hint="F.eks. «330, 500:24» – lager er valgfritt." />
      <Button small variant="secondary" icon="image-outline" title={form.image_url ? 'Bytt bilde' : 'Bilde'} onPress={() => void pickImage({ maxSize: 1000 }).then(async (image) => {
        if (!image) return;
        const { url } = await appApi.post<{ url: string }>(`/olbors/${exchangeId}/images`, { dataUrl: image.dataUrl, purpose: 'beer' });
        set({ image_url: url });
      }).catch((e) => setError(errorText(e)))} />
      <ToggleRow title="Aktiv" subtitle="Kan kjøpes" value={form.active} onChange={(active) => set({ active })} />
      <ErrorBox message={error} />
      <Button title="Lagre" busy={busy} disabled={!form.name.trim()} onPress={() => void save()} />
    </Sheet>
  );
}

function ExchangeView({ exchangeId, onTitle }: { exchangeId: string; onTitle: (title: string) => void }) {
  const { tokens } = useTheme();
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.user);
  const snapshot = useQuery({ queryKey: qk.olborsEvent(exchangeId), queryFn: () => appApi.get<Snapshot>(`/olbors/${exchangeId}`), refetchInterval: 15_000 });
  const [tab, setTab] = useState<'market' | 'top' | 'history' | 'me' | 'admin'>('market');
  const [buying, setBuying] = useState<Beer | null>(null);
  const [editing, setEditing] = useState<Beer | null | 'new'>(null);
  const [ranking, setRanking] = useState<'liters' | 'spend' | 'bac'>('liters');
  const [error, setError] = useState('');
  const data = snapshot.data;

  useEffect(() => { if (data?.event.name) onTitle(data.event.name); }, [data?.event.name, onTitle]);

  // Live: the server says "change" after every committed write.
  useEffect(() => {
    if (!token) return;
    const source = new EventSource(appUrl(`/olbors/stream/${exchangeId}?token=${encodeURIComponent(token)}`), { pollingInterval: 0 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: qk.olborsEvent(exchangeId) }), 120); };
    source.addEventListener('ready' as never, refresh);
    source.addEventListener('change' as never, refresh);
    return () => { if (timer) clearTimeout(timer); source.removeAllEventListeners(); source.close(); };
  }, [exchangeId, token]);

  const ranked = useMemo(() => [...(data?.customers ?? [])].sort((a, b) => b[ranking] - a[ranking]), [data?.customers, ranking]);
  const mine = data?.customers.find((customer) => customer.id === data.myCustomerId);
  const myTx = data?.transactions.filter((tx) => tx.customer_id === data.myCustomerId) ?? [];
  const beers = [...(data?.beers ?? [])].sort((a, b) => a.position - b.position);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); await snapshot.refetch(); } catch (reason) { setError(errorText(reason)); }
  };

  if (!data) return <Screen>{snapshot.error ? <ErrorBox message={errorText(snapshot.error)} onRetry={() => void snapshot.refetch()} /> : <Loading />}</Screen>;
  const live = data.event.status === 'live';

  return (
    <Screen refreshing={snapshot.isRefetching} onRefresh={() => void snapshot.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: live ? tokens.success : tokens.textMuted }} />
        <T weight={700} style={{ flex: 1 }}>{STATUS[data.event.status] ?? data.event.status}</T>
        {!data.myCustomerId && data.event.status !== 'closed' ? <Button small title="Bli med" icon="person-add-outline" onPress={() => void act(() => appApi.post(`/olbors/${exchangeId}/join`))} /> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip label="Børsen" icon="trending-up" selected={tab === 'market'} onPress={() => setTab('market')} />
        <Chip label="Toppliste" icon="podium-outline" selected={tab === 'top'} onPress={() => setTab('top')} />
        <Chip label="Historikk" icon="receipt-outline" selected={tab === 'history'} onPress={() => setTab('history')} />
        {data.myCustomerId ? <Chip label="Meg" icon="person-outline" selected={tab === 'me'} onPress={() => setTab('me')} /> : null}
        {data.isAdmin ? <Chip label="Admin" icon="construct-outline" selected={tab === 'admin'} onPress={() => setTab('admin')} /> : null}
      </ScrollView>
      <ErrorBox message={error} />

      {tab === 'market' ? (
        <>
          {!live ? <T muted>{data.event.status === 'draft' ? 'Børsen er ikke åpnet ennå.' : 'Børsen er stengt.'}</T> : null}
          {beers.map((beer) => <BeerRow key={beer.id} beer={beer} currency={data.event.currency} onPress={() => {
            if (!live) return;
            if (!data.myCustomerId) { Alert.alert('Bli med først', 'Trykk «Bli med» for å handle på børsen.'); return; }
            setBuying(beer);
          }} />)}
          {!beers.length ? <Empty icon="beer-outline" title="Ingen øl på børsen ennå" /> : null}
        </>
      ) : null}

      {tab === 'top' ? (
        <>
          <View style={styles.wrap}>
            <Chip label="Liter" selected={ranking === 'liters'} onPress={() => setRanking('liters')} />
            <Chip label="Brukt" selected={ranking === 'spend'} onPress={() => setRanking('spend')} />
            <Chip label="Promille (anslag)" selected={ranking === 'bac'} onPress={() => setRanking('bac')} />
          </View>
          <Section>
            {ranked.map((customer, index) => (
              <View key={customer.id}>
                {index ? <Divider /> : null}
                <Row
                  title={`${index + 1}. ${customer.name}${customer.id === data.myCustomerId ? ' (deg)' : ''}`}
                  subtitle={`${customer.liters.toFixed(2)} l · ${money(customer.spend)} kr · ${customer.bac.toFixed(2)} ‰`}
                  right={customer.uid ? <Avatar uid={customer.uid} name={customer.name} avatarUpdatedAt={customer.avatarUpdatedAt} size={30} /> : undefined}
                  chevron={false}
                />
              </View>
            ))}
          </Section>
        </>
      ) : null}

      {tab === 'history' ? (
        <Section>
          {data.transactions.map((tx, index) => (
            <View key={tx.id}>{index ? <Divider /> : null}<Row title={`${tx.customer_name} · ${tx.beer_name}`} subtitle={`${tx.qty} × ${tx.volume_ml} ml · ${money(tx.total_price ?? tx.unit_price)} kr · ${new Date(tx.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`} chevron={false} /></View>
          ))}
          {!data.transactions.length ? <T muted style={{ padding: 14 }}>Ingen kjøp ennå.</T> : null}
        </Section>
      ) : null}

      {tab === 'me' && mine ? (
        <>
          <Card style={{ alignItems: 'center' }}>
            {me ? <Avatar uid={me.uid} name={me.name} avatarUpdatedAt={me.avatarUpdatedAt} size={64} /> : null}
            <T weight={800} size={20}>{mine.name}</T>
            <T>{mine.liters.toFixed(2)} liter · {money(mine.spend)} kr</T>
            <T muted size={13}>Promille (anslag): {mine.bac.toFixed(2)} ‰</T>
          </Card>
          <Section title="Mine kjøp">
            {myTx.map((tx, index) => <View key={tx.id}>{index ? <Divider /> : null}<Row title={tx.beer_name} subtitle={`${tx.qty} × ${tx.volume_ml} ml · ${money(tx.total_price ?? tx.unit_price)} kr · ${new Date(tx.created_at).toLocaleString('nb-NO')}`} chevron={false} /></View>)}
            {!myTx.length ? <T muted style={{ padding: 14 }}>Ingen kjøp ennå.</T> : null}
          </Section>
        </>
      ) : null}

      {tab === 'admin' && data.isAdmin ? (
        <>
          <Section title="Status">
            <View style={[styles.wrap, { padding: 14 }]}>
              {(['draft', 'live', 'closed'] as const).map((status) => <Chip key={status} label={STATUS[status]} selected={data.event.status === status} onPress={() => data.event.status !== status && void act(() => appApi.put(`/olbors/${exchangeId}`, { status }))} />)}
            </View>
          </Section>
          <Section title="Øl" action={<Button small icon="add" title="Nytt øl" onPress={() => setEditing('new')} />}>
            {beers.map((beer, index) => <View key={beer.id}>{index ? <Divider /> : null}<Row title={beer.name} subtitle={`${money(beer.current_price)} kr · ${beer.active ? 'aktiv' : 'skjult'}`} onPress={() => setEditing(beer)} /></View>)}
          </Section>
          <Card>
            <T size={13} muted>Prisregler, kurtasje, supertilbud, markedshendelser, roller, kunder og kiosk-lenke stilles inn på nettsiden.</T>
            <Button variant="secondary" icon="open-outline" title="Åpne børsen på nettsiden" onPress={() => void WebBrowser.openBrowserAsync(`${config.appApiHost}/olbors/${exchangeId}`)} />
          </Card>
        </>
      ) : null}

      {buying ? <BuySheet exchangeId={exchangeId} beer={data.beers.find((beer) => beer.id === buying.id) ?? buying} snapshot={data} onClose={() => { setBuying(null); void snapshot.refetch(); }} /> : null}
      {editing ? <BeerEditor exchangeId={exchangeId} beer={editing === 'new' ? null : editing} onClose={() => { setEditing(null); void snapshot.refetch(); }} /> : null}
    </Screen>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'Olbors'>;

export function OlborsScreen({ navigation, route }: Props) {
  const eventId = route.params?.eventId;
  const [title, setTitle] = useState('Ølbørs');
  useLayoutEffect(() => { navigation.setOptions({ title }); }, [navigation, title]);
  if (!eventId) return <ExchangeList onOpen={(id) => navigation.push('Olbors', { eventId: id })} />;
  return <ExchangeView exchangeId={eventId} onTitle={setTitle} />;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  beer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  beerImage: { width: 52, height: 52, borderRadius: 10 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
});
