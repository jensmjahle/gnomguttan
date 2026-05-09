# Gnomguttan

Gnomguttan er en liten startside for VoceChat, kalender, galleri, Hubert Cinema og arkivvisning.

## Development

```bash
pnpm install
pnpm dev
```

## Environment

Set these values in `.env` or `docker-compose.yml`:

- `VOCECHAT_HOST`: direct VoceChat base URL
- `APP_TITLE`: app title shown in the navbar
- `JELLYFIN_HOST`: direct Jellyfin server URL used for metadata and posters
- `JELLYFIN_CLIENT_URL`: public Kino URL used when opening movie and series pages
- `JELLYFIN_TOKEN`: Jellyfin API token used by the runtime proxy

## Release flow

The repo now uses tag-based Docker publishing.

1. Run `pnpm release:tag`
2. Pick `major`, `minor`, or `patch`
3. The script fetches the latest `vX.Y.Z` tag, creates a release branch, adds an empty release commit, and creates the next tag
4. Push the branch and tag when prompted
5. GitHub Actions builds and publishes the Docker image only from `v*` tags
6. In CasaOS, update or recreate the container to pull the newest image tag

Example:

```bash
pnpm release:tag
```

## Docker

The published image is `ghcr.io/jensmjahle/gnomguttan`.
Tag pushes produce versioned images and `latest`.
