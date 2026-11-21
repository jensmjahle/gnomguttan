# GnomChat

The Gnomguttan phone app (Expo / React Native). It signs in with the same
Gnomguttan account as the website and does everything the website does, with
native screens: the feed (posts, reactions, comments, mentions, statusrapporter),
notifications, the Matrix chat (end-to-end encrypted), calendar and events,
gallery, albums and the archive, profiles, Overhørt, Kino, Lampa, Ølbørs,
Valheim, the games (Kast grisene, Lykkehjulet, Krokodil, Turnering), Dev,
Buss, settings, sessions and admin.

It **inherits the website's themes and fonts** — see [Theming](#theming).

## Quick start

```bash
cd gnomchat
npm install          # postinstall runs scripts/sync-theme.mjs and scripts/sync-shared.mjs
npm start            # Expo dev server → open in a development build / emulator
```

The servers it talks to (defaults shown) can be changed in `.env` (see `.env.example`):

- `EXPO_PUBLIC_APP_API_HOST=https://gnomguttan.no` — login and every `/app-api` call
- `EXPO_PUBLIC_MATRIX_HOMESERVER_URL=https://gnomchat.gnomguttan.no` — the chat

## How it fits together

- **Login**: `POST /app-api/auth/login` (our own accounts, `server/auth.js`). The
  `gns_…` session token is kept in `expo-secure-store` and sent as `X-API-Key`.
  Invite and reset links (`/registrer#…`, `/tilbakestill#…`) can be pasted on the
  login screen. A 401 signs the app out (e.g. after «Logg ut alle andre enheter»).
- **Offline cache**: every `/app-api` read goes through TanStack Query, persisted
  to AsyncStorage (`src/data/queryClient.ts`). Screens show the last known data at
  once and offline, and refresh in the background. Images are cached by
  `expo-image`; Matrix media is decrypted once into the cache folder.
- **Live updates**: the website's feed stream (`/app-api/feed/events`) is open while
  the app is in the foreground; posts, reactions, comments, typing and notifications
  are written straight into the cache (`src/data/liveUpdates.ts`).
- **Chat (Matrix)**: React Native can't run WebAssembly, which the Matrix Rust crypto
  needs. So the encrypted client (matrix-js-sdk + Rust crypto, the same code as
  Chat2.0 on the website) runs in an invisible WebView with the website's
  `/matrix-engine.html`, and every chat screen is native and talks to it through a
  typed bridge (`src/matrix/`, protocol in `../src/matrix-engine/protocol.ts`).
  Its sync cache and crypto keys live in that WebView's IndexedDB; the room list and
  recent messages are also kept in AsyncStorage for instant, offline display.
- **Shared code**: `scripts/sync-shared.mjs` copies the website's API types, the
  engine protocol, the tournament engine and a few pure helpers into
  `src/**/*.generated.ts`. Don't edit those by hand.

## Push notifications

Two kinds, both delivered with Expo push:

1. **App notifications** (mentions, replies, comments, reactions, new events). The
   server pushes every notification it stores (`server/notifications.js`), unless
   the user turned off «Push-varsler på mobilen». Grouped notifications buzz at most
   every 15 minutes.
2. **Chat messages**. The app registers an HTTP pusher on the Matrix homeserver with
   its Expo token as pushkey and `https://gnomguttan.no/_matrix/push/v1/notify` as
   the URL. That endpoint (`server/matrixPushGateway.js`) is a Matrix push gateway:
   it only delivers to tokens a signed-in app has registered, and works for
   encrypted rooms too (the text then says «Sendte en kryptert melding»).
   `MATRIX_PUSH_GATEWAY_URL` overrides the URL if the website is reached differently.

Tapping a notification opens the right screen. Messages for the room you are
looking at don't buzz.

**Android needs Firebase (FCM) for this to work at all** — see SETUP.md, step 8.
Without `google-services.json` in the build, registering for push fails and the
app says so under Innstillinger → Varsler.

## Theming

The **single source of truth lives in the website repo** (the parent folder).
`scripts/sync-theme.mjs` derives RN tokens from it so a theme change on the
website propagates to the app on the next build:

| Website source                | Used for                                   |
| ----------------------------- | ------------------------------------------ |
| `../src/styles/themes.css`    | Per-theme color tokens                     |
| `../src/styles/globals.css`   | Global radius / shadow tokens              |
| `../src/config/themes.ts`     | Theme metadata (id / label / description)  |
| `../public/fonts/*.ttf`       | Futura PT font weights                      |
| `../public/images/backgrounds`| Theme background images                     |
| `../public/logo.png`          | App icon / splash / notification icon       |

## Releases — Google Play

Real releases go through **Actions → Release · GnomChat Android**
(`.github/workflows/release-android.yml`, or the button in the root README). It
creates the next `android-v*` tag and submits to the Play track for the stage:
`alpha` → closed testing, `beta` → open testing, `production` → production.

`.github/workflows/gnomchat-android.yml` builds on pull requests that touch
`gnomchat/**` and builds + submits to **Internal testing** on pushes to `main`.

The website must be deployed with `matrix-engine.html` (any web release after this
change) before an app with the native chat goes out.

### Required GitHub secrets

| Secret                             | Purpose                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| `EXPO_TOKEN`                       | Expo access token for `eas build --local` and `eas submit`.   |
| `GOOGLE_SERVICES_JSON`             | The Firebase `google-services.json` for push (or commit the file in `gnomchat/`). |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`  | Google Play service account JSON for submitting builds.      |

## Project layout

```
gnomchat/
  App.tsx                    # navigation: tabs (Hjem, Chat, Kalender, Galleri, Mer) + stack
  app.config.js              # Expo config (version, Firebase, permissions)
  scripts/                   # sync-theme.mjs, sync-shared.mjs
  src/
    config.ts
    data/                    # query client + cache, live updates, users/events/obligations
    matrix/                  # engine bridge, WebView host, store, media cache, push
    services/                # /app-api calls (auth, feed, comments, notifications, …)
    screens/                 # one per website page (chat/ for the Matrix screens)
    components/              # ui kit, feed cards, comments, chat messages, sheets
    theme/                   # ThemeProvider, generated tokens, fonts, background
```
