import { AppLayout } from '@/components/layout/AppLayout';
import { ChatPanel } from '@/components/chat/ChatPanel';

export function ChatPage() {
  return (
    <AppLayout>
      <div style={{ padding: 'var(--page-padding)', flex: 1, minHeight: 0, display: 'flex' }}>
        <ChatPanel variant="fullscreen" />
      </div>
    </AppLayout>
  );
}
