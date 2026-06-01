import { AppLayout } from '@/components/layout/AppLayout';
import { Gallery } from '@/components/gallery/Gallery';

export function GalleriPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 p-6">
        <Gallery />
      </div>
    </AppLayout>
  );
}
