# Strapla 0.5.0 — release notes

| Field | Value |
| --- | --- |
| Release | 0.5.0 — first Semantic Versioning release, first public beta |
| Status | Beta (the `0.x` line; 1.0.0 marks general availability) |
| Release date | 2026-11-22 |
| Previous release | [2026.12.0](https://github.com/tahopetis/strapla/releases/tag/v2026.12.0) (2026-10-26, legacy calendar version) |
| Deployment | Docker Compose: app + PostgreSQL 18 + nightly backup; public GHCR |
| Release image | `ghcr.io/tahopetis/strapla:0.5.0` and `:0.5` on the `v0.5.0` tag push, multi-arch `linux/amd64` + `linux/arm64`; `:latest` follows `main`; `:sha-<shortsha>` is immutable per commit |
| Docs | [Changelog](https://github.com/tahopetis/strapla/blob/v0.5.0/CHANGELOG.md) · [User guide](https://github.com/tahopetis/strapla/blob/v0.5.0/docs/USER-GUIDE.md) · [Operations](https://github.com/tahopetis/strapla/blob/v0.5.0/docs/operations.md) · [Regression](https://github.com/tahopetis/strapla/blob/v0.5.0/docs/REGRESSION.md) · [Versioning](https://github.com/tahopetis/strapla/blob/v0.5.0/docs/VERSIONING.md) |

## Why this release

Strapla 0.5.0 is the first release under Semantic Versioning and the first public beta. Its declared
scope covers the whole loop — plan, fund, execute, close, report — not only the planning and funding
foundation. The 2026.12.0 notes listed execution, year close and the dashboard as post-release; that
code had landed on `main` before the tag, and this release declares it in scope with the work merged
since. It is still a beta: the `0.x` line may change behaviour between minor releases, and the schema
may change; back up before upgrading and read the migration notes below.

## Highlights

**Planning and funding**
- Strategic plan and SIs with five-year envelopes; annual plans (draft → active → closed), programs
  with capex/opex budgets and continuation links, multi-year projects with ijin prinsip, recurring ops.
- Allocations, program availability and the funding flag engine (BR-2, BR-7, BR-8, BR-9, BR-18 and
  related flags) that never blocks entry; four reports (SI five-year, annual plan, project register,
  budget versus actual) with CSV/XLSX exports and print views.

**Execution and settlement**
- Commitments with the open → partially settled → settled lifecycle; spend entries with category,
  vendor, date and reference; settlement links to open commitments (partial allowed, over-settlement
  refused, the amount cannot be reduced below what is settled, and links and the post-close treatment
  freeze once the spend has settlement links).
- Cross-year settlements and prior-year opening payments, reported separately and excluded from
  current-year remaining; execution figures in all reports and exports (committed, open commitments,
  current-year spend, prior-year settlements and openings, lifetime commitments, spent to date).
- Post-close settlement (#105): a payment in an open year can settle a commitment from a closed plan.
  The closed-year portion is charged to the current year (the default) or kept as a closed-year
  reserve; a reserve appears as a prior-year settlement in the current-year report and as a separate
  "Post-close adjustments (reserve)" table in Budget vs actual, and never enters the locked close
  snapshot or carry-over figures. The choice is per transaction, audited and frozen once the spend
  has settlement links.

**Year close and multi-year**
- Manual close requiring the next year's plan, a typed `CLOSE FY<year>`, explicit zero carry amounts
  (a blank is refused), live totals and an approval reference per entry; a locked snapshot; read-only
  closed-year locks. Settlement lifecycle events (editing or voiding an existing spend) remain
  available, and a payment in the open year can settle a closed-year commitment. This beta has no
  in-app closed-year correction screen for plan figures.
- Program continuation threads with carry-in reconciliation; multi-year allocations can receive
  carry-over.

**Insight and reporting**
- Portfolio dashboard (envelope through spend and remaining, flags, year status, threads, recent
  activity) and audit search with filters and CSV export.

**Opening data**
- CSV/XLSX templates and a typed validator for the three opening data sets; validation never writes.
- Wizard: one transaction per load, whole-file failures by line, the first in-app plan required, one
  audit entry per record, custom fields imported with the record.
- Reconciliation page: eight control totals against in-app totals and a one-time reasoned read-only sign-off.

**Administration and custom fields**
- Administrator accounts, member lifecycle and the append-only audit trail with filters/CSV export.
- Custom fields on eight entities, text/number/date, required flag, stable key, ordering, example
  value, multiple AND report filters, remembered columns, archive/restore and audit labels; values
  never enter money rules, flags or report totals.

**UX and resilience**
- Form pattern: values kept, inline errors, pending submit, record-naming success, confirmation
  dialogs with the audited reason; activation in the plan header; linked fiscal-year badges; loading,
  error and 404 boundaries; ended-session message; copy guard against milestone IDs and fiscal years.

**Platform, security and testing**
- Stack: Next.js 16.4.6, React 19.3, TypeScript 6.0.3, Node 26 LTS (`engines >= 24`), PostgreSQL 18,
  postgres.js 4.1.1.
- Fail-closed security gate (gitleaks, osv-scanner, semgrep, Trivy misconfiguration; one SARIF
  decider; `medium` threshold), SHA-pinned actions, Dependabot cooldown, CodeQL merge protection at
  medium or higher, dependency review, secret scanning with push protection, and a blocking
  CRITICAL/HIGH Trivy image scan with dated, file-scoped waivers. Public GHCR needs no pull login.
- On-demand three-tier Playwright regression: T1 foundation journey, T2 rule specs (execution,
  post-close, closed-year locks, close, opening balances, reports, flags) and T3 route sweep with the
  unauthenticated boundaries.

## Upgrade notes

The `v0.5.0` tag push publishes image tags `0.5.0` and `0.5` (both multi-arch); `latest` follows
`main`, so pin a version or `sha-` tag in production. Pulling needs no registry login.

```bash
docker compose pull app
docker compose up -d --force-recreate app
docker compose ps            # app should become healthy
```

Pin `STRAPLA_TAG=0.5.0` in `.env` (or a `sha-<shortsha>` tag) before the pull. The environment
variables are unchanged (`DATABASE_URL`, `APP_BASE_URL`; Compose also `POSTGRES_PASSWORD`,
`STRAPLA_TAG`); TLS terminates at a reverse proxy and `APP_BASE_URL=https://…` enables secure cookies.

**Database migrations.** Five forward-only migrations are new since `v2026.12.0`; they run at container
start, and only pending ones are applied, so there is no manual SQL step:

| Migration | Change |
| --- | --- |
| `0005_opening_balance_reconciliation` | opening-balance sign-off store |
| `0006_chief_smasher` | custom-field registry and per-record values |
| `0007_cold_ghost_rider` | optional custom-field example value |
| `0008_foamy_ken_ellis` | custom-field entity coverage, field order, report preferences |
| `0009_gigantic_dark_phoenix` | nullable `post_close_treatment` enum on `spend_entries` |

Back up before upgrading (`docs/operations.md` has the procedure), then check `/healthz`, the header
build (version and commit) and the `migrations applied` line in the container log.

## Breaking changes

- **Version scheme.** Calendar versioning (`YYYY.MM.PATCH`) is replaced by Semantic Versioning
  (`MAJOR.MINOR.PATCH`). Releases are tagged `v<version>`; image tags carry no `v` prefix.
- **No application-level breaking change.** No API or database break for users upgrading from
  `v2026.12.0`: existing records stay valid, the environment variables are the same, migrations are
  additive and automatic.
- **The legacy release remains available.** `v2026.12.0` is still published as image tags `2026.12.0`
  and `2026.12`, but it is superseded by `v0.5.0`, outside the SemVer sequence, and will not receive
  further releases.
- **Notable behaviour changes, not breaks.** Year close requires the typed confirmation and explicit
  carry amounts; plan activation is in the page header; failed forms keep their values with inline
  errors instead of redirecting; `latest` follows `main` rather than the newest release.

## Known limitations

- One strategic plan at a time, one annual plan per fiscal year, and one role: every account is an
  administrator. Closed years cannot be reopened or rolled back. In this beta closed-year plan
  figures are read-only — the charter's audited-correction path is not exposed; settlement lifecycle
  events and post-close payments are the exception.
- No file uploads (documents are referenced by number and link), email notifications, external SSO,
  per-vendor quote records, or payment-status/payment-date tracking.
- Spreadsheet import exists only for the opening balances; all other plan data is entered through the
  forms. The audit-trail screen shows the latest 200 matching entries; its CSV export covers up to 5000.
- Money is whole Rupiah; there are no decimals. FY2026 stays in the spreadsheets: opening balances are
  the signed-off bridge and pre-app records are not reconstructed in the app.
- Recurring operations are opex-only and carry no contract value or SI link, by design.
- The regression suite does not cover pixel/PDF fidelity, accessibility auditing, mobile viewports or
  the opening-import CLI (unit-tested, never writes); a malformed dynamic record id renders the styled
  404 but the HTTP status can remain 200 because the signed-in shell streams while the session is
  resolved. Details are in `docs/REGRESSION.md`.

## Verification evidence

- **Unit tests:** at the release branch on 2026-11-22, `pnpm test` passed 29 test files and 302 tests.
  This is the observed count for this branch, not an estimate.
- **Main green at the release base.** Main at commit `5b56349` completed these runs successfully on
  2026-11-21/22: [`ci`](https://github.com/tahopetis/strapla/actions/runs/44944658432),
  [`security-gate`](https://github.com/tahopetis/strapla/actions/runs/44944658475),
  [`codeql`](https://github.com/tahopetis/strapla/actions/runs/44944658402),
  [`docker`](https://github.com/tahopetis/strapla/actions/runs/44944658411),
  [`image-scan`](https://github.com/tahopetis/strapla/actions/runs/44945187868) and the full
  [`regression`](https://github.com/tahopetis/strapla/actions/runs/44944734495) workflow (all tiers).
- **Release commit.** The `v0.5.0` tag is created on the merge commit of the release pull request,
  which runs the same gates; the tag push publishes the release image. The runs above are for the
  release base commit `5b56349` on `main`. Confirm the published image and tags after the tag push
  (`docs/VERSIONING.md`).
- **Regression tiers.** T1 `foundation` builds the portfolio end to end; T2 covers the rule specs
  (execution and post-close settlement, closed-year refusals, close preconditions, opening balances,
  reports, flags, members, audit and auth); T3 sweeps every route with data plus the unauthenticated
  boundaries. Dispatch on demand; see `docs/REGRESSION.md` for commands and the coverage map.
- **Checkpoints and images.** Browser-verified evidence is in `docs/checkpoints/` (`m0`, `m1`, `m2`,
  `m2.5`, `m3`, `m4`, `m5`, `uat`, `go-live`); the docker workflow builds `linux/amd64` and
  `linux/arm64`, a tag push publishes `0.5.0` and `0.5`, and every commit gets a `sha-<shortsha>` tag.

## Beta feedback

Report bugs and requests through GitHub issues at
<https://github.com/tahopetis/strapla/issues>. Include the page, the steps that reproduce the problem,
what you expected, what happened, and a screenshot when it helps. The header build (version and
commit) tells us which image you are running.

This is a beta without a support SLA; issues are triaged on a best-effort basis. A data-value defect
that blocks the annual plan is treated as a release blocker.

## What's next

The next work is beta feedback and the owner's UAT with the real FY2026 figures, then the production
host, TLS and the restore drill there. 1.0.0 follows when the owner UAT and host go-live checks are
complete and no defect blocks the annual cycle; no dates are promised. See the
[changelog](https://github.com/tahopetis/strapla/blob/v0.5.0/CHANGELOG.md) and
[`docs/VERSIONING.md`](https://github.com/tahopetis/strapla/blob/v0.5.0/docs/VERSIONING.md).
