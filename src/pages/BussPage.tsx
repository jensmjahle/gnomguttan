import { AppLayout } from '@/components/layout/AppLayout';
import { config } from '@/config';

export function BussPage() {
  return (
    <AppLayout>
      <div style={{ padding: 'var(--page-padding)', flex: 1, minHeight: 0, display: 'flex' }}>
        <iframe
          style={{
            flex: 1,
            width: '100%',
            minWidth: 0,
            minHeight: 0,
            border: 0,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-card)',
            overflow: 'hidden',
          }}
          src={config.busUrl}
          title="Buss"
          allow="fullscreen"
        />
      </div>
    </AppLayout>
  );
}
