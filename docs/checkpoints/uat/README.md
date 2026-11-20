# UAT dry run — December release acceptance evidence

Dry run performed 2026-10-26 by the engineering lead against a **fresh database**, using the
committed Playwright suite plus the checkpoint browser runs. This is evidence that the release is
ready for the portfolio owner's UAT; it is **not** a substitute for the real UAT with real data.

## How the dry run was executed

```bash
# fresh database + migrations
docker compose exec -T db psql -U strapla -d postgres -c 'CREATE DATABASE strapla_e2e'
DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm db:migrate
pnpm build
DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm e2e
```

The suite (`e2e/plan-happy-path.spec.ts`) performs setup → strategic plan and SIs → annual plan and
program → project with ijin prinsip and the BR-9 flag → project year allocation and program budget
position → recurring ops → opening-balances reconciliation → all four reports and CSV/XLSX
downloads → member create/reset/revoke/deactivate → audit filter. It runs in CI on every PR (last
observed: 9.5 s on the CI runner).

## Scenario coverage

| Scenario | Evidence | Dry-run result |
| --- | --- | --- |
| UAT-01 first-run setup + auth | E2E setup step; `docs/checkpoints/m0/01-setup.png` | pass |
| UAT-02 plan + SIs + prior consumed | E2E; `docs/checkpoints/m1/01-strategic-plan.png`, `02-plan-overview.png` | pass |
| UAT-03 FY2027 plan activation | E2E; `m1/03-annual-plan-2027.png` | pass |
| UAT-04 programs, budgets, continuation | E2E; `m1/05-continuation-program.png`, `m2/02-program-budget-position.png` | pass |
| UAT-05 projects + ijin prinsip | E2E; `m1/08-project-over-approved.png` | pass |
| UAT-06 allocations + unallocated budget | E2E; `m2/01-project-allocations.png`, `02-program-budget-position.png`, `03-over-allocation-flag.png` | pass |
| UAT-07 recurring ops | E2E; `m1/09-recurring-ops.png` | pass |
| UAT-08 opening balances reconciliation | E2E opening-balances view; `m1/11-opening-balances.png` | pass (with test data) |
| UAT-09 flag behaviour | E2E BR-9 flag; `m2/03-over-allocation-flag.png`, `04-funding-flags.png`; unit tests in `src/domain/funding.test.ts` | pass |
| UAT-10 traceability | E2E navigation project → program → SI → plan; audit trail entries | pass |
| UAT-11 reports + exports + print | E2E report visits and downloads; `m2/05`–`09` | pass |
| UAT-12 member lifecycle + audit | E2E admin flow; `m2.5/01`, `02` | pass |
| UAT-13 capex/opex split | annual plan and budget-versus-actual reports, `m2/06`, `08` | pass |
| UAT-14 backup/restore on the host | Host not yet chosen — blocked on the owner's host decision | **pending host** |
| UAT-15 session handling | ADR-0002 implementation; sign-out flow in M0 verification | pass (dev instance) |
| UAT-16 spend entry under a minute | Execution module is the January release | deferred (M3) |

## What the owner's UAT must add

1. Real FY2027 plan data and the FY2026 closing figures (`OPENING-BALANCE-LOAD.md`).
2. The host-based restore drill (UAT-14) once the production host is provisioned.
3. Finance/director review of the exported reports (UAT-11) with real figures.
4. Sign-off in `UAT-PLAN.md`.

## Blocking external dependencies

- Production host, domain/TLS and SSH access (charter R9). The container image is public, so pulling it needs no registry credential.
- FY2026 spreadsheet export for the opening-balance load.
- Team account list for provisioning.

Both are owner actions; the December release code is complete, CI-green and deployable via Docker
Compose with the published image.
