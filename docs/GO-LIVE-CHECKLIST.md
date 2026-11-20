# Go-live checklist — December 2026 first release

Run this checklist with the release candidate image before switching the team over. Everything here
is verifiable; do not tick an item without seeing the result.

## 0. Decisions and access (owner)

- [ ] Production host chosen (small VPS, company server, or this development box with port forwarding — see charter R9)
- [ ] Domain / subdomain chosen, DNS pointed at the host
- [ ] TLS strategy agreed (Caddy or platform) and certificate reachability possible
- [ ] Data-residency constraint confirmed (must the database stay in Indonesia?)
- [ ] Who holds SSH access to the production host
- [ ] Team account list (names + emails) for provisioning
- [ ] Go/no-go date agreed for the FY2027 planning window

## 1. Host preparation

- [ ] Docker Engine and Docker Compose installed; disk and memory checked (PostgreSQL + app need ~1 GB RAM headroom)
- [ ] Repository checkout on the host with `docker-compose.yml` and `docs/operations.md`
- [ ] `.env` written: `POSTGRES_PASSWORD` (strong, unique), `APP_BASE_URL=https://<host>`, `STRAPLA_TAG=sha-<release commit>`
- [ ] `docker compose pull` succeeds without a registry login (the GHCR package is public)
- [ ] Reverse proxy configured with TLS and forwarding to `127.0.0.1:3000` (Caddy recommended)
- [ ] Firewall: only 80/443 (and SSH) exposed; PostgreSQL **not** exposed publicly
- [ ] Backup service enabled (`backups` volume, nightly `pg_dump`, 30-day retention)

## 2. Release verification

- [ ] `docker compose up -d` starts `db`, `app`, `backup`; `docker compose ps` shows healthy containers
- [ ] `GET /healthz` returns `{"status":"ok","database":"ok"}` over HTTPS
- [ ] Migrations applied on start (container logs show `migrations applied; reference data seeded`)
- [ ] `/setup` creates the first administrator; `/setup` is then unreachable
- [ ] Sign in / sign out works; the session cookie is `Secure` (HTTPS) and `HttpOnly`
- [ ] The audit trail records the member creation
- [ ] The release commit on `main` is CI-green (typecheck, lint, unit, E2E, build) and its image exists in GHCR

## 3. Data and acceptance

- [ ] UAT scenarios UAT-01…UAT-15 passed (`UAT-PLAN.md`), no release blockers
- [ ] Opening balances loaded and signed off (`OPENING-BALANCE-LOAD.md`)
- [ ] FY2027 plan built in the app and reviewed by the owner
- [ ] Reports exported (CSV/XLSX) and accepted by finance
- [ ] The stress-test records created during UAT are voided with reasons
- [ ] Backup/restore drill passed **on the host** (`docs/operations.md` restore procedure)

## 4. Security and operations

- [ ] No secrets in the repository or image; `.env` only on the host
- [ ] All team accounts are administrators (v1 role model — ADR-0004) and the list is correct
- [ ] Login rate limiting active; audit trail shows every change with actor and reason
- [ ] Logs accessible: `docker compose logs -f app`; failed logins appear in logs (not in the audit table)
- [ ] First nightly backup present in the `backups` volume; restore tested
- [ ] Clock/time zone: timestamps stored in UTC and displayed in Asia/Jakarta; host clock is NTP-synced

## 5. Handover and communication

- [ ] `USER-GUIDE.md` handed to the team; a short walkthrough done
- [ ] `RELEASE-NOTES-2026-12.md` shared with directors/finance (what is in scope, what is not)
- [ ] Who raises defects and where (GitHub issues) communicated
- [ ] Go/no-go recorded by the portfolio owner

## 6. After go-live — first week

- [ ] Day 1: `/healthz` green, the first plan entries present, no error spikes in logs
- [ ] Day 1: first nightly backup file exists; note its size
- [ ] Day 2: a second administrator verifies sign-in and the audit trail
- [ ] End of week: UAT debt/defects triaged; FY2027 plan progress reviewed
- [ ] Monthly: restore drill and a member/access review

## Rollback plan

1. Keep the **previous known-good image tag** and a **pre-go-live database dump**.
2. To roll back: `docker compose stop app`, restore the pre-go-live dump (`pg_restore --clean`), set
   `STRAPLA_TAG` back to the previous tag, `docker compose up -d`.
3. Migrations are forward-only; if the newer release applied a migration, restoring the older dump
   is the safe path (no production data before go-live; after go-live, plan data entered after the
   dump would be lost — evaluate with the owner first).
4. Record the rollback decision and reason in the release notes / issue tracker.

## Sign-off

| Item | Name | Date |
| --- | --- | --- |
| Host and TLS ready |  |  |
| Release image verified |  |  |
| UAT passed |  |  |
| Opening balances signed off |  |  |
| Go-live approved |  |  |
