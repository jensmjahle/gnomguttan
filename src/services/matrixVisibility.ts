// Native tab visibility is independent of the WebView document visibility.
let nativeActive = !location.pathname.startsWith('/mobile-chat');
window.addEventListener('gnomchat-native', event => {
  const data = (event as CustomEvent).detail;
  if (data?.type !== 'visibility') return;
  nativeActive = data.active === true;
  window.dispatchEvent(new Event('matrix-visibility'));
});
export function matrixIsVisible() { return nativeActive && document.visibilityState === 'visible'; }
