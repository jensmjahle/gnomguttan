import { describe, expect, it } from 'vitest';
import { deviceLabel } from './deviceLabel';

describe('deviceLabel', () => {
  it('names common browser and OS pairs', () => {
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36')).toBe('Chrome på macOS');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari på iPhone');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1')).toBe('Chrome på iPhone');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('Edge på Windows');
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0')).toBe('Firefox på Linux');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36')).toBe('Chrome på Android');
  });

  it('falls back when it can\'t tell', () => {
    expect(deviceLabel('')).toBe('Ukjent nettleser');
    expect(deviceLabel('curl/8.4.0')).toBe('Ukjent nettleser');
  });
});
