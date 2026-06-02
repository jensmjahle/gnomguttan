import { AppLayout } from '@/components/layout/AppLayout';
import { HomeAssistantWidget } from '@/components/home-assistant/HomeAssistantWidget';

export function LampaPage() {
  return (
    <AppLayout>
      <div style={{ padding: 'var(--page-padding)', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <HomeAssistantWidget />
      </div>
    </AppLayout>
  );
}
