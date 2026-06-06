import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { OverheardWidget } from '@/components/overheard/OverheardWidget';

function RefreshBigIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 1-15.5 6.36" />
      <polyline points="21 8 21 12 17 12" />
      <path d="M3 12a9 9 0 0 1 15.5-6.36" />
      <polyline points="3 16 3 12 7 12" />
    </svg>
  );
}

export function SitaterPage() {
  const [composerOpen, setComposerOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <AppLayout>
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Card area — fills space, centers the widget */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '20px',
          paddingTop: '18vh',
        }}>
          <div style={{ width: '100%', maxWidth: 480 }}>
            <OverheardWidget
              composerOpen={composerOpen}
              onComposerChange={setComposerOpen}
              hideRefreshBtn
              refreshTrigger={refreshTrigger}
            />
          </div>
        </div>

        {/* Big refresh button pinned to the bottom */}
        <div style={{
          flexShrink: 0,
          padding: '12px 20px 20px',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <button
              onClick={() => { setComposerOpen(false); setRefreshTrigger(t => t + 1); }}
              aria-label="Hent nytt sitat"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 52,
                padding: '0 32px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                transition: 'filter 150ms',
                width: '100%',
                maxWidth: 320,
                justifyContent: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
              onMouseLeave={e => (e.currentTarget.style.filter = '')}
            >
              <RefreshBigIcon />
              Nytt sitat
            </button>
        </div>
      </div>
    </AppLayout>
  );
}
