import { AppLayout } from '@/components/layout/AppLayout';
import { HomeAssistantWidget } from '@/components/home-assistant/HomeAssistantWidget';

export function LampaPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 items-center justify-center p-8">
        <HomeAssistantWidget />
      </div>
    </AppLayout>
  );
}
