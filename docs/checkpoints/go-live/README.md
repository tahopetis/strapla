# Go-live dry run — containerized deployment on this machine

Performed 2026-10-26 on the development box (arm64 Alpine) using the release Dockerfile and
`docker-compose.yml`. This is the go-live checkpoint evidence for the build: the release image starts
the full stack from scratch, migrates and seeds a **fresh** database, serves the app, accepts the
first-run setup, records real changes, exports reports and survives an app restart. It does **not**
replace the owner's production deployment (host/TLS/domain decision still deferred) but proves the
deployment path end to end.

## Steps performed

```bash
# free the dev ports; build the release image exactly from the Dockerfile
docker compose stop db
STRAPLA_TAG=golive-dryrun docker compose build app        # image size 921 MB, id 1cea49092ec3

# start the full stack with a fresh project name and fresh volumes
STRAPLA_TAG=golive-dryrun POSTGRES_PASSWORD=golive-dryrun-password \
  APP_BASE_URL=http://127.0.0.1:3000 docker compose -p strapla-golive up -d
```

The app container ran `node scripts/migrate.mjs` on start (`migrations applied; reference data
seeded` in the logs), then `next start`; the image health check reported `healthy` on
`http://127.0.0.1:3000/healthz` (`{"status":"ok","database":"ok"}`).

## What was verified (headless Chromium + curl)

1. **First-run setup** (`/setup`) created the first administrator and signed in; `/healthz` served
   `{"status":"ok","database":"ok"}`.
2. **Write path in the container**: created the strategic plan 2026–2030, activated it, added SI-01
   (envelope Rp 5.000.000.000), created and activated the FY2027 annual plan, added program
   PRG-2027-001 with capex/opex budgets.
3. **Read/report path**: the SI five-year report rendered with the live figures and its CSV export
   downloaded (`SI code` header present); the audit trail showed the container-recorded changes
   (`strategic_plan`, `annual_program`, …) with actors and reasons.
4. **Dashboard**: portfolio health rendered from the container database.
5. **Backup**: a manual `pg_dump -Fc` in the backup container produced a 125,729-byte dump in
   `/backups`.
6. **Restart persistence**: `docker compose restart app` → healthy again, `/healthz` ok and the data
   unchanged (users=1, audit=7, programs=1).
7. **Teardown**: `docker compose -p strapla-golive down -v` removed only the dry-run project's
   volumes; the development database was restarted afterwards.

## Evidence

| Screenshot | What it shows |
| --- | --- |
| `01-healthz.png` | `/healthz` from the running container: database ok |
| `02-first-run-setup.png` | First-run setup form served by the production build |
| `03-dashboard-empty.png` | Signed-in dashboard on the empty database |
| `04-dashboard-after-smoke.png` | Dashboard with the plan/program created through the UI in the container |
| `05-audit-trail.png` | Audit trail entries recorded by the containerized app |

## Evidence log

```
=== container images
ghcr.io/tahopetis/strapla:golive-dryrun 1cea49092ec3 921MB

=== compose ps
strapla-golive-app-1     ghcr.io/tahopetis/strapla:golive-dryrun   Up (healthy)
strapla-golive-backup-1  postgres:18-alpine                        Up
strapla-golive-db-1      postgres:18-alpine                        Up (healthy)

=== healthz
{"status":"ok","database":"ok","latencyMs":115}

=== data counts
users=1  audit=7  plans=1  annual_plans=1  programs=1

=== backup (manual pg_dump)
/backups/golive-drill.dump  125729 bytes

=== app restart persistence
app health after restart: healthy
{"status":"ok","database":"ok","latencyMs":10}
users=1  audit=7  programs=1
```

## Not covered here (owner actions)

- Production host, domain and TLS (charter §11 R9 — deferred by the owner; the compose file,
  `.env` contract, reverse-proxy guidance and go-live checklist are ready).
- Pulling the published GHCR image on the host (the local build proves the Dockerfile/compose path;
  the host needs a token with `read:packages`, documented in `docs/operations.md`).
- The owner's UAT with real FY2027/FY2026 data and the UAT sign-off (`docs/UAT-PLAN.md`).
