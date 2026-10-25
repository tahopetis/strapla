# UAT plan — December 2026 first release

Acceptance testing for the **December 2026 release**: plan module (M1), funding module (M2),
reports/exports and administrator accounts (M2.5). Everything runs against a **fresh database** so
the opening-balance load can be validated end to end.

| Field | Value |
| --- | --- |
| Release target | December 2026 (FY2027 annual plan) |
| Tester | Portfolio owner (product owner) |
| Support | Engineering lead (this build team) |
| Environment | A hosted instance with the release image (see `GO-LIVE-CHECKLIST.md`); for a dry run, the development box works |
| Data | The real FY2027 plan draft and the FY2026 closing figures (see `OPENING-BALANCE-LOAD.md`) |
| Tracker | GitHub issues in `tahopetis/strapla`, labelled `needs-triage` until reviewed |

## Purpose

Prove the release is fit for the real FY2027 planning cycle: the plan can be built from opening
balances, every number is traceable, flags appear where they should, reports/exports are acceptable
to directors and finance, and every change is attributable.

## Prerequisites

- [ ] Hosted instance running the release image (pinned `sha-<commit>` tag) with TLS
- [ ] First-run setup completed; the owner's admin account created
- [ ] FY2026 spreadsheets available and the manual year close completed outside the app
- [ ] A clean database (no test data) — UAT starts from `/setup`
- [ ] `OPENING-BALANCE-LOAD.md` printed or open for the load session

## Test data

Use the **real** FY2027 plan draft and the FY2026 closing figures. Do not invent plan lines during
UAT except where a scenario explicitly asks for a stress test (flag checks); void those records
afterwards with a reason.

## Scenarios

Each scenario lists the charter success criteria it evidences. Record pass/fail and the audit
entry/timestamp in the sign-off table below.

| ID | Scenario | Expected result | Criteria |
| --- | --- | --- | --- |
| UAT-01 | Fresh instance: complete first-run setup, sign in, sign out; confirm `/setup` is no longer reachable | Administrator created, authenticated shell, no second signup | Access model (§5) |
| UAT-02 | Create the strategic plan 2026–2030; add initiatives with owners, objectives, envelopes and prior program budget consumed | Plan appears as active; SI headroom reflects the opening consumption | SC-1, SC-5 |
| UAT-03 | Create the FY2027 annual plan, add notes, activate it with a reason | FY2027 plan active; status change visible in the audit trail | SC-2 |
| UAT-04 | Create annual programs under SIs with capex/opex budgets and carry-in; continue the FY2026 program where applicable | Programs listed per SI; continuation links render; program available = budget + carry-in | SC-2 |
| UAT-05 | Create the multi-year projects with full-life allocated budget, submitted price, final deal price and the ijin prinsip record (number, date, approved amount, approver, document link) | Project register shows the pricing chain; approved amount equals the document | SC-3, SC-4 |
| UAT-06 | Allocate program budget to each project's FY2027 slice (with carry-in where applicable); check program unallocated and project remaining | Unallocated budget visible per component; remaining = allocation + carry-in (no commitments yet) | SC-3, SC-6 |
| UAT-07 | Add the recurring operations items with opex budgets, carry-in and categories | Items appear in the annual plan and the reports; opex only | SC-8 |
| UAT-08 | Load the opening balances for SIs, programs and projects; compare `/plan/opening-balances` totals with the spreadsheets and sign off | Totals reconcile exactly with the signed-off spreadsheet figures | SC-12 |
| UAT-09 | Flag checks with stress data: final deal price above approved amount; above submitted price; allocation above program budget; cumulative program budgets above the SI envelope | Each flag appears in context; saving is still possible (BR-17); void the stress records afterwards | SC-6 |
| UAT-10 | Fill in one complete real project (ijin prinsip, allocations, recurring ops cross-check) and spot-check traceability from a number back to SI and annual plan | Every figure traces to project → program → SI → annual plan | SC-4 |
| UAT-11 | Open the four reports; export CSV and XLSX; print/PDF the SI five-year view; hand the exports to finance for a sanity check | Exports match the screen; print view is readable on A4 landscape | SC-10 |
| UAT-12 | Create a second administrator, reset its password, deactivate it, and inspect the audit trail | Member lifecycle works; every action is attributed with a reason | SC-11, A6 |
| UAT-13 | Capex/opex split spot-check at program, project, SI and portfolio level | Components shown separately and combined totals agree | SC-8 |
| UAT-14 | Restore drill on the host: take a backup, restore it into a scratch database, verify counts | Restore succeeds and data matches | R4 |
| UAT-15 | Sign out/in from a second browser; confirm sessions end on sign-out and on password reset | No session leaks; deactivated account cannot sign in | ADR-0002 |
| UAT-16 | Record one real spend entry in under one minute | **Deferred to the January M3 release** (execution module not in the December cut) | SC-9 (partial) |

## Defect handling

1. Raise a GitHub issue per defect with the UAT scenario id, steps, expected/actual and a screenshot.
2. Label `needs-triage`; the engineering lead triages within one working day and labels
   `ready-for-agent` or `ready-for-human`.
3. Data-value defects that block the plan (wrong totals, broken traceability) are **release blockers**.
   Cosmetic issues are collected for the January iteration.
4. Corrections during UAT follow the product rules: no hard deletes; void with a reason; audited edits.

## Exit criteria

- [ ] All scenarios pass or have an agreed, documented workaround
- [ ] No open release-blocker defects
- [ ] Opening balances signed off against the FY2026 spreadsheets (UAT-08)
- [ ] Finance accepts the CSV/XLSX reports (UAT-11)
- [ ] Backup/restore drill passes on the host (UAT-14)
- [ ] Go-live checklist complete (`GO-LIVE-CHECKLIST.md`)

## Sign-off

| Scenario | Result | Evidence (date / audit entry / export) | Notes |
| --- | --- | --- | --- |
| UAT-01 |  |  |  |
| UAT-02 |  |  |  |
| UAT-03 |  |  |  |
| UAT-04 |  |  |  |
| UAT-05 |  |  |  |
| UAT-06 |  |  |  |
| UAT-07 |  |  |  |
| UAT-08 |  |  |  |
| UAT-09 |  |  |  |
| UAT-10 |  |  |  |
| UAT-11 |  |  |  |
| UAT-12 |  |  |  |
| UAT-13 |  |  |  |
| UAT-14 |  |  |  |
| UAT-15 |  |  |  |

| Approval | Name | Date |
| --- | --- | --- |
| Portfolio owner (UAT sign-off) |  |  |
| Engineering lead |  |  |
