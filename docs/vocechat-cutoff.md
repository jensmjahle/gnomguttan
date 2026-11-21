# Switching off VoceChat logins (the cutoff)

Logins have moved from VoceChat to Gnomguttan's own accounts. Until a cutoff date, both work side by side. This guide covers how to get everyone moved over, run the cutoff, and turn VoceChat off afterwards.

VoceChat keeps passwords **in plaintext** in its database. Treat any copy of that database like a list of everyone's passwords: keep it off shared drives and out of Git and chat, and delete it when you're done.

## What happens before and after the cutoff

| | Before `VOCECHAT_CUTOFF` | After it |
|---|---|---|
| Logging in on the site | Our own accounts. Someone without one is checked against VoceChat once, and their password is then hashed and stored here | Our own accounts only |
| VoceChat tokens on the API (GnomChat, tabs opened before the update) | Accepted | Refused (401) |
| Galleri and Arkiv | Served from our copy, which tops itself up from VoceChat | Served from our copy; nothing new arrives |
| Files not copied yet | Redirect to VoceChat's own link | Gone once VoceChat is switched off |

`VOCECHAT_CUTOFF` takes any date `Date.parse` understands: `2027-03-01` (midnight UTC) or `2027-03-01T18:00:00+01:00`. Leave it empty for no cutoff.

## In the weeks before

1. **Pick a date and set it** in the server's `.env` or `docker-compose.yml` (`VOCECHAT_CUTOFF=…`), then redeploy. The server warns in its log if it can't read the date.
2. **Tell everyone to log in once** on the site with their usual email and password. That moves their password over. Anyone who doesn't is handled by the import on the day (below).
3. **Follow progress** in Profil → Kontoinnstillinger → Medlemmer (admins only). It shows "N av M har logget inn med den nye innloggingen" and, per person, either how they moved or "ikke logget inn ennå".
4. **Fill up the media copy.** It tops itself up whenever someone opens Galleri or Arkiv while still logged in to VoceChat (at most every 10 minutes). Check it with `GET /app-api/vocechat-media/status`:

   ```json
   { "total": 1843, "stored": 1843, "pending": 0, "missing": 2, "lastSyncError": null, "active": true }
   ```

   - `pending` should reach 0.
   - `missing` are files VoceChat itself no longer has; they can't be saved.
   - Galleri and Arkiv show "Kopierer fra VoceChat: X av Y" while the copy is catching up.
5. **Check the disk.** The copy lives in `VOCECHAT_MEDIA_DIR` (the `vocechat-media` Docker volume), and `storedBytes` in the status shows how much space it takes.

Files sent in **direct messages are not copied**. Files from **private channels** are only shown to that channel's members and admins. Old chat messages are not copied either.

## On the day

Do these steps in this order. In particular, the cutoff has to be in place before VoceChat stops, so the site doesn't keep trying to reach VoceChat.

### 1. Last media sync (VoceChat still running)

Log in as an admin, open **Galleri**, and wait until the "Kopierer fra VoceChat" line is gone. To skip the 10-minute wait, an admin can force a sync from the browser console. Open Galleri first, which refreshes the browser's VoceChat login, then run:

```js
const state = JSON.parse(localStorage.getItem('gnomguttan-auth') ?? sessionStorage.getItem('gnomguttan-auth')).state;
await fetch('/app-api/vocechat-media/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': state.token, 'X-VoceChat-Token': state.vocechat.token },
  body: JSON.stringify({ force: true }),
}).then((r) => r.json());
```

Then check `GET /app-api/vocechat-media/status` until `pending` is 0.

### 2. Set the cutoff to now

If the date in `VOCECHAT_CUTOFF` hasn't passed yet, set it to now (e.g. `2027-03-01T18:00:00+01:00`) and redeploy. From this moment only our own logins work. People who haven't moved yet can't log in until step 4, so keep steps 2–4 close together.

### 3. Stop VoceChat

Stop the VoceChat server cleanly (e.g. `docker stop <vocechat-container>`). A clean shutdown writes everything into the database file, so the copy in the next step is complete.

### 4. Import everyone who never logged in

VoceChat's database is `db/db.sqlite` inside its data folder (in the official Docker image this is usually mounted at `/home/vocechat-server/data`). If `db.sqlite-wal` and `db.sqlite-shm` sit next to it, copy them along with it.

```bash
# Copy the database to the Gnomguttan host (use scp/ssh; never via chat or a shared drive)
scp vocechat-host:/path/to/vocechat-data/db/db.sqlite /tmp/vocechat.sqlite
docker cp /tmp/vocechat.sqlite gnomguttan:/tmp/vocechat.sqlite

# Dry run: lists who would be imported, writes nothing
docker exec gnomguttan node server/scripts/import-vocechat-accounts.js /tmp/vocechat.sqlite --dry-run

# The real import
docker exec gnomguttan node server/scripts/import-vocechat-accounts.js /tmp/vocechat.sqlite

# Delete every copy straight away
docker exec gnomguttan rm /tmp/vocechat.sqlite
rm /tmp/vocechat.sqlite
```

The script prints names and uids, never passwords:

- **Importerte N:** passwords hashed and stored; these people can now log in with their old VoceChat password.
- **Allerede flyttet:** they logged in on the site already and keep the password they have there.
- **Hoppet over:**
  - bots and guests;
  - people without a password (they used another login method in VoceChat);
  - people without a valid email.
- **Konflikt:** their email already belongs to another account. Sort these out by hand. Usually one person has two VoceChat accounts; give the right one a reset link (see below).

Running it twice is safe: anyone already moved is left alone.

### 5. Check

- Profil → Kontoinnstillinger → Medlemmer: everyone who should be there shows as moved.
- Log in as one of the imported people (or ask one to).
- Galleri and Arkiv still show their pictures and files, now served only from our copy.

## When VoceChat is switched off for good

These still talk to VoceChat and stop working with it. Have their replacements ready, or accept that they go away:

- **The site's "Chat" page.** Chat2.0 (Matrix) replaces it.
- **The GnomChat app.** It's a VoceChat chat client.
- **Features using the VoceChat bot (`VOCECHAT_BOT_API_KEY`):**
  - DMs when someone is @mentioned in a comment or statusrapport;
  - event reminders and photo reminders;
  - new-event announcements in the VoceChat channel (the Matrix info bot, `docs/matrix-info-bot.md`, can take over);
  - background push to GnomChat.
- **Profile pictures.** Until profile pictures live on our server (the profiles PR), avatars load from VoceChat and fall back to initials when it's gone.

Afterwards, remove `VOCECHAT_BOT_API_KEY` so the server stops trying to reach the bot. `VOCECHAT_HOST` can stay as it is. `docker-compose.yml` falls back to the old address when it's empty anyway, and nothing needs it to answer.

**VoceChat's data folder holds everyone's passwords in plaintext.** Once you're sure nothing more is needed from it, delete it. If you must keep a backup for a while, encrypt it, keep it offline, and set a date to delete it.

## If something goes wrong

- **Someone can't log in after the cutoff.** They weren't imported (e.g. no password in VoceChat) or hit a conflict. An admin makes a reset link: Profil → Kontoinnstillinger → Medlemmer → "Lag lenke for nytt passord". Send the link to them directly; it works once, for 24 hours.
- **The cutoff came too early.** As long as VoceChat is still running, clear `VOCECHAT_CUTOFF` (or set a later date) and redeploy. VoceChat logins and tokens work again.
- **The media sync reports `lastSyncError`.** "VoceChat-innloggingen er utløpt" just means the browser's VoceChat login ran out. Log out and in on the site (which logs in to VoceChat again), then open Galleri.
