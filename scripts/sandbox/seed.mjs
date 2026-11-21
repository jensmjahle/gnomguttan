// Seeds a sandbox database with users, feed posts, comments, reactions and the
// per-user bumps that the comment history would have produced.
import { randomUUID } from 'node:crypto';
import { makeBouncingGif, makeMountainPng } from './seed-media.mjs';

export const USERS = [
  { uid: 1, name: 'Kari Nordmann', email: 'kari@test.no', isAdmin: true },
  { uid: 2, name: 'Ola Hansen', email: 'ola@test.no' },
  { uid: 3, name: 'Per Persen', email: 'per@test.no' },
  { uid: 4, name: 'Eva Berg', email: 'eva@test.no' },
  { uid: 5, name: 'Sindre Lie', email: 'sindre@test.no' },
  { uid: 6, name: 'Ingrid Dahl', email: 'ingrid@test.no' },
];

const MIN = 60_000;
const HOUR = 60 * MIN;

export async function seed(db, { computeBumpTargets, ObjectId }) {
  const now = Date.now();
  const photoId = new ObjectId();
  const gifId = new ObjectId();
  const ago = (minutes) => now - minutes * MIN;
  const user = (uid) => USERS.find((entry) => entry.uid === uid);
  const person = (uid) => ({ uid, name: user(uid).name, avatarUpdatedAt: 1 });
  const mention = (uid) => ({ uid, name: user(uid).name });

  function comment(uid, minutesAgo, text, extra = {}) {
    return { id: randomUUID(), author: person(uid), text, createdAt: ago(minutesAgo), ...extra };
  }
  const reply = comment;

  const feedItems = [];
  const feedComments = [];
  const feedReactions = [];
  function post({ type, uid, minutesAgo, payload, source = 'internal', reactions = {} }) {
    const item = {
      id: randomUUID(),
      type,
      source,
      payload,
      createdAt: ago(minutesAgo),
      ...(uid ? { actorUid: uid, actorName: user(uid).name } : {}),
    };
    feedItems.push(item);
    for (const [emoji, uids] of Object.entries(reactions)) {
      for (const reactor of uids) {
        feedReactions.push({ feedItemId: item.id, uid: reactor, emoji, actorName: user(reactor).name, createdAt: item.createdAt + MIN });
      }
    }
    return item;
  }

  // ── Statusrapport with a long thread ──
  const fjelltur = post({
    type: 'statusrapport_created', uid: 2, minutesAgo: 72 * 60,
    payload: { text: 'Noen som er klare for fjelltur i helga? 🏔️\nTenker Gaustatoppen hvis været holder.', actorAvatarUpdatedAt: 1 },
    reactions: { '👍': [1, 3], '🔥': [4] },
  });
  feedComments.push(
    { feedItemId: fjelltur.id, comment: comment(1, 70 * 60, 'Jeg er med! Har plass til tre i bilen.', {
      reactions: { '👍': [2, 3] },
      replies: [reply(2, 69 * 60, 'Perfekt, da booker vi deg som sjåfør 😄', { reactions: { '😂': [1] } })],
    }) },
    { feedItemId: fjelltur.id, comment: comment(3, 48 * 60, 'Må sjekke med jobben, men høres fett ut') },
    { feedItemId: fjelltur.id, comment: comment(4, 24 * 60, `@${user(3).name} du har sagt det tre helger på rad nå 👀`, {
      mentions: [mention(3)],
      reactions: { '😂': [1, 2, 6], '💀': [5] },
      replies: [
        reply(3, 23 * 60, 'Denne gangen er det sant!!'),
        reply(5, 22 * 60, 'Klassisk Per', { reactions: { '💯': [4] } }),
      ],
    }) },
    { feedItemId: fjelltur.id, comment: comment(5, 6 * 60, 'Værmeldingen ser bra ut, sol hele lørdagen ☀️') },
    { feedItemId: fjelltur.id, comment: comment(5, 3 * 60, 'Utsikten fra forrige gang vi var der oppe 😍', {
      imageId: photoId.toHexString(),
      reactions: { '😍': [1, 2, 6] },
    }) },
    { feedItemId: fjelltur.id, comment: comment(6, 70, `Kan noen ta med ekstra hodelykt? @${user(1).name} har du?`, { mentions: [mention(1)] }) },
  );

  // ── Event with its own comments ──
  const startsAt = new Date(now + 4 * 24 * HOUR);
  startsAt.setHours(18, 0, 0, 0);
  const eventId = randomUUID();
  const eventBase = {
    id: eventId,
    title: 'Grillfest på taket',
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 5 * HOUR).toISOString(),
    location: 'Taket i Kongens gate 12',
    description: 'Vi fyrer opp grillen og håper på sol. Ta med noe å grille og godt humør!',
    createdAt: ago(48 * 60),
    createdBy: person(1),
    responses: [
      { uid: 2, name: user(2).name, status: 'coming', respondedAt: ago(47 * 60) },
      { uid: 4, name: user(4).name, status: 'coming', respondedAt: ago(46 * 60) },
      { uid: 5, name: user(5).name, status: 'coming', respondedAt: ago(30 * 60) },
      { uid: 3, name: user(3).name, status: 'maybe', respondedAt: ago(20 * 60) },
    ],
    status: 'published',
    updatedAt: ago(90),
    publishedAt: ago(48 * 60),
    eventType: 'Sosialt',
    timeMode: 'fixed',
    timeProposals: [],
    timeProposalEditingEnabled: false,
    editMode: 'locked',
    coOrganizers: [person(4)],
    todos: [],
    todoEditingEnabled: false,
  };
  const eventComments = [
    comment(1, 47 * 60, 'Velkommen! Ta med det dere vil grille, så fikser vi kull og drikke 🍖', {
      reactions: { '🎉': [2, 4, 5] },
    }),
    comment(4, 24 * 60, 'Vi trenger noe å gjøre mellom pølsene 👇', {
      poll: {
        id: randomUUID(),
        question: 'Hvilket spill tar vi med?',
        allowMultiple: false,
        options: [
          { id: randomUUID(), label: 'Kubb', votes: [1, 2] },
          { id: randomUUID(), label: 'Mölkky', votes: [5] },
          { id: randomUUID(), label: 'Begge!', votes: [] },
        ],
        createdAt: ago(24 * 60),
        createdBy: person(4),
      },
    }),
    comment(2, 3 * 60, 'Kan jeg ta med en venn?', {
      replies: [
        reply(1, 2 * 60, 'Selvfølgelig! 🙌', { reactions: { '❤️': [2] } }),
        reply(4, 90, `@${user(2).name} husk å si ifra hvor mange dere blir`, { mentions: [mention(2)] }),
      ],
    }),
  ];
  const eventPost = post({
    type: 'community_event_created', uid: 1, minutesAgo: 48 * 60,
    payload: { ...eventBase, comments: [] },
    reactions: { '🎉': [2, 3, 4, 5] },
  });

  // ── Other card types ──
  const quote = {
    id: randomUUID(),
    text: 'Jeg har aldri tapt i Mölkky. Jeg har bare ikke vunnet ennå.',
    author: 'Sindre',
    createdAt: ago(36 * 60),
    createdBy: { uid: 3, name: user(3).name },
  };
  const overheard = post({ type: 'overheard_added', uid: 3, minutesAgo: 36 * 60, payload: quote, reactions: { '😂': [1, 2, 4, 6] } });
  feedComments.push({ feedItemId: overheard.id, comment: comment(5, 30 * 60, 'Står for det 💯', { reactions: { '💯': [3, 4] } }) });

  const pigs = post({ type: 'pigs_round_score', uid: 3, minutesAgo: 26 * 60, payload: { score: 87 } });
  feedComments.push(
    { feedItemId: pigs.id, comment: comment(2, 25 * 60, '87?? Juks') },
    { feedItemId: pigs.id, comment: comment(3, 24 * 60, 'Rent spill fra start til slutt 😇', { reactions: { '🤡': [2] } }) },
  );

  post({ type: 'wheel_spin_result', uid: 4, minutesAgo: 20 * 60, payload: { winner: 'Taco', totalOptions: 5 }, reactions: { '🎉': [1, 6] } });

  const issue = post({
    type: 'github_issue_opened', source: 'github', minutesAgo: 10 * 60,
    payload: {
      repo: 'example/gnomguttan',
      number: 142,
      title: 'Kommentarer på innlegg i feeden',
      url: 'https://github.com/example/gnomguttan/issues/142',
      user: 'testbruker',
      body: 'Det hadde vært fint å kunne kommentere på alt i feeden.',
      action: 'opened',
    },
  });
  feedComments.push({ feedItemId: issue.id, comment: comment(1, 9 * 60, 'Gleder meg til denne 👀') });

  const lamp = post({ type: 'lamp_toggled', uid: 5, minutesAgo: 5 * 60, payload: { isOn: true } });
  feedComments.push(
    { feedItemId: lamp.id, comment: comment(6, 4 * 60, 'Hvem skrudde på lampa midt på dagen?') },
    { feedItemId: lamp.id, comment: comment(5, 4 * 60 - 5, 'Det var stemning') },
    { feedItemId: lamp.id, comment: comment(2, 3 * 60, `@${user(5).name} stemning kl 14 på en tirsdag?`, { mentions: [mention(5)] }) },
  );

  const quiz = post({
    type: 'statusrapport_created', uid: 6, minutesAgo: 2 * 60,
    payload: {
      text: `Takk for i går @${user(3).name} og @${user(4).name}! Beste quizlaget 🏆`,
      actorAvatarUpdatedAt: 1,
      mentions: [mention(3), mention(4)],
    },
    reactions: { '❤️': [3, 4], '🏆': [1] },
  });
  feedComments.push(
    { feedItemId: quiz.id, comment: comment(2, 100, 'Neste gang er vi med!') },
    { feedItemId: quiz.id, comment: comment(4, 80, 'Vi er best! 🏆', { imageId: gifId.toHexString(), reactions: { '🔥': [3, 6] } }) },
  );

  post({ type: 'statusrapport_created', uid: 3, minutesAgo: 25, payload: { text: 'Kaffe i kantina om 10? ☕', actorAvatarUpdatedAt: 1 }, reactions: { '👍': [6] } });

  // ── Replay the comment history to produce the bumps the live code would have written ──
  const bumps = new Map();
  function replay(feedItem, threadComments, { ownerUids }) {
    const activities = threadComments.flatMap((entry) => [
      { at: entry.createdAt, entry, parentAuthorUid: undefined },
      ...(entry.replies ?? []).map((r) => ({ at: r.createdAt, entry: r, parentAuthorUid: entry.author.uid })),
    ]).sort((a, b) => a.at - b.at);

    for (const activity of activities) {
      const visible = threadComments
        .filter((entry) => entry.createdAt <= activity.at)
        .map((entry) => ({ ...entry, replies: (entry.replies ?? []).filter((r) => r.createdAt <= activity.at) }));
      const targets = computeBumpTargets({
        actorUid: activity.entry.author.uid,
        ownerUids,
        postMentionUids: (feedItem.payload?.mentions ?? []).map((m) => m.uid),
        comments: visible,
        newMentionUids: (activity.entry.mentions ?? []).map((m) => m.uid),
        parentAuthorUid: activity.parentAuthorUid,
      });
      for (const [uid, reason] of targets) {
        bumps.set(`${uid}:${feedItem.id}`, {
          uid, feedItemId: feedItem.id, bumpedAt: activity.at, reason,
          byUid: activity.entry.author.uid, byName: activity.entry.author.name, commentId: activity.entry.id,
        });
      }
    }
  }

  for (const item of feedItems) {
    if (item.type === 'community_event_created') continue;
    const threadComments = feedComments.filter((entry) => entry.feedItemId === item.id).map((entry) => entry.comment);
    replay(item, threadComments, { ownerUids: [item.actorUid] });
  }
  replay(eventPost, eventComments, { ownerUids: [eventPost.actorUid, eventBase.createdBy.uid, ...eventBase.coOrganizers.map((p) => p.uid)] });

  // ── Write everything ──
  await db.collection('users').insertMany(USERS.map(({ uid, name, email, isAdmin }) => ({
    uid, name, email, avatarUpdatedAt: 1, isAdmin: Boolean(isAdmin), isBot: false, updatedAt: now,
  })));
  await db.collection('community_events').insertOne({ ...eventBase, comments: eventComments });
  await db.collection('overheard_quotes').insertOne({ ...quote });
  await db.collection('feed_items').insertMany(feedItems.map((item) => ({ ...item })));
  await db.collection('feed_comments').insertMany(feedComments.map(({ feedItemId, comment: c }) => ({ ...c, feedItemId })));
  await db.collection('feed_reactions').insertMany(feedReactions);
  await db.collection('comment_images').insertMany([
    { _id: photoId, data: makeMountainPng(), mimeType: 'image/png', uid: 5, createdAt: ago(3 * 60) },
    { _id: gifId, data: makeBouncingGif(), mimeType: 'image/gif', uid: 4, createdAt: ago(80) },
  ]);
  if (bumps.size > 0) await db.collection('feed_bumps').insertMany([...bumps.values()]);

  return {
    posts: feedItems.length,
    comments: feedComments.length + eventComments.length,
    replies: [...feedComments.map((e) => e.comment), ...eventComments].reduce((n, c) => n + (c.replies?.length ?? 0), 0),
    bumps: bumps.size,
    eventId,
  };
}
