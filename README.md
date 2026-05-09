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
