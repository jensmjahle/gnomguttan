import { AppLayout } from '@/components/layout/AppLayout';
import { EventsWidget } from '@/components/events/EventsWidget';

export function ArrangementerPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 p-6">
        <EventsWidget />
      </div>
    </AppLayout>
  );
}
