import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { avatarUrl } from './avatar';

describe('avatarUrl', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'gns_test', user: { uid: 1, name: 'Kari', email: '' } });
  });

  it('points at our server with the version and the session token', () => {
    expect(avatarUrl(7, 123)).toBe('/app-api/avatars/7?v=123&token=gns_test');
  });

  it('uses the kiosk key instead of a login for Ølbørs kiosks', () => {
    expect(avatarUrl(7, 0, { eventId: 'ex1', key: 'k&y' })).toBe('/app-api/avatars/7?v=0&kiosk=ex1&key=k%26y');
  });
});
