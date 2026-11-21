import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { qk, queryClient } from '@/data/queryClient';
import { loadLamp, toggleLamp } from '@/services/services';
import { errorText } from '@/services/appApi';
import { ErrorBox, Loading, Screen, T } from '@/components/ui';

/** Lampa til Jens: the Home Assistant switch, polled like on the website. */
export function LampaScreen() {
  const { tokens } = useTheme();
  const lamp = useQuery({ queryKey: qk.lamp, queryFn: loadLamp, refetchInterval: 5000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const on = Boolean(lamp.data?.isOn);

  const toggle = async () => {
    setBusy(true); setError('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try { queryClient.setQueryData(qk.lamp, await toggleLamp()); void queryClient.invalidateQueries({ queryKey: qk.feedAll }); }
    catch (reason) { setError(errorText(reason, 'Kunne ikke skru på lampa.')); }
    finally { setBusy(false); }
  };

  return (
    <Screen contentStyle={{ alignItems: 'center', paddingTop: 40 }}>
      {lamp.isLoading && !lamp.data ? <Loading /> : (
        <>
          <Pressable disabled={busy || lamp.data?.available === false} onPress={() => void toggle()} accessibilityLabel={on ? 'Skru av lampa' : 'Skru på lampa'} style={[styles.lamp, { backgroundColor: on ? '#fde68a' : tokens.bgCard, borderColor: on ? '#f59e0b' : tokens.border, shadowColor: on ? '#fbbf24' : '#000' }]}>
            <Ionicons name={on ? 'bulb' : 'bulb-outline'} size={110} color={on ? '#b45309' : tokens.textMuted} />
          </Pressable>
          <T weight={800} size={24}>{lamp.data?.available === false ? 'Lampa er utilgjengelig' : on ? 'Lampa er PÅ' : 'Lampa er av'}</T>
          <T muted>{lamp.data?.friendlyName ?? 'Lampa til Jens'}</T>
          <T muted size={13}>Trykk for å {on ? 'skru den av' : 'skru den på'}. Alle ser det i feeden.</T>
          {lamp.data?.lastChangedAt ? <T size={12} muted>Sist endret {new Date(lamp.data.lastChangedAt).toLocaleString('nb-NO')}</T> : null}
        </>
      )}
      <View style={{ alignSelf: 'stretch' }}><ErrorBox message={error || (lamp.error && !lamp.data ? errorText(lamp.error) : '')} /></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lamp: { width: 200, height: 200, borderRadius: 100, alignItems: 'center', justifyContent: 'center', borderWidth: 3, marginBottom: 20, elevation: 10, shadowOpacity: 0.6, shadowRadius: 30 },
});
