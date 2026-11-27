# UAT plan — v0.5.0 beta

Acceptance testing for the **v0.5.0 beta release**: the complete loop — plan, funding, execution and
settlement, in-year budget revisions, the carry-over ledger and close receipt, reports/exports,
administration and custom fields. Everything
runs against a **fresh database** so the opening-balance load can be validated end to end.

| Field | Value |
| --- | --- |
| Release target | v0.5.0 beta (FY2027 annual plan) |
| Tester | Portfolio owner (product owner) |
| Support | Engineering lead (this build team) |
| Environment | A hosted instance with the release image (see `GO-LIVE-CHECKLIST.md`); for a dry run, the development box works |
| Data | The real FY2027 plan draft and the FY2026 closing figures (see `OPENING-BALANCE-LOAD.md`); the SI envelope and prior consumption are captured per component |
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
| UAT-02 | Create the strategic plan 2026–2030; add initiatives with owners, objectives, **capex and opex envelopes** and prior program budget consumed per component | Plan appears as active; each SI shows a capex and an opex headroom, never a shared one | SC-1, SC-5 |
| UAT-03 | Create the FY2027 annual plan, add notes, activate it with a reason | FY2027 plan active; status change visible in the audit trail; the plan header shows 0 revisions | SC-2 |
| UAT-04 | Create annual programs under SIs with initial capex/opex budgets; continue the FY2026 program where applicable. Do **not** type carry-in. Have the opening-balance load/close supply the FY2027 carry-in and check each program page's money line | Programs listed per SI; continuation links render; available = effective budget + carry-in, with the carry-in listed as a ledger receipt (origin `opening`) | SC-2 |
| UAT-05 | Create the multi-year projects with full-life allocated budget, submitted price, final deal price and the ijin prinsip record (number, date, approved amount, approver, document link) | Project register shows the pricing chain; approved amount equals the document | SC-3, SC-4 |
| UAT-06 | Allocate program budget to each project's FY2027 slice; check program unallocated and project remaining | Unallocated budget visible per component; remaining = effective allocation + carry-in (no commitments yet); the allocation card shows the ledger carry-in separately | SC-3, SC-6 |
| UAT-07 | Add the recurring operations items with opex budgets, carry-in and categories | Items appear in the annual plan and the reports; opex only | SC-8 |
| UAT-08 | Load the opening balances for SIs, programs and projects with the import wizard (validate, then load; nothing written on a bad file); enter the **ten** spreadsheet control totals (per-component envelopes and prior consumption) on `/plan/opening-balances`, compare every difference and sign off | Malformed file reports each bad line and writes nothing; totals reconcile; the signed-off state records the reason | SC-12 |
| UAT-09 | Flag checks with stress data: final deal price above approved amount; above submitted price; allocation above program budget; cumulative program budgets above the SI envelope | Each flag appears in context; saving is still possible (BR-17); void the stress records afterwards | SC-6 |
| UAT-10 | Fill in one complete real project (ijin prinsip, allocations, recurring ops cross-check) and spot-check traceability from a number back to SI and annual plan | Every figure traces to project → program → SI → annual plan | SC-4 |
| UAT-11 | Open the four reports; export CSV and XLSX; print/PDF the SI five-year view; hand the exports to finance for a sanity check | Exports match the screen; print view is readable on A4 landscape | SC-10 |
| UAT-12 | Create a second administrator, reset its password, deactivate it, and inspect the audit trail | Member lifecycle works; every action is attributed with a reason | SC-11, A6 |
| UAT-13 | Capex/opex split spot-check at program, project, SI and portfolio level | Components shown separately and combined totals agree | SC-8 |
| UAT-14 | Restore drill on the host: take a backup, restore it into a scratch database, verify counts | Restore succeeds and data matches | R4 |
| UAT-15 | Sign out/in from a second browser; confirm sessions end on sign-out and on password reset | No session leaks; deactivated account cannot sign in | ADR-0002 |
| UAT-16 | Record one real spend entry in under one minute | The spend form fills and saves from the allocation in under a minute; remaining and BR-11 update immediately | SC-9 |
| UAT-17 | Record a commitment, settle part of it with a spend, then settle the rest; check the execution columns in the reports | The commitment moves open → partially settled → settled; remaining follows the formula; the reports show commitment, spend and open amounts | SC-9, SC-10 |
| UAT-18 | **Revision register:** post a capex addition and a balanced switch on the active year, one of them without a decision reference; open the register, follow a line link to its program, then record the decision reference | Each revision is numbered, dated, and shows reason, per-line deltas and total delta; the missing reference shows *awaiting decision reference* until recorded; the plan header count updates; the program page money line shows initial + revisions = effective budget | SC-2, SC-6 |
| UAT-19 | **Freeze check:** try to edit a program budget in the active year; then use the money line to confirm the effective budget and both warning flags | The budget form is replaced by the revision path; over-allocated and unfunded show as flags without blocking a save | SC-6, SC-12 |
| UAT-20 | **Year close receipt:** close a test year with a partial carry (a not-carried reason) and a continuation target; reopen **Close receipt** from the closed plan | The close snapshot shows available / carried / not carried + reason per entity and component, each carried amount links to its target, the ledger receipts list source, target, origin and reason, and the approval reference links to them | SC-7, SC-12 |
| UAT-21 | **Carry-in provenance:** on the continuation program, open the money line and the thread; confirm the carry-in equals the ledger receipts and the receipt names the prior close. Then post a reasoned manual carry receipt and re-check | The money line shows carry-in separately from the initial/effective budget; every amount has a receipt with an origin; the guarded cache equals the ledger | SC-2, SC-7 |

