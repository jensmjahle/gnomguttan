# GnomChat

A standalone [Expo](https://expo.dev) mobile app that replaces the VoceChat
mobile client. It connects to the **same** self-hosted VoceChat server the
website uses (`https://chat.gnomguttan.no`) and does **chat only**: group
channels, direct messages, avatars, markdown messages, realtime updates and
local push notifications.

It also **inherits the website's themes and fonts** — see [Theming](#theming).

## Quick start

```bash
cd gnomchat
npm install          # postinstall runs scripts/sync-theme.mjs automatically
npm start            # Expo dev server → open in Expo Go / emulator
```

Set the server it connects to (defaults to `https://chat.gnomguttan.no`):

```bash
cp .env.example .env
# EXPO_PUBLIC_VOCECHAT_HOST=https://chat.gnomguttan.no
```

Sign in with your VoceChat email + password (same credentials as the website).

## How it connects to VoceChat

Ported near 1:1 from the website's `src/services/*`:

- **Login**: `POST /api/token/login` with `{ credential: { type:'password', email, password }, device:'mobile' }` — password is sent **in clear text** (VoceChat hashes server-side; the website does the same).
- **Auth**: `X-API-Key: <token>` header on every request.
- **Token renew**: `POST /api/token/renew` with a 20s margin, single-flight.
- **Realtime**: SSE on `GET /api/user/events?api-key=<token>` via `react-native-sse` (React Native has no built-in `EventSource`), with manual reconnect using a fresh token.
- Tokens are stored in `expo-secure-store`, not plain storage.

## Theming

The **single source of truth lives in the website repo** (the parent folder).
`scripts/sync-theme.mjs` derives RN-consumable tokens from it so a theme change
on the website propagates to the app on the next build:

| Website source                | Used for                                   |
| ----------------------------- | ------------------------------------------ |
| `../src/styles/themes.css`    | Per-theme color tokens (11 themes)         |
| `../src/styles/globals.css`   | Global radius / shadow tokens              |
| `../src/config/themes.ts`     | Theme metadata (id / label / description)  |
| `../public/fonts/*.ttf`       | Futura PT font weights                      |
| `../public/images/backgrounds`| Theme background images                     |
| `../public/logo.png`          | App icon / splash / notification icon       |

The script writes `src/theme/themeTokens.generated.ts` (do not edit by hand) and
copies the shared assets into `assets/`. It runs on `postinstall`, via
`npm run sync-theme`, and in CI before each build.

```bash
npm run sync-theme   # re-generate after changing a website theme
```

## Releases — Android closed testing

`.github/workflows/gnomchat-android.yml` runs on changes to `gnomchat/**`:

- **Pull request → `main`**: builds the app locally with EAS to verify it
  compiles before merging. **No deploy.** This check is optional — it isn't a
  required status check unless you add it to branch protection.
- **Merge / push → `main`**: builds **and** submits to Google Play
  **Closed testing** (alpha track).

Details:

- `versionName` comes from `package.json`; `versionCode` is the GitHub run number.
- Build: `eas build --platform android --profile production --local`.
- Submit (push to main only): `eas submit --profile closed` (track `alpha`).

### Required GitHub secrets

| Secret                             | Purpose                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| `EXPO_TOKEN`                       | Expo access token for `eas build --local` and `eas submit`.   |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`  | Google Play service account JSON with release-to-closed access |

### One-time prerequisites

- The app must exist in **Google Play Console** with package id `com.gnomchat.mobile` and at least one manual upload before `eas submit` to a track works.
- Android signing credentials are managed by EAS (`eas credentials`) — generate a keystore the first time.

## Project layout

```
gnomchat/
  app.config.js              # Expo config (version injectable via APP_VERSION env)
  eas.json                   # build + submit (closed/open/production) profiles
  scripts/sync-theme.mjs     # derives theme tokens + assets from the website repo
  src/
    config.ts, types.ts
    theme/                   # ThemeProvider, useTheme, generated tokens, fonts, background
    services/                # api, session, vocechat, sse, notifications
    store/                   # authStore (SecureStore), chatStore
    hooks/                   # useAuth, useChatStream
    screens/                 # Login, ChannelList, Chat, Theme
    components/              # Avatar, MarkdownText, MessageBubble
```

## Limitations (v1)

- **Background push** needs an FCM sender VoceChat doesn't provide, so v1 raises **local** notifications driven by the SSE stream while the app runs. True remote push is a possible follow-up.
