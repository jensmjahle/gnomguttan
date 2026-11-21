// The final sweep before VoceChat is switched off: moves everyone whose password never
// reached us (they didn't log in after the new login came) over from VoceChat's own
// SQLite database. VoceChat stored passwords in plaintext; they are hashed on the way in
// and never printed. People who already moved keep the password they have here.
import { DatabaseSync } from 'node:sqlite';
import { createAuthService, normalizeEmail } from './auth.js';
import { COLLECTIONS } from './mongo.js';

export async function importVoceChatAccounts({ sqlitePath, getDatabase, dryRun = false }) {
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const columns = new Set(sqlite.prepare('PRAGMA table_info(user)').all().map((c) => c.name));
    const optional = ['is_bot', 'is_guest'].filter((c) => columns.has(c));
    const rows = sqlite
      .prepare(`SELECT uid, name, email, password, is_admin${optional.map((c) => `, ${c}`).join('')} FROM user`)
      .all();

    const db = await getDatabase();
    const auth = createAuthService({ getDatabase });
    const report = { imported: [], alreadyMoved: 0, skipped: [], conflicts: [] };

    for (const row of rows) {
      const uid = Number(row.uid);
      const email = normalizeEmail(row.email);
      if (row.is_bot || row.is_guest) { report.skipped.push({ uid, reason: 'bot eller gjest' }); continue; }
      if (!row.password) { report.skipped.push({ uid, reason: 'uten passord (logget inn på annen måte)' }); continue; }
      if (!email) { report.skipped.push({ uid, reason: 'uten gyldig e-post' }); continue; }
      if (await db.collection(COLLECTIONS.accounts).findOne({ uid })) { report.alreadyMoved += 1; continue; }
      const taken = await db.collection(COLLECTIONS.accounts).findOne({ email });
      if (taken) { report.conflicts.push({ uid, reason: `e-posten brukes allerede av uid ${taken.uid}` }); continue; }

      if (!dryRun) {
        await auth.adoptVoceChatUser({
          uid,
          name: String(row.name ?? '').trim(),
          email,
          isAdmin: Boolean(row.is_admin),
        }, String(row.password), 'vocechat-import');
      }
      report.imported.push({ uid, name: String(row.name ?? '') });
    }
    return report;
  } finally {
    sqlite.close();
  }
}
