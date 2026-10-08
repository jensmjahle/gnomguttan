import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { MsgType, RelationType, type MatrixEvent } from 'matrix-js-sdk';

export function sanitizeMatrixHtml(html: string): string {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'del', 's', 'u', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span'],
    ALLOWED_ATTR: ['href', 'title', 'start', 'data-mx-spoiler'],
    ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|matrix:|#)/i,
    RETURN_DOM_FRAGMENT: true,
  });
  fragment.querySelectorAll('a[href]').forEach(link => { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); });
  const container = document.createElement('div'); container.append(fragment); return container.innerHTML;
}
export function markdownHtml(source: string): string {
  return sanitizeMatrixHtml(marked.parse(source, { async: false, gfm: true, breaks: true }));
}
export function markdownContent(source: string) {
  return { msgtype: MsgType.Text as const, body: source, format: 'org.matrix.custom.html' as const, formatted_body: markdownHtml(source), 'org.gnomguttan.markdown': source };
}
export function displayedContent(event: MatrixEvent, events: MatrixEvent[]) {
  const replacement = events.filter(candidate => !candidate.isRedacted() && !candidate.isDecryptionFailure() && candidate.status !== 'not_sent' && candidate.getSender() === event.getSender() && candidate.getType() === 'm.room.message' && candidate.getRelation()?.rel_type === RelationType.Replace && candidate.getRelation()?.event_id === event.getId() && candidate.getContent()['m.new_content']?.msgtype === event.getOriginalContent().msgtype)
    .sort((a, b) => b.getTs() - a.getTs())[0];
  return { content: replacement?.getContent()['m.new_content'] || event.getContent(), edited: Boolean(replacement || event.replacingEventId()) };
}
