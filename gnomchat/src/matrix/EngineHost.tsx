import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import { config } from '@/config';
import { attachWebView, engineLost, handleEngineMessage } from '@/matrix/engine';
import { useMatrixStore } from '@/matrix/store';

/**
 * Hosts the Matrix engine: an invisible WebView with the website's
 * matrix-engine.html, which runs the end-to-end encrypted Matrix client
 * (WebAssembly, which React Native itself can't run). Nothing here is shown;
 * the chat screens are native and talk to it through src/matrix/engine.ts.
 */
export function EngineHost() {
  const ref = useRef<WebView>(null);
  const [key, setKey] = useState(0);
  const failed = useRef(false);

  const reload = (reason: string) => {
    engineLost(reason);
    setKey((value) => value + 1);
  };

  // A failed load (offline at start) is retried when the network comes back.
  useEffect(() => NetInfo.addEventListener((state) => {
    if (state.isConnected && failed.current) { failed.current = false; reload('Kobler til på nytt …'); }
  }), []);

  return (
    <View style={styles.hidden} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <WebView
        key={key}
        ref={(view) => { (ref as { current: WebView | null }).current = view; attachWebView(view); }}
        source={{ uri: config.matrixEngineUrl }}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        incognito={false}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction
        onMessage={(event) => handleEngineMessage(event.nativeEvent.data)}
        onError={() => {
          failed.current = true;
          engineLost('Får ikke kontakt med chatten.');
          useMatrixStore.setState({ engineError: 'Får ikke kontakt med chatten. Sjekk nettet.' });
        }}
        onHttpError={(event) => {
          failed.current = true;
          useMatrixStore.setState({ engineError: `Chatten kunne ikke lastes (${event.nativeEvent.statusCode}).` });
        }}
        onRenderProcessGone={() => reload('Chatten startet på nytt.')}
        onContentProcessDidTerminate={() => reload('Chatten startet på nytt.')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Kept tiny but laid out, so Android keeps the page's JavaScript running.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10, overflow: 'hidden' },
});
