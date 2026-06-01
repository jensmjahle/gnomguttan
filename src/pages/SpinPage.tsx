import { AppLayout } from '@/components/layout/AppLayout';
import { SpinWheelWidget } from '@/components/spin-wheel/SpinWheelWidget';

export function SpinPage() {
  return (
    <AppLayout>
      <div style={{ padding: 'var(--page-padding)', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SpinWheelWidget />
      </div>
    </AppLayout>
  );
}
