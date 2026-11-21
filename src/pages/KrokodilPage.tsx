import { AppLayout } from '@/components/layout/AppLayout';
import { KrokodilWidget } from '@/components/krokodil/KrokodilWidget';

export function KrokodilPage() {
  return (
    <AppLayout>
      <div style={{ padding: 'var(--page-padding)', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <KrokodilWidget />
      </div>
    </AppLayout>
  );
}
