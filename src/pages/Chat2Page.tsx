import { AppLayout } from '@/components/layout/AppLayout';
import { MatrixClientPanel } from '@/components/chat/MatrixClientPanel';

export function Chat2Page({ mobile = false }: { mobile?: boolean }) {
  if (mobile) return <div style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}><MatrixClientPanel native /></div>;
  return <AppLayout><MatrixClientPanel/></AppLayout>;
}
