# Release notes — Strapla December 2026 (first release)

> **Superseded.** This is the historical note for the legacy calendar-versioned `v2026.12.0`. The
> current release is [v0.5.0 (beta)](RELEASE-NOTES-0.5.0.md); the full history is in
> [CHANGELOG.md](../CHANGELOG.md) and the version policy in [VERSIONING.md](VERSIONING.md). The
> "Not included (by design)" section below described the December cut only — execution, settlement,
> year close, dashboard and custom fields shipped in v0.5.0.

| Field | Value |
| --- | --- |
| Release | 2026.12 (first release) |
| Status | Release candidate; UAT and go-live checklist outstanding |
| Scope | Plan module, funding module, reports/exports, administrator accounts |
| Deployment | Docker Compose (`app` + PostgreSQL 18 + nightly backup), public GHCR image |
| Image | `ghcr.io/tahopetis/strapla:v2026.12.0` (versioned) / `:latest` (current `main`) |
| Charter | `docs/CHARTER.md` v0.2 |

## What is in this release

**Plan (M1)**
- Strategic plan with configurable horizon; strategic initiatives with five-year envelopes, owners and objectives.
- Annual plans per fiscal year (draft → active → closed), activated with an audited reason.
- Annual programs with capex/opex budgets, carry-in and program-thread continuation links.
- Multi-year projects with full-life figures (allocated, submitted price, final deal price), auto project codes, and the ijin prinsip record (number, date, approved amount, approver, document link).
- Recurring operations items (opex only, no SI) with budgets, carry-in and managed categories.
- Opening-balance layer for the pre-FY2027 data, with a reconciliation view and sign-off totals.

**Funding (M2)**
- Project year allocations (one per project per active fiscal year) with carry-in per component.
- Program budget availability: available, allocated and unallocated per component.
- The funding flag engine: over approved budget (BR-9), above submitted price (BR-18), lifetime commitments over contract value (BR-8), allocations over the full-life allocated budget, allocation over program budget (BR-7), SI envelope overrun (BR-2). Flags never block entry (BR-17).
- Four reports — SI five-year view, annual plan by SI and program, project register, budget versus actual — with CSV/XLSX exports and print/PDF views.

**Administration (M2.5)**
- First-run setup, local administrator accounts, database-backed sessions.
- Member management (create, reset password, revoke sessions, deactivate/reactivate) with audit.
- Append-only audit trail with filters and per-record change history.

**Platform**
- PostgreSQL 18 with versioned migrations; multi-arch Docker image (amd64/arm64); Compose deployment with nightly backups; `/healthz`.
- CI on every PR: typecheck, lint, unit tests (46), production build and a Playwright end-to-end suite covering the whole plan flow, reports/exports and member lifecycle.

## Not included (by design)

- Spend entries, commitment entries and settlement (execution release, January 2027).
- Manual year close and carry-over (before the FY2027 close).
- CSV import, file uploads, email notifications, per-vendor quote records, external identity providers.
- Payment status tracking.

Until the execution release, "actual spend" and "fiscal-year commitments" are not recorded: the
December release manages the plan and the funding, not the execution.

## Deployment and upgrade notes

- Deploy by pinning an immutable image tag (`STRAPLA_TAG=sha-<commit>`) and running `docker compose up -d`; migrations run on start.
- Required environment: `DATABASE_URL`, `APP_BASE_URL`; Compose also needs `POSTGRES_PASSWORD` and `STRAPLA_TAG`.
- Pulling the image needs no credentials: the GHCR package is public.
- TLS terminates at a reverse proxy; `APP_BASE_URL=https://…` enables secure cookies.
- Follow `docs/GO-LIVE-CHECKLIST.md`; data load per `docs/OPENING-BALANCE-LOAD.md`.

## Post-first-release scope (built ahead in this repository)

The milestones after the December release are implemented and verified; deploying the tip of `main`
gives them too:

- **M3 Execution (January 2027)**: commitment entries with the open → settled lifecycle, spend entries with categories/vendors/references, settlements including cross-year and prior-year opening payments, and the execution figures in all four reports/exports.
- **M4 Multi-year (before the FY2027 close)**: manual year close with per-component carry-over decisions and an approval reference, carry-over snapshot, closed-year lock with audited administrator corrections, settlement lifecycle allowed after close, and program continuation threads with carry-in reconciliation.
- **M5 Insight**: portfolio dashboard (envelope, program budget, allocated, open commitments, spend, remaining, flags, year status, threads, recent activity), full audit search with CSV export, and reporting polish.

## Known limitations

- One strategic plan and one administrator role (charter A1/A6).
- The audit-trail list shows the latest 200 entries on screen; the CSV export covers up to 5000.
- FY2026 stays in the spreadsheets: opening figures are entered once and audited, never reconstructed as records.
- No reopen, rollback or restore for closed years (by design, charter §6.7).

## Verification evidence

- Unit tests: 62 passing; production build green; E2E green in CI on every merge (the E2E runs a full annual cycle: setup → plan → funding → execution → reports → administration → close/carry-over → program thread).
- Checkpoints: `docs/checkpoints/m0` (skeleton + deploy/restore drill), `m1` (plan module), `m2` (funding + reports), `m2.5` (administration), `m3` (execution + cross-year reporting), `m4` (year close + program threads), `m5` (dashboard + audit search), `uat` (acceptance dry run), `go-live` (containerized deployment dry run).
- Charter success criteria coverage is mapped in `docs/checkpoints/uat/README.md`.
