import { AppLayout } from '@/components/layout/AppLayout';
import { PigsWidget } from '@/components/pigs/PigsWidget';

export function PigsPage() {
  return (
    <AppLayout>
      <div style={{ padding: 'var(--page-padding)', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PigsWidget />
      </div>
    </AppLayout>
  );
}
