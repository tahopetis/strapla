# Regression suite

The Playwright end-to-end regression for Strapla: what it covers, how to run it, and the gaps it deliberately leaves open.

It is **on demand**. It is not part of `ci.yml` and not attached to the release pipeline: the owner (or the agent acting for them) dispatches it before a release, or whenever a full pass is wanted. `ci.yml` keeps gating every pull request with typecheck, lint, the copy guard, unit tests, the build and a smoke journey.

## Running it

From the GitHub UI: **Actions → regression → Run workflow**, choose a tier.

From a machine with the `gh` CLI:

```bash
gh workflow run regression.yml -f tier=all
gh workflow run regression.yml -f tier=t2 -f grep=BR-9
```

From this Android device (the `gh` CLI cannot reach the network; `gh-api` can):

```bash
gh-api -X POST /repos/tahopetis/strapla/actions/workflows/regression.yml/dispatches \
  -d '{"ref":"main","inputs":{"tier":"all"}}'
```

Read the result with `gh-logs tahopetis/strapla <run-id>`; run ids come from
`gh-api '/repos/tahopetis/strapla/actions/runs?per_page=5'`.

Locally:

```bash
docker compose exec -T db psql -U strapla -d postgres -c 'CREATE DATABASE strapla_e2e'
DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm db:migrate

DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm e2e                     # all projects
DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm exec playwright test --project=foundation
DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm exec playwright test --project=t2
DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm exec playwright test --project=t3
```

The database must have **no users**: the journey starts at `/setup`, which the app refuses once an account exists. `e2e/support/global-setup.ts` checks this and fails with instructions instead of letting the suite collapse into noise. Re-create the database between runs.

## Tiers

| Tier | Project | What it is |
| --- | --- | --- |
| T1 | `foundation` | One journey that builds the portfolio end to end: first-run setup, strategic plan and SI, annual plans, programs, project with ijin prinsip, allocation, commitment, spend, recurring ops, opening-balance import, year close with carry-over, the close receipt (snapshot + ledger receipts) and the continuation program's money line, custom fields, reports, members, audit. Also the only place the empty states and the opening-balance form exist, because the journey starts from nothing and signs off FY2026. |
| T2 | `t2` | The rules the journey only touches on the happy path: budget revisions (active-only posting, awaiting and recording the decision, the register lines and their program links, the activation freeze, the switch floor and its refusals), per-component envelope and effective-budget figures, carry-in shown separately from the effective budget, edits, voids and their refusals, settlement arithmetic, closed-year locks, close preconditions, all four reports with parsed CSV/XLSX and print media, every computed flag, members and audit search, sessions and sign-in boundaries, opening-import XLSX. |
| T3 | `t3` | Read-only sweep of every route with data, plus the unauthenticated boundaries (`/healthz`, redirect to sign-in, styled 404, ended session). |

The tiers are Playwright projects: `t2` and `t3` depend on `foundation`, so they run it first and reuse its `storageState` (`e2e/.auth/admin.json`, gitignored). A broken foundation skips the later tiers — which is correct: if the plan cannot be built, nothing downstream is meaningful.

A full run is about two minutes of test execution (50 tests) and four to five minutes for the whole job including install, build, migrate and browser download on a cold runner.

`tier` selects the project. `grep` is an advanced filter passed to `--grep`; it applies to the foundation too, so narrowing it to a later-tier tag starves those tests of data. Use it to run a subset *within* a green project, not instead of one.

## Coverage map

