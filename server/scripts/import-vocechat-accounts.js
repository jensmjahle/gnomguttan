// One-time import of VoceChat accounts that haven't moved over by themselves. Run it just
// before VoceChat is switched off, then delete the copied database (it holds plaintext passwords).
//
//   docker cp <vocechat-data>/db/db.sqlite gnomguttan:/tmp/vocechat.sqlite
//   docker exec gnomguttan node server/scripts/import-vocechat-accounts.js /tmp/vocechat.sqlite --dry-run
//   docker exec gnomguttan node server/scripts/import-vocechat-accounts.js /tmp/vocechat.sqlite
//   docker exec gnomguttan rm /tmp/vocechat.sqlite
import { closeDatabase, ensureIndexes, getDatabase } from '../mongo.js';
import { importVoceChatAccounts } from '../vocechatImport.js';

const sqlitePath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!sqlitePath || sqlitePath.startsWith('--')) {
  console.error('Bruk: node server/scripts/import-vocechat-accounts.js <db.sqlite> [--dry-run]');
  process.exit(1);
}

try {
  await ensureIndexes();
  const report = await importVoceChatAccounts({ sqlitePath, getDatabase, dryRun });
  console.log(`${dryRun ? '[prøvekjøring] Ville importert' : 'Importerte'} ${report.imported.length}: ${report.imported.map((u) => `${u.name} (${u.uid})`).join(', ') || '–'}`);
  console.log(`Allerede flyttet: ${report.alreadyMoved}`);
  for (const s of report.skipped) console.log(`Hoppet over uid ${s.uid}: ${s.reason}`);
  for (const c of report.conflicts) console.log(`Konflikt for uid ${c.uid}: ${c.reason}`);
} finally {
  await closeDatabase();
}
