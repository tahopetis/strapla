# Operations

How Strapla is deployed, upgraded, backed up and restored. Expanded by M0 issue #4; keep this file current as the host decision is made (charter §11 — host, domain and TLS are deferred until mid-November 2026).

## Configuration

The app needs exactly two environment variables:

| Variable | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://strapla:***@db:5432/strapla` | PostgreSQL 18 connection string |
| `APP_BASE_URL` | `https://strapla.example.com` | Used for secure-cookie behaviour; `https://` enables `Secure` cookies |

Additional Compose variables: `POSTGRES_PASSWORD`, `STRAPLA_TAG`.

## Deploy (Docker Compose)

```bash
# on the target host
export POSTGRES_PASSWORD='<strong-password>'
export APP_BASE_URL='https://<host>'
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

## Upgrades

1. Tag or merge to `main`; CI builds `sha-<commit>` and `latest` images.
2. On the host: `docker compose pull && docker compose up -d`.
3. Verify `/healthz` and sign in.

Migrations are forward-only; take a backup before each upgrade.

## TLS and domain

Terminate TLS at a reverse proxy (Caddy recommended) once the host and domain are decided. Until then the app is reachable over HTTP on the private network only; do not enter real financial data until TLS and backups are in place.

## Logs

```bash
docker compose logs -f app
```

Login failures are logged (without passwords) but are not written to the audit table (ADR-0004).
