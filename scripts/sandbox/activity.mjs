// Real API activity after boot, so the notification center has live data:
// mentions, replies, comments on others' posts, reactions and a new event.

async function api(base, method, path, uid, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': `sandbox-${uid}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runActivity(base, { eventId }) {
  const feed = (await api(base, 'GET', '/feed', 1)).items;
  const fjelltur = feed.find((item) => item.type === 'statusrapport_created' && item.actorName === 'Ola Hansen');
  const coffee = feed.find((item) => item.type === 'statusrapport_created' && item.actorName === 'Per Persen');
  const event = await api(base, 'GET', `/community-events/${eventId}`, 1);
  const kariEventComment = event.comments.find((comment) => comment.author.uid === 1);
  const kariFjellturComment = fjelltur.comments.find((comment) => comment.author.uid === 1);
  const eventThread = `/comment-threads/event/${eventId}/comments`;

  await api(base, 'POST', eventThread, 2, { text: '@Kari Nordmann skal jeg ta med grillen min også?', mentions: [{ uid: 1 }] });
  await pause(150);
  await api(base, 'POST', `${eventThread}/${kariEventComment.id}/replies`, 3, { text: 'Jeg tar med kull 🔥' });
  await pause(150);
  await api(base, 'POST', eventThread, 5, { text: 'Gleder meg!' });
  await pause(150);
  await api(base, 'POST', eventThread, 6, { text: 'Jeg blir med også 🙌' });
  await pause(150);
  await api(base, 'POST', `/comment-threads/feed/${fjelltur.id}/comments/${kariFjellturComment.id}/reactions`, 6, { emoji: '❤️' });
  await api(base, 'POST', `/comment-threads/feed/${fjelltur.id}/comments/${kariFjellturComment.id}/reactions`, 3, { emoji: '😂' });
  await pause(150);
  await api(base, 'POST', `/feed/${coffee.id}/reactions`, 1, { emoji: '☕' });
  await pause(150);

  const startsAt = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
  startsAt.setHours(19, 0, 0, 0);
  await api(base, 'POST', '/community-events', 4, {
    title: 'Quizkveld på Lompa',
    startsAt: startsAt.toISOString(),
    location: 'Lompa',
    description: 'Lagene trekkes på stedet.',
    status: 'published',
    editMode: 'locked',
  });
}
