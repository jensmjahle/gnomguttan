import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/theme/useTheme';
import { qk } from '@/data/queryClient';
import { getRecentHubertMovies } from '@/services/jellyfin';
import { errorText } from '@/services/appApi';
import { config } from '@/config';
import { Button, Card, ErrorBox, Loading, Screen, T } from '@/components/ui';

/** Kino: what's new on Hubert Cinema (Jellyfin), and a way in. */
export function KinoScreen() {
  const { tokens, radius } = useTheme();
  const movies = useQuery({ queryKey: qk.kino('recent'), queryFn: () => getRecentHubertMovies(30) });
  const openJellyfin = (url: string = config.jellyfinClientUrl) => void Linking.openURL(url).catch(() => WebBrowser.openBrowserAsync(url));
  return (
    <Screen refreshing={movies.isRefetching} onRefresh={() => void movies.refetch()}>
      <Card>
        <T weight={800} size={20}>Hubert Cinema</T>
        <T muted>Se filmer og serier i Jellyfin-appen eller nettleseren.</T>
        <Button icon="play" title="Åpne Kino" onPress={() => openJellyfin()} />
      </Card>
      <T weight={700} size={16}>Nylig lagt til</T>
      {movies.isLoading && !movies.data ? <Loading /> : null}
      <ErrorBox message={movies.error && !movies.data ? errorText(movies.error, 'Kunne ikke hente Hubert Cinema.') : ''} onRetry={() => void movies.refetch()} />
      {(movies.data ?? []).map((movie) => (
        <Pressable key={movie.id} onPress={() => openJellyfin(movie.detailsUrl)} style={[styles.movie, { backgroundColor: tokens.bgCard, borderRadius: radius.md, borderColor: tokens.border }]}>
          {movie.posterUrl ? <Image source={{ uri: movie.posterUrl }} style={[styles.poster, { borderRadius: radius.sm }]} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[styles.poster, { backgroundColor: tokens.bgSecondary }]} />}
          <View style={{ flex: 1, gap: 3 }}>
            <T weight={700}>{movie.title}</T>
            <T size={12} muted>{[movie.kindLabel, movie.year, movie.runtimeLabel, movie.rating ? `★ ${movie.rating.toFixed(1)}` : null].filter(Boolean).join(' · ')}</T>
            {movie.genres.length ? <T size={12} muted>{movie.genres.slice(0, 3).join(', ')}</T> : null}
            <T size={13} numberOfLines={4}>{movie.overview}</T>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  movie: { flexDirection: 'row', gap: 10, padding: 10, borderWidth: StyleSheet.hairlineWidth },
  poster: { width: 80, height: 120 },
});
