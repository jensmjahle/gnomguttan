import { describe, expect, it } from 'vitest';
import { actorsLabel, describeNotification } from './notificationText';
import type { AppNotification } from '@/types';

function notification(extra: Partial<AppNotification>): AppNotification {
  return {
    id: 'n', type: 'comment', subject: 'post', actors: [{ uid: 1, name: 'Kari' }], actorCount: 1,
    target: { kind: 'feed', id: 'p', commentId: 'c' }, context: 'Fjelltur', link: '/innlegg/p#c-c',
    createdAt: 1, updatedAt: 1, readAt: null, ...extra,
  };
}

describe('actorsLabel', () => {
  it('names one, two, or "N andre"', () => {
    const kari = { uid: 1, name: 'Kari' };
    const ola = { uid: 2, name: 'Ola' };
    expect(actorsLabel(notification({ actors: [kari], actorCount: 1 }))).toBe('Kari');
    expect(actorsLabel(notification({ actors: [kari, ola], actorCount: 2 }))).toBe('Kari og Ola');
    expect(actorsLabel(notification({ actors: [kari, ola], actorCount: 3 }))).toBe('Kari og 2 andre');
    expect(actorsLabel(notification({ actors: [kari], actorCount: 2 }))).toBe('Kari og 1 annen');
    expect(actorsLabel(notification({ actors: [], actorCount: 0 }))).toBe('Noen');
  });
});

describe('describeNotification', () => {
  it.each([
    [{ type: 'mention' as const }, 'nevnte deg i en kommentar på «Fjelltur»', '@'],
    [{ type: 'mention' as const, target: { kind: 'feed' as const, id: 'p' } }, 'nevnte deg i et innlegg: «Fjelltur»', '@'],
    [{ type: 'reply' as const }, 'svarte på kommentaren din på «Fjelltur»', '↩️'],
    [{ type: 'comment' as const }, 'kommenterte innlegget ditt «Fjelltur»', '💬'],
    [{ type: 'comment' as const, subject: 'event' as const }, 'kommenterte arrangementet ditt «Fjelltur»', '💬'],
    [{ type: 'thread' as const }, 'kommenterte også på «Fjelltur»', '💬'],
    [{ type: 'reaction' as const, subject: 'comment' as const, emojis: ['😂', '❤️'] }, 'reagerte 😂❤️ på kommentaren din på «Fjelltur»', '😂'],
    [{ type: 'reaction' as const, subject: 'post' as const, emojis: ['🔥'] }, 'reagerte 🔥 på innlegget ditt «Fjelltur»', '🔥'],
    [{ type: 'event' as const, subject: 'event' as const }, 'la ut et nytt arrangement: «Fjelltur»', '📅'],
  ])('%o', (extra, action, icon) => {
    const result = describeNotification(notification(extra));
    expect(result.action).toBe(action);
    expect(result.icon).toBe(icon);
  });

  it('leaves out the «» part when there is no context', () => {
    expect(describeNotification(notification({ context: '' })).action).toBe('kommenterte innlegget ditt');
  });
});
