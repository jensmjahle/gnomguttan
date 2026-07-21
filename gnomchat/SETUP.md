# GnomChat — one-time setup for CI builds & Google Play

The GitHub workflow builds the Android app **on the GitHub runner** with
`eas build --local` (no EAS cloud build minutes) and submits it to Google Play
**Closed testing**. To make that work you need an Expo account (for signing
credentials), a Google Play app + service account, and two GitHub secrets.

Do the steps in order. Commands marked `!` are interactive — run them in the
Claude Code prompt by typing the line starting with `!`, or in your own terminal
from the `gnomchat/` folder.

---

## 1. Expo project (account already set up — logged in as `jensmjahle`)

`owner` is already set to `jensmjahle` in `app.config.js`. Just link the project
to get a Project ID (from `gnomchat/`):

```
! eas init
```

It prints a **Project ID**. Put it in `app.config.js` → `extra.eas.projectId`
(or set env `EAS_PROJECT_ID`).

> Tell me the printed Project ID and I'll paste it into `app.config.js` for you.

## 2. First build (also sets up the signing keystore)

The easiest first AAB is an **EAS cloud build** — it auto-generates and stores the
Android keystore on your Expo account (which the CI `--local` build then reuses
via `EXPO_TOKEN`):

```
! eas build -p android --profile production
```

When prompted "Generate a new Android Keystore?", answer **yes**. When it
finishes, download the `.aab`.

> Alternative: you don't even have to build locally. Once secrets are set (steps
> 4–6) you can trigger the workflow manually (**Actions → GnomChat → Run
> workflow**) and download the built AAB from the run's **Artifacts**, then use
> that for the manual upload below.

## 3. Create the Play Console app + manual first upload

Google Play requires the app to already exist with **one manually uploaded AAB**
before automated `eas submit` to a track works.

1. Go to https://play.google.com/console → **Create app**.
   - Package name **must** be `com.gnomchat.mobile`.
2. Create a **Closed testing** track and **upload the AAB from step 2 manually**
   once. Add yourself as a tester.

## 4. Google service account (for automated submit)

1. Play Console → **Setup → API access**.
2. Link/create a Google Cloud project, then **Create service account**.
3. In Google Cloud, create a **JSON key** for that service account and download it.
4. Back in Play Console → API access → grant the service account access with at
   least **Release to testing tracks** permission.

## 5. Expo access token (for CI)

expo.dev → your avatar → **Account settings → Access tokens → Create token** →
copy it.

## 6. Add the two GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name                       | Value                                                |
| --------------------------------- | ---------------------------------------------------- |
| `EXPO_TOKEN`                       | the Expo access token from step 5                    |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`  | the **entire contents** of the JSON key from step 4  |

## 7. Test it

1. Open a pull request to `main` that touches `gnomchat/**` → the workflow builds
   the app (no deploy) so you can see it compiles. (This check is optional — it
   isn't required to merge unless you add it under branch protection.)
2. Merge to `main` → the workflow builds **and** submits to Closed testing.
   Watch it under the repo's **Actions** tab; the new build appears in Play
   Console → Testing → Closed testing.

---

### Quick reference: what runs where

- **Compilation**: GitHub Actions runner (`eas build --local`). No EAS cloud minutes.
- **Signing keystore**: stored on your Expo account, fetched in CI via `EXPO_TOKEN`.
- **Upload to Play**: `eas submit` from the runner using `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`.
