type BotContentType = 'text/plain' | 'text/markdown';

async function postBotMessage(path: string, content: string, contentType: BotContentType = 'text/plain') {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
    },
    body: content,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bot proxy request failed (${res.status}): ${body || path}`);
  }
}

export const botProxy = {
  sendTextToGroup(gid: number, content: string) {
    return postBotMessage(`/bot/send_to_group/${gid}`, content, 'text/plain');
  },

  sendMarkdownToGroup(gid: number, content: string) {
    return postBotMessage(`/bot/send_to_group/${gid}`, content, 'text/markdown');
  },

  sendTextToUser(uid: number, content: string) {
    return postBotMessage(`/bot/send_to_user/${uid}`, content, 'text/plain');
  },
};
