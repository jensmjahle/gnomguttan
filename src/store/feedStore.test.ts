import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedStore } from './feedStore';
import type { AnyFeedItem } from '@/types';

const store = () => useFeedStore.getState();
const item = (id: string, extra: Partial<AnyFeedItem> = {}): AnyFeedItem => ({
  id, type: 'statusrapport_created', source: 'internal', createdAt: 1, payload: { text: id }, ...extra,
});
const thread = (id: string) => ({ kind: 'feed' as const, id });

beforeEach(() => {
  useFeedStore.setState({ items: [], hasMore: false, standalone: {} });
});

describe('feed list', () => {
  it('prependItem moves an existing post to the top instead of duplicating it (bumps)', () => {
    store().setPage({ items: [item('a'), item('b'), item('c')], hasMore: true });
    store().prependItem(item('c', { bump: { at: 9, reason: 'mention', byUid: 1, byName: 'Kari' } }));
    expect(store().items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(store().items[0].bump?.reason).toBe('mention');
  });

  it('appendPage skips posts that are already loaded', () => {
    store().setPage({ items: [item('a'), item('b')], hasMore: true });
    store().appendPage({ items: [item('b'), item('c')], hasMore: false });
    expect(store().items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(store().hasMore).toBe(false);
  });
});

describe('standalone posts (opened by link) stay in sync', () => {
  beforeEach(() => {
    store().setPage({ items: [item('a')], hasMore: false });
    store().setStandaloneItem(item('a'));
    store().setStandaloneItem(item('z'));
  });

  it('reactions and comments update every copy', () => {
    store().updateItemReactions('a', [{ emoji: '👍', uid: 1, actorName: 'Kari' }]);
    store().applyCommentEvent('z', {
      __type: 'comment_added', thread: thread('z'), comment: { id: 'c', author: { uid: 1, name: 'Kari' }, text: 'hei', createdAt: 1 },
    });
    expect(store().items[0].reactions).toHaveLength(1);
    expect(store().standalone.a.reactions).toHaveLength(1);
    expect(store().standalone.z.comments?.map((c) => c.id)).toEqual(['c']);
  });

  it('patchItems reaches both the list and standalone copies', () => {
    store().patchItems((i) => i.id === 'a', (i) => ({ ...i, mute: 'all' }));
    expect(store().items[0].mute).toBe('all');
    expect(store().standalone.a.mute).toBe('all');
    expect(store().standalone.z.mute).toBeUndefined();
  });

  it('a bump pushed for a standalone post refreshes that copy too', () => {
    store().prependItem(item('z', { sortAt: 5 }));
    expect(store().standalone.z.sortAt).toBe(5);
  });

  it('removeItem deletes the post everywhere', () => {
    store().removeItem('a');
    expect(store().items).toEqual([]);
    expect(store().standalone.a).toBeUndefined();
    expect(store().standalone.z).toBeDefined();
  });
});
