import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadAppUsers = vi.fn();
vi.mock('@/services/users', () => ({ loadAppUsers: () => loadAppUsers() }));

describe('refreshAppUsers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T12:00:00'));
    loadAppUsers.mockReset();
    loadAppUsers.mockResolvedValue([{ uid: 1, name: 'Kari' }]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('loads once, reuses a fresh list, and reloads it when stale', async () => {
    const { refreshAppUsers } = await import('./useAppUsers');
    await refreshAppUsers();
    await refreshAppUsers();
    expect(loadAppUsers).toHaveBeenCalledTimes(1);

    loadAppUsers.mockResolvedValue([{ uid: 1, name: 'Kari' }, { uid: 9, name: 'Ny Bruker' }]);
    vi.setSystemTime(new Date('2026-11-21T12:01:30'));
    await refreshAppUsers(60_000);
    expect(loadAppUsers).toHaveBeenCalledTimes(2);
  });

  it('shares one request between callers that ask at the same time', async () => {
    const { refreshAppUsers } = await import('./useAppUsers');
    await Promise.all([refreshAppUsers(), refreshAppUsers(), refreshAppUsers()]);
    expect(loadAppUsers).toHaveBeenCalledTimes(1);
  });

  it('a failed load is retried on the next call', async () => {
    loadAppUsers.mockRejectedValueOnce(new Error('offline'));
    const { refreshAppUsers } = await import('./useAppUsers');
    await refreshAppUsers();
    await refreshAppUsers();
    expect(loadAppUsers).toHaveBeenCalledTimes(2);
  });
});
