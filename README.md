# Gnomguttan

Gnomguttan er en liten startside for VoceChat, kalender, galleri, Hubert Cinema og arkivvisning.

App-data som brukere, arrangementer og overhørt lagres nå i MongoDB via den innebygde Node-serveren.
I lokal utvikling starter serveren en midlertidig in-memory MongoDB hvis `MONGODB_URI` mangler eller ikke kan nås.

## Development

```bash
npm install
npm run dev
```

`npm run dev` starter både API-serveren og Vite-klienten.

## Environment

Set these values in `.env` or `docker-compose.yml`:

- `MONGODB_URI`: connection string for MongoDB, normally with username and password
- `MONGODB_DB`: database name used by the app, or leave blank to use the database name from the URI
- `PORT`: port for the Node server
- `APP_API_TARGET`: optional local Vite proxy target for `/app-api`
- `VOCECHAT_HOST`: direct VoceChat base URL
- `APP_TITLE`: app title shown in the navbar
- `VOCECHAT_BOT_TARGET_GROUP_ID`: VoceChat group/channel ID that receives info-bot announcements
- `VOCECHAT_BOT_API_KEY`: VoceChat bot API key used by the container-side proxy and event reminder job
- `JELLYFIN_HOST`: direct Jellyfin server URL used for metadata and posters
- `JELLYFIN_CLIENT_URL`: public Kino URL used when opening movie and series pages
- `JELLYFIN_TOKEN`: Jellyfin API token used by the runtime proxy
- `HOME_ASSISTANT_URL`: Home Assistant base URL reachable from the server, without a trailing slash
- `HOME_ASSISTANT_TOKEN`: long-lived Home Assistant access token used only by the server-side proxy
- `HOME_ASSISTANT_ENTITY_ID`: optional entity id for the widget, defaults to `switch.lampa_til_jens`
- `HOME_ASSISTANT_LIGHT_ENTITY_ID`: legacy alias still accepted for older setups

The widget polls Home Assistant automatically every 5 seconds and refreshes when the tab becomes active again.

## Release flow

Releases are created manually in GitHub as version tags. The Docker workflow only runs on `v*` tags.

1. Create a new tag in GitHub, or locally with `git tag vX.Y.Z` and `git push origin vX.Y.Z`
2. Use `major`, `minor`, or `patch` based on the change type
3. GitHub Actions builds and publishes the Docker image from that tag
4. In CasaOS, update or recreate the container to pull the newest image tag

Version meaning:

- `major`: breaking changes
- `minor`: new functionality without breaking changes
- `patch`: bug fixes and small adjustments

Example tags:

- `v1.0.0`
- `v1.1.0`
- `v1.1.1`

## Docker

The published image is `ghcr.io/jensmjahle/gnomguttan`.
Tag pushes produce versioned images and `latest`.