## Defect handling

1. Raise a GitHub issue per defect with the UAT scenario id, steps, expected/actual and a screenshot.
2. Label `needs-triage`; the engineering lead triages within one working day and labels
   `ready-for-agent` or `ready-for-human`.
3. Data-value defects that block the plan (wrong totals, broken traceability) are **release blockers**.
   Cosmetic issues are collected for a follow-up iteration.
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
| UAT-16 |  |  |  |
| UAT-17 |  |  |  |
| UAT-18 |  |  |  |
| UAT-19 |  |  |  |
| UAT-20 |  |  |  |
| UAT-21 |  |  |  |

### Task timing baselines (W8)

Two kinds of baseline live here. The **stopwatch** protocol is the official measure: the owner times
four tasks with a stopwatch, three consecutive runs each, on the release-candidate host, and records
the median. No analytics or tracking: start the stopwatch at the first click after sign-in and stop it
when the task's confirmation is on screen. Numeric targets are in
`docs/UX-ENHANCEMENT-PROPOSAL.md` §9, and the baselines are measured again after the Phase C changes.
The **automated** rows are the E2E journey logging its own segment timings on the CI runner
(`[timing]` lines in the verify job); they were recorded on the owner's behalf on 2026-11-19 as
regression baselines. They are machine time for one scripted run, not a human stopwatch median.

| Task | What is timed | Baseline | Target | Recorded | Ref |
| --- | --- | --- | --- | --- | --- |
| First plan step | automated segment: strategic plan created and activated (first-run setup/sign-in excluded) | 557 ms | ≤ 45 min | 2026-11-19 — automated E2E, CI run 44471319147 | UAT-02 |
| Spend entry | automated segment: spend form filled and saved against the project allocation | 267 ms | ≤ 60 s | 2026-11-19 — automated E2E, CI run 44471319147 | Project allocation → Open commitments & spend |
| Opening import | automated segment: wizard opened with the 25-project workbook, validated and loaded | 455 ms | ≤ 15 min | 2026-11-19 — automated E2E, CI run 44481784773 | UAT-08 |
| Reconciliation | automated segment: open `/plan/opening-balances` and load its control totals | 214 ms | ≤ 1 day | 2026-11-19 — automated E2E, CI run 44471319147 | UAT-08 |

All four automated baselines are now recorded. The owner still runs the stopwatch protocol during the
UAT window (9–15 December 2026) and replaces or pairs these with the owner's medians then.

| Approval | Name | Date |
| --- | --- | --- |
| Portfolio owner (UAT sign-off) |  |  |
| Engineering lead |  |  |
