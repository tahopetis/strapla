# Operations

How Strapla is deployed, upgraded, backed up and restored. Keep this file current as the host decision is made. The release go-live sequence is in [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md), the current release is described in [RELEASE-NOTES-0.5.0.md](RELEASE-NOTES-0.5.0.md), and the version/tag policy is in [VERSIONING.md](VERSIONING.md).

## Images, versions and updates

- Strapla follows [Semantic Versioning](https://semver.org/): releases are tagged `vMAJOR.MINOR.PATCH`, and the current release is **v0.5.0** (beta).
- GitHub Actions publishes `ghcr.io/tahopetis/strapla` on every push to `main`: `latest`, `sha-<commit>`.
- Release tags `v*` publish the SemVer image tags: `v0.5.0` → `0.5.0` and `0.5`. The legacy calendar tag `v2026.12.0` is still available as `2026.12.0` / `2026.12`.
- `latest` follows the `main` branch, so it is not necessarily the newest release. Pin `STRAPLA_TAG` to a release or `sha-` tag in production.
- The app header shows the running build (`v<version> · <commit>`), which is the quickest way to confirm what is deployed.
- Docker Compose will keep using a locally cached image even when a newer one is published. To update:

```bash
docker compose pull app
docker compose up -d --force-recreate app
docker compose ps            # app should become healthy
```

- Pin a release with `STRAPLA_TAG=0.5.0` in `.env` (default is `latest`).
- Pulling needs no credentials: the GHCR package is public (`ghcr.io/tahopetis/strapla`).
- `docker compose build app` remains available for local development; it tags the local image with
  `STRAPLA_TAG` and bakes `STRAPLA_VERSION`/`STRAPLA_COMMIT` from the build args.

## Configuration

The app needs exactly two environment variables:

| Variable | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://strapla:***@db:5432/strapla` | PostgreSQL 18 connection string |
| `APP_BASE_URL` | `https://strapla.example.com` | Used for secure-cookie behaviour; `https://` enables `Secure` cookies |

Additional Compose variables: `POSTGRES_PASSWORD`, `STRAPLA_TAG`.

## Container images

Multi-arch images are published to public GHCR by the `docker` workflow:

```
ghcr.io/tahopetis/strapla:latest            # latest main
ghcr.io/tahopetis/strapla:0.5.0             # the v0.5.0 release
ghcr.io/tahopetis/strapla:0.5               # the v0.5.x line
ghcr.io/tahopetis/strapla:sha-<shortsha>    # immutable per commit
```

Pulling on a deployment host needs no registry login — the package is public:

```bash
docker pull ghcr.io/tahopetis/strapla:sha-<shortsha>
```

Pushes normally come only from the `docker` workflow (with its own `GITHUB_TOKEN`), so no host holds a registry credential.

Pin `STRAPLA_TAG` to a release tag (`0.5.0`) or a `sha-` tag in production and promote by changing the tag, not by rebuilding on the host. Images are built for `linux/amd64` and `linux/arm64`; the deployment below was verified on arm64 (see [`docs/checkpoints/m0/deploy-restore-drill.md`](checkpoints/m0/deploy-restore-drill.md)).

## Deploy (Docker Compose)

```bash
# on the target host
export POSTGRES_PASSWORD='<strong-password>'
export APP_BASE_URL='https://<host>'
export STRAPLA_TAG='0.5.0'            # pin the release (or a sha-<shortsha> tag)
docker compose pull
docker compose up -d
```

The container runs migrations (`scripts/migrate.mjs`) before `next start`, so upgrades are `pull` + `up -d`.

Health: `GET /healthz` returns `{"status":"ok","database":"ok"}`; the image also ships a `HEALTHCHECK` that polls it.

## Backup

The `backup` Compose service writes a compressed `pg_dump` (`-Fc`) to the `backups` volume every 24 hours and deletes dumps older than 30 days.

First backup on a fresh deployment is up to 24 hours away; take one manually right after go-live:

```bash
docker compose exec -T db pg_dump -Fc -U strapla -d strapla > strapla-initial.dump
```

## Restore

```bash
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists -U strapla -d strapla < strapla-backup.dump
docker compose start app
```

Restore is destructive: confirm you are restoring the intended dump and database before running it.

The backup/restore procedure was drilled on 2026-10-25 and the evidence is recorded in [`docs/checkpoints/m0/deploy-restore-drill.md`](checkpoints/m0/deploy-restore-drill.md).

## Upgrades

1. Merge to `main` for a `latest`/`sha-<commit>` build, or push a release tag (`v0.5.0`) for the SemVer image tags; CI publishes both.
2. On the host: `docker compose pull && docker compose up -d`.
3. Verify `/healthz` and sign in; the header shows the new version.

Migrations are forward-only; take a backup before each upgrade.

## TLS and domain

Terminate TLS at a reverse proxy (Caddy recommended) once the host and domain are decided. Until then the app is reachable over HTTP on the private network only; do not enter real financial data until TLS and backups are in place.

## Logs

```bash
docker compose logs -f app
```

Login failures are logged (without passwords) but are not written to the audit table (ADR-0004).
