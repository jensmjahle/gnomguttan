/** "Chrome på macOS"-style label for a session's User-Agent. Good enough to recognise your own devices. */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent || '';
  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) ? 'Safari'
              : /okhttp|Expo|ReactNative/i.test(ua) ? 'GnomChat-appen'
                : 'Ukjent nettleser';
  const os =
    /iPhone/.test(ua) ? 'iPhone'
      : /iPad/.test(ua) ? 'iPad'
        : /Android/.test(ua) ? 'Android'
          : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
            : /Windows/.test(ua) ? 'Windows'
              : /CrOS/.test(ua) ? 'ChromeOS'
                : /Linux/.test(ua) ? 'Linux'
                  : '';
  return os ? `${browser} på ${os}` : browser;
}
