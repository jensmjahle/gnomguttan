import { AppLayout } from '@/components/layout/AppLayout';
import { SpinWheelWidget } from '@/components/spin-wheel/SpinWheelWidget';

export function SpinPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 items-center justify-center p-8">
        <SpinWheelWidget />
      </div>
    </AppLayout>
  );
}