| Spec | Tier | Pins |
| --- | --- | --- |
| `plan-happy-path.spec.ts` | T1 | Setup and sign-in state; empty states of every page; strategic plan + SI; annual plan FY2027/FY2028; program and continuation; project, ijin prinsip and BR flags; allocation; commitment and partial settlement; recurring ops; opening-balance control totals (a non-zero difference is allowed and recorded) and the one-time sign-off; opening import (validate-nothing-written, XLSX upload then CSV loads); custom fields across entities, reports, exports and the import template; report exports; members and audit; FY2027 close with carry-over, the close receipt (snapshot per entity/component, targets, ledger receipts, approval reference) and the FY2028 continuation program's money line with carry-in provenance; help. |
| `auth.spec.ts` | T2 | Sign-in, wrong password, deactivated member, minted session for a deactivated member, sign-out, `/setup` after the first account. |
| `voids.spec.ts` | T2 | Void/cancel for SI, program, project, allocation, commitment, spend and recurring ops — with reasons, refusals and audit rows. |
| `edits.spec.ts` | T2 | Program, recurring-ops, allocation, commitment and spend edits, including the settled/frozen guards (component and settlement classification) and the capex/opex no-shift refusal on allocation edits. The draft program no-shift rule and the decision-attach reason are action-tested. |
| `execution.spec.ts` | T2 | Commitment → spend → settlement lifecycle, open/partially settled/settled, remaining arithmetic, over-settlement refusing inline on the settlement field, prior-year opening settlement, cross-year settlement (an FY2029 spend settling an FY2028 commitment), and post-close settlement under both treatments (charge to the current year, or a closed-year reserve). |
| `closed-year.spec.ts` | T2 | Every closed-year refusal and hidden form, plus the write-surface split for a post-close payment (the closed allocation has no spend form; the open-year allocation offers the closed-year commitment). The allocation-update and recurring-ops-void guards are proven by action-level unit tests. |
| `close.spec.ts` | T2 | Close preconditions: missing next-year plan, typed confirmation, carry-over preview from effective budgets and allocations, the not-carried reason requirement on a partial carry, and the explicit same-initiative target for a discontinued program. The post-close receipt is covered by the foundation (the only spec that actually closes a year). |
| `revisions.spec.ts` | T2 | An active-year revision posted with the decision awaited, the register showing its date, reason, lines and program links, then the decision recorded; the annual plan header revision count and awaiting badge; a balanced switch as two linked lines; the activation freeze and the zero-budget program funded by a revision; refusal of an unbalanced switch and of a switch above the donor's unallocated budget. The de-allocation floor, the draft no-shift rule and the cross-component shift are unit/action-tested. |
| `opening-balances.spec.ts` | T2 | Signed-off read-only view, per-component SI envelope/prior fields and the ten split control totals, CSV/XLSX templates for all three data sets, and the import gate after the close (the import always targets the first in-app year, which the foundation closes — so the XLSX round-trip lives in the foundation, before the close). |
| `admin.spec.ts` | T2 | Member lifecycle (create, activate/deactivate, reset password, revoke sessions), self/last-admin protections, audit search and CSV. |
| `reports.spec.ts` | T2 | Four reports with real figures; CSV and XLSX parsed; `columns=` selection; filters; print media; effective budgets, the per-component SI five-year column groups, and carry-in as its own column wherever it changes available money. |
| `flags.spec.ts` | T2 | BR-7, BR-8, BR-9, BR-18, commitments over contract value, spend over fiscal-year commitment, per-component capex/opex envelope overrun, and the project page and register agreeing on the lifetime commitment figure and BR-8. |
| `sweep.spec.ts` | T3 | Every route renders with data; malformed dynamic record ids render the styled 404; unauthenticated `/healthz` and sign-in redirect. |
| `resilience.spec.ts` | T3 | Ended session lands on sign-in with an explanation; unknown URL renders the styled 404. |

## Known gaps

No known gaps are currently tracked.

The carry/revision surfaces added for ADR-0006 §6 are pinned at the journey level rather than per
control: the foundation closes FY2027 and asserts the receipt (snapshot rows with not-carried reasons,
target links and ledger receipts) plus the continuation program's money line; `revisions.spec.ts`
pins the register and awaiting badge. The `carry_in_*` cache invariant is covered by unit tests
against a fresh database, not by a browser assertion.

The gaps that used to live here are all fixed and pinned by tests: the allocation-update and recurring-ops-void closed-year guards (#96, #97), the uncaught over-settlement (#99), the ignored Component field (#100), the project page's commitment figure (#101) and the malformed-id 500 (#103). Post-close settlement (#98) is now a feature: the spend form chooses per transaction whether a closed-year portion is charged to the current year or kept as a closed-year reserve, with the reserve reported separately and never mixed into the locked close snapshot.

Two other findings worth knowing when reading the suite:

- The legacy `RELEASE-NOTES-2026-12.md` describes **M3 Execution** (spend entries, commitments, settlement) as a future January release; the feature shipped in v0.5.0 and the suite covers it. The old release note is kept for history and marked superseded; the README lists every milestone as done.
- Before this suite, CI never uploaded Playwright traces, so a failing run was undiagnosable. The regression workflow uploads the HTML report, JUnit XML and traces/video on failure, and writes a per-test table into the job summary.

## Not covered

- The opening-balance import CLI (`scripts/opening-import.ts`) — unit-tested; it never writes to the database.
- Spend-category administration — there is no UI; categories are seeded by the migration.
- Pixel/visual regression, PDF fidelity, accessibility auditing, and mobile viewports.
- Anything requiring a second role — v1 has one role (Administrator).
- A hard 404 **status** for malformed dynamic record ids: the guard now renders the app's styled "Page not found" before any query, but the signed-in shell streams while the session is resolved, so the wire status can stay 200 (a soft 404). A true status needs a proxy-level check.

## Adding to the suite

- One spec per area, one flow per test, title ends with `@t2` or `@t3`.
- Reuse `e2e/support/`: `money.ts` (`rp`), `db.ts` (`withSql`, `createRow` helpers), `auth.ts` (`ADMIN`, `createMember`, `signInWithSessionCookie`), `programs.ts` (`createProgramFixture`).
- A later-tier spec that needs an active-year program with a budget seeds it with `createProgramFixture`; the freeze is a UI rule, so the direct row keeps the spec focused on the behaviour it pins. The program-creation path (draft with budgets, active at zero plus a revision) is covered by the foundation and `revisions.spec.ts`.
- FY2027 is closed by the foundation and FY2028 is the open year: create test data in FY2028 with names unique to the spec. A spec that needs an activation boundary may create and activate its own later year (the revisions spec uses FY2030); never assert entity counts inherited from another spec.
- Do not add test-only endpoints or authentication bypasses to the app. A test that needs one is testing the wrong thing.
- When a control has no stable accessible name, adding one is preferred over a positional CSS selector.
- Financial assertions use the app's own formatting (`rp`) and exact status strings; "some page rendered" is not a regression test.
