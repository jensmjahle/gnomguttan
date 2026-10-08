// Matrix notices are additive: the existing VoceChat announcements stay unchanged.
const details = { title: 'navn', startsAt: 'tidspunkt', endsAt: 'sluttid', location: 'sted', description: 'beskrivelse', imageUrl: 'bilde', eventType: 'arrangementstype', customEventType: 'arrangementstype', timeMode: 'tidsplan' };
const text = value => typeof value === 'string' ? value.trim() : '';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const list = value => Array.isArray(value) ? value : [];
const sorted = values => [...values].sort((a, b) => String(a.id ?? a.uid).localeCompare(String(b.id ?? b.uid)));
const people = values => sorted(list(values).map(person => ({ uid: person.uid, status: person.status })));
const reactions = value => Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, uids]) => [key, [...list(uids)].sort((a, b) => a - b)]));
const proposals = values => sorted(list(values).map(proposal => ({ id: proposal.id, label: proposal.label, startsAt: proposal.startsAt, endsAt: proposal.endsAt || '', votes: [...list(proposal.votes)].sort((a, b) => a - b) })));
const todos = values => sorted(list(values).map(todo => ({ id: todo.id, title: todo.title, mode: todo.mode, assignee: todo.assignee?.uid, claimedBy: todo.claimedBy?.uid, completedAt: todo.completedAt || null })));
function comments(values) {
  return sorted(list(values).map(comment => ({ id: comment.id, text: comment.text || '', imageUrl: comment.imageUrl || '', reactions: reactions(comment.reactions),
    replies: sorted(list(comment.replies).map(reply => ({ id: reply.id, text: reply.text, reactions: reactions(reply.reactions) }))),
    poll: comment.poll ? { id: comment.poll.id, question: comment.poll.question, allowMultiple: Boolean(comment.poll.allowMultiple), options: sorted(list(comment.poll.options).map(option => ({ id: option.id, label: option.label || '', imageUrl: option.imageUrl || '', votes: [...list(option.votes)].sort((a, b) => a - b) }))) } : null,
  })));
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
export function buildMatrixEventNotice(previous, event, actor, publicUrl = 'https://gnomguttan.no') {
  // Drafts and published events being returned to draft never leak into the chat.
  if (event && event.status !== 'published') return null;
  if (!event && previous?.status !== 'published') return null;
  const current = event || previous; if (!current?.id) return null;
  const title = text(current.title) || 'Et arrangement'; const actorName = text(actor?.name) || 'Noen';
  let kind; let introduction; const changes = [];
  const add = (emoji, label, message) => changes.push({ emoji, label, message });
  if (!event) { kind = 'deleted'; introduction = `${title} er slettet av ${actorName}.`; }
  else if (previous?.status !== 'published') {
    kind = 'created'; introduction = `${actorName} har opprettet et nytt arrangement. Si fra om du kommer!`;
  } else {
    kind = 'updated';
    const changedDetails = [...new Set(Object.entries(details).filter(([key]) => (previous[key] || '') !== (event[key] || '')).map(([, label]) => label))];
    if (changedDetails.length) add('📝', 'Arrangement oppdatert', `Endret ${changedDetails.join(', ')}.`);
    if (!equal(people(previous.responses), people(event.responses))) {
      const own = list(event.responses).find(response => response.uid === actor?.uid);
      const ownChanged = own && list(previous.responses).find(response => response.uid === actor?.uid)?.status !== own.status;
      add(!ownChanged ? '👥' : own.status === 'coming' ? '✅' : own.status === 'maybe' ? '🤔' : '❌', 'Deltakersvar', ownChanged ? `${actorName} ${own.status === 'coming' ? 'kommer' : own.status === 'maybe' ? 'kommer kanskje' : 'kan ikke komme'}.` : 'Deltakersvar er oppdatert.');
    }
    if (!equal(proposals(previous.timeProposals), proposals(event.timeProposals))) add('🗓️', 'Tidsforslag', 'Tidsforslag eller stemmer er oppdatert.');
    if (!equal(todos(previous.todos), todos(event.todos))) add('📋', 'Oppgaver', 'Oppgavelisten er oppdatert.');
    const beforeComments = comments(previous.comments); const afterComments = comments(event.comments);
    if (!equal(beforeComments, afterComments)) {
      const fresh = afterComments.filter(comment => !beforeComments.some(old => old.id === comment.id));
      if (fresh.some(comment => comment.poll)) add('🗳️', 'Ny avstemning', 'Ny avstemning i diskusjonen.');
      if (fresh.some(comment => comment.text || comment.imageUrl)) add('💬', 'Nytt innlegg', 'Nytt innlegg i diskusjonen.');
      if (!fresh.length) add('💬', 'Diskusjonen', 'Diskusjonen er oppdatert (innlegg, svar, stemmer eller reaksjoner).');
    }
    if (!equal(sorted(list(previous.coOrganizers).map(person => ({ uid: person.uid }))), sorted(list(event.coOrganizers).map(person => ({ uid: person.uid }))))) add('👥', 'Arrangører', 'Medarrangører er oppdatert.');
    if (['editMode', 'timeProposalEditingEnabled', 'todoEditingEnabled'].some(key => previous[key] !== event[key])) add('⚙️', 'Innstillinger', 'Arrangementsinnstillingene er oppdatert.');
    if (!changes.length) return null;
    introduction = `${actorName} oppdaterte ${title}.`;
  }
  const url = `${publicUrl.replace(/\/$/, '')}/arrangementer/${encodeURIComponent(current.id)}`;
  const heading = kind === 'created' ? '🎉 Nytt arrangement' : kind === 'deleted' ? '🗑️ Arrangement slettet' : changes.length === 1 ? `${changes[0].emoji} ${changes[0].label}` : '📝 Nytt i arrangementet';
  const facts = [];
  if (event && (kind === 'created' || ['startsAt', 'endsAt', 'timeMode'].some(key => previous?.[key] !== event[key]))) {
    if (event.timeMode === 'proposed') facts.push({ emoji: '🗓️', label: 'Tid', value: 'Stem på tidsforslag i arrangementet' });
    else if (event.startsAt && !Number.isNaN(Date.parse(event.startsAt))) {
      const date = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(event.startsAt));
      facts.push({ emoji: '🗓️', label: 'Tid', value: date });
    }
  }
  if (event && text(event.location) && (kind === 'created' || previous?.location !== event.location)) facts.push({ emoji: '📍', label: 'Sted', value: text(event.location) });
  const body = [heading, title, '', introduction, ...facts.map(fact => `${fact.emoji} ${fact.label}: ${fact.value}`), ...changes.map(change => `${change.emoji} ${change.message}`), ...(event ? ['', `Se arrangementet: ${url}`] : [])].join('\n');
  const html = `<p><strong>${escapeHtml(heading)}</strong><br><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(introduction)}</p>${facts.length ? `<p>${facts.map(fact => `${fact.emoji} <strong>${escapeHtml(fact.label)}:</strong> ${escapeHtml(fact.value)}`).join('<br>')}</p>` : ''}${changes.length ? `<ul>${changes.map(change => `<li>${change.emoji} <strong>${escapeHtml(change.label)}:</strong> ${escapeHtml(change.message)}</li>`).join('')}</ul>` : ''}${event ? `<p><a href="${escapeHtml(url)}">📖 Se arrangementet →</a></p>` : ''}`;
  const md = value => String(value).replace(/[\\`*_{}\[\]()#+.!<>|~-]/g, '\\$&');
  const markdown = [`**${md(heading)}**`, `**${md(title)}**`, '', md(introduction), ...facts.map(fact => `${fact.emoji} **${md(fact.label)}:** ${md(fact.value)}`), ...(changes.length ? ['', ...changes.map(change => `- ${change.emoji} **${md(change.label)}:** ${md(change.message)}`)] : []), ...(event ? ['', `[📖 Se arrangementet →](${url})`] : [])].join('\n');
  return { kind, eventId: current.id, revision: current.updatedAt || current.publishedAt || current.createdAt || 0,
    content: { msgtype: 'm.notice', body, format: 'org.matrix.custom.html', formatted_body: html, 'org.gnomguttan.markdown': markdown, 'org.gnomguttan.event': { id: current.id, kind } },
  };
}
