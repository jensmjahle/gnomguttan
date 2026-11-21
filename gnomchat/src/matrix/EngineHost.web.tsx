import { useEffect, useRef } from 'react';
import { config } from '@/config';
import { attachWebView, handleEngineMessage } from '@/matrix/engine';

/**
 * Web preview only: the engine runs in a hidden iframe instead of a WebView, and
 * messages go over postMessage (the engine allows this on localhost only).
 */
export function EngineHost() {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const target = new URL(config.matrixEngineUrl).origin;
    attachWebView({
      injectJavaScript: (code: string) => {
        const match = /receive\((.*)\); true;$/s.exec(code);
        if (match) frame.current?.contentWindow?.postMessage({ gnomEngineCommand: match[1] }, target);
      },
    } as never);
    const onMessage = (event: MessageEvent) => {
      if (event.origin === target && typeof event.data?.gnomEngine === 'string') handleEngineMessage(event.data.gnomEngine);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return <iframe ref={frame} src={config.matrixEngineUrl} title="Matrix" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, border: 0 }} />;
}
