import { useState } from 'react';
import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { qk, queryClient } from '@/data/queryClient';
import { loadNotificationSettings, pushStatus, registerForPush, saveNotificationSettings, type PushStatus } from '@/services/notifications';
import { errorText } from '@/services/appApi';
import { Button, Divider, ErrorBox, Loading, Screen, Section, T, ToggleRow } from '@/components/ui';
import type { NotificationSettings } from '@/types';

const ROWS: Array<{ key: keyof NotificationSettings; label: string; hint: string }> = [
  { key: 'mentions', label: 'Noen nevner meg', hint: '@omtaler i kommentarer og statusrapporter' },
  { key: 'replies', label: 'Noen svarer på kommentaren min', hint: 'Svar i tråder du har skrevet i' },
  { key: 'ownPosts', label: 'Noen kommenterer innleggene mine', hint: 'Også arrangementer du har laget' },
  { key: 'threads', label: 'Nye kommentarer der jeg har kommentert', hint: 'Kan bli mye — av som standard' },
  { key: 'reactions', label: 'Noen reagerer på det jeg har skrevet', hint: 'Samles per innlegg/kommentar' },
  { key: 'newEvents', label: 'Et nytt arrangement legges ut', hint: 'Til alle i gjengen' },
];

export function NotificationSettingsScreen() {
  const { data, isLoading, error } = useQuery({ queryKey: qk.notificationSettings, queryFn: loadNotificationSettings });
  const [saveError, setSaveError] = useState('');
  const [push, setPush] = useState<PushStatus>(pushStatus());
  const [checking, setChecking] = useState(false);

  const toggle = async (key: keyof NotificationSettings, value: boolean) => {
    setSaveError('');
    const previous = data;
    queryClient.setQueryData<NotificationSettings>(qk.notificationSettings, (current) => current && { ...current, [key]: value });
    try { queryClient.setQueryData(qk.notificationSettings, await saveNotificationSettings({ [key]: value })); }
    catch (reason) { queryClient.setQueryData(qk.notificationSettings, previous); setSaveError(errorText(reason, 'Kunne ikke lagre.')); }
  };

  if (isLoading && !data) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ErrorBox message={error && !data ? errorText(error) : saveError} />
      <Section title="Push på denne telefonen">
        <ToggleRow title="Push-varsler" subtitle="Varsler på telefonen når appen er lukket. Chatmeldinger styres i chatinnstillingene." value={data?.push ?? true} onChange={(value) => void toggle('push', value)} />
        <Divider />
        <T size={13} muted style={{ padding: 14 }}>
          {push.state === 'ok' ? '✅ Telefonen er registrert for push.' : push.state === 'denied' ? '🔕 Varsler er slått av for GnomChat i telefonens innstillinger.' : `⚠️ ${push.detail ?? 'Ikke registrert.'}`}
        </T>
        {push.state !== 'ok' ? (
          <Button variant="ghost" title={push.state === 'denied' ? 'Åpne telefonens innstillinger' : 'Prøv igjen'} busy={checking} onPress={() => {
            if (push.state === 'denied') { void Linking.openSettings(); return; }
            setChecking(true);
            void registerForPush().then(setPush).finally(() => setChecking(false));
          }} />
        ) : null}
      </Section>
      <Section title="Varsle meg når …">
        {ROWS.map((row, index) => (
          <ToggleRowWithDivider key={row.key} first={index === 0} title={row.label} subtitle={row.hint} value={Boolean(data?.[row.key])} onChange={(value) => void toggle(row.key, value)} />
        ))}
      </Section>
      <T size={12} muted>Innstillingene gjelder både nettsiden og appen.</T>
    </Screen>
  );
}

function ToggleRowWithDivider({ first, ...props }: { first: boolean; title: string; subtitle: string; value: boolean; onChange: (value: boolean) => void }) {
  return <>{first ? null : <Divider />}<ToggleRow {...props} /></>;
}
