import { AppLayout } from '@/components/layout/AppLayout';
import { HubertCinemaWidget } from '@/components/hubert-cinema/HubertCinemaWidget';

export function CinemaPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 p-6">
        <HubertCinemaWidget />
      </div>
    </AppLayout>
  );
}
