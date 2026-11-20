# M0 deployment and restore drill

Run: 2026-10-25, on the development box (Linux arm64/Alpine, Docker 29).

## Deployment

The image was built locally from the Dockerfile (the published GHCR image builds the same
way in the `docker` workflow) and deployed with Compose:

```bash
docker compose build app
docker compose up -d app
```

Observed: `strapla-app-1` started, ran migrations (`migrations applied`), Next.js 16.4.3
ready in 6.8 s, Compose health status moved to `healthy`, and

```
GET /healthz -> {"status":"ok","database":"ok","latencyMs":14}
```

Note: pulling the published GHCR image on another host requires a token with `read:packages`;
the repository's current `gh` token only has `repo`, so the local drill used the local build.
(Update 2026-11-20: the package is now public, so anonymous pulls work — the note above described
the private package at drill time.)

## Backup and restore

```bash
docker compose exec -T db pg_dump -Fc -U strapla -d strapla > strapla-restore-drill.dump
docker compose exec -T db psql -U strapla -d postgres -c 'CREATE DATABASE strapla_restore'
docker compose exec -T db pg_restore --no-owner --no-comments -U strapla -d strapla_restore < strapla-restore-drill.dump
```

Result: restore completed (exit 0) and the scratch database held the expected rows:

| Table | Rows restored |
| --- | --- |
| users | 1 |
| strategic_plans | 1 |
| strategic_initiatives | 2 |
| audit_entries | 4 |

The scratch database was then dropped. The backup file was ~40 KB for the M1-sized dataset.
The procedure in `docs/operations.md` was followed for this drill.
