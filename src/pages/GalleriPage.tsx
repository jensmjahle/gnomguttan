import { AppLayout } from '@/components/layout/AppLayout';
import { Gallery } from '@/components/gallery/Gallery';

export function GalleriPage() {
  return (
    <AppLayout>
      <div style={{ padding: 'var(--page-padding)', flex: 1, minHeight: 0, display: 'flex' }}>
        <Gallery />
      </div>
    </AppLayout>
  );
}
