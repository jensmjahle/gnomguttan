/** Send a plain-text DM from the VoceChat bot to a single user. */
export async function sendBotDirectMessage({ vocechatHost, botApiKey, userId, message }) {
  const response = await fetch(`${vocechatHost}/api/bot/send_to_user/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-API-Key': botApiKey },
    body: message,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Bot DM request failed (${response.status})`);
  }
}
