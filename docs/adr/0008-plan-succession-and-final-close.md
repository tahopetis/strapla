# ADR-0008: Plan succession and the final close

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** Portfolio owner (approval), engineering lead (proposal)
- **Related:** [Charter §6.7, BR-1 and A1](../CHARTER.md), [GLOSSARY](../../GLOSSARY.md), [Data model](../data-model.md), [ADR-0003](0003-funding-and-settlement.md), [ADR-0006](0006-carry-in-and-budget-revisions.md), [ADR-0007](0007-closed-year-audited-corrections.md), issue #109

## Context

Strapla models one strategic plan at a time: the horizon holds the plan's strategic initiatives and one annual plan per fiscal year, and the rest of the model treats that horizon as the boundary of everything. A project's years must sit inside it, an annual plan cannot exist outside it, and the year close expects the next fiscal year's annual plan to receive the carry-over (charter §6.7, BR-1 and BR-13, ADR-0006 §3).

That boundary became a dead end. The app refused a second plan once any plan existed, and an archived plan did not free the slot: the first plan's last year could be closed only with a next-year annual plan that the horizon could not hold, and archiving the plan left no way to create its successor. The documented policy — "only one strategic plan is *active* at a time" (BR-1, A1) — had been implemented as "one plan per deployment", which is stronger than the promise. A mistaken plan was also a dead end: it could be activated but not archived while still a draft.

Issue #109 asked for the succession model. The owner's decisions were:

- A deployment moves from one plan to the next; it does not need two plans at once.
- Nothing carries across the plan boundary. The plan is the period; the money and the projects belong to it.
- The plan's last year closes as a **final close**: every available amount is deliberately not carried, with a reason, and the snapshot says so.
- Archived plans stay reachable read-only. They are history, not deleted records.

## Decision

### 1. One plan is current, and the current plan is the one that is not archived

A plan is `draft`, `active` or `archived`. At most one plan is active or draft at a time; while one is, a new plan is refused. Archived plans are final and read-only — no edit, no activation, no restore.

Every surface — the plan pages, the dashboard, reports, opening balances and navigation — works with the **current plan**: the non-archived plan when one exists, otherwise the most recent archived plan. Between archiving the last plan and creating its successor, the archived plan stays visible read-only with a prompt to create a successor; nothing falls back to an empty state, and no second plan is needed to keep it readable.

### 2. Archive has one precondition, and a draft may be archived

A plan can be archived only when every annual plan under it is closed. An open annual plan (draft or active) refuses the archive, and the message names the year and its status — archiving would freeze a year with no close and no carry decision.

A draft plan has no annual plans, so it may be archived. That is deliberate: a plan created by mistake (wrong name, wrong horizon) is not a dead end; archive it and create the correct successor. Archiving is final either way: there is no unarchive and no delete.

### 3. The final close carries nothing and needs no next year

Closing the annual plan in the strategic plan's **end year** is the **final close**. It is the only close that needs no next-year annual plan:

- Every available amount — program unallocated and allocation remaining, per component — is recorded in the close snapshot as **not carried**, with one fixed reason: *Final close: FY<year> is the last year of the strategic plan. No carry-over crosses the plan boundary.*
- **No carry-over ledger entry is written.** There is no target year, no target program and no allocation created for a plan that does not exist yet.
- The snapshot invariants still hold: `available = carried + not carried`, and `carried` equals the ledger sum for the entity and component — zero, because the ledger receives nothing.
- The approval reference and the typed `CLOSE FY<year>` confirmation are still required, and the close is still audited and irreversible. The closed year keeps the ordinary closed-year rules (ADR-0007), and its close audit entry is marked with `finalClose: true`.

Every other year keeps the ordinary close: the next fiscal year's annual plan must exist and receive the carry-over (ADR-0006 §3). A year is final-closed only when its fiscal year is the plan's end year; there is no free-choice "close without a target".

### 4. The successor starts after the archived horizon, and starts empty

A successor plan can be created once no plan is active or draft. Two further rules apply:

- Its **start year must be greater than every archived plan's end year**. Horizons never overlap, so no fiscal year is ever owned by two plans and BR-3's one-annual-plan-per-year rule keeps its meaning across the succession.
- It starts **empty** and as a **draft**: no initiatives, programs, projects, allocations, commitments or spend are copied from the archived plan.

The create form defaults the start year to the year after the most recent archived plan's end year, and the end year to a five-year horizon from there. Activation follows the ordinary rule (one active plan, reason recorded), and the successor's first annual plan is then created from its start year in the ordinary way.

### 5. The horizon is bounded by the records inside it

A plan horizon edit is refused when the new range would exclude an existing annual plan or any project's full-life years, and the message names the offending annual plan year or project code. The horizon is not a display setting: it is the set of years the plan owns.

The **start year does not move once the opening balances are signed off**: the prior year of that bridge is derived from it (ADR-0003 §5), so moving the start would silently relabel signed-off figures. An edit that moves the start back over an archived plan's horizon is refused as well — the horizon-disjoint rule applies to edits, not only to creation.

Ending a plan **early** is therefore an explicit sequence, not a horizon edit:

1. shrink the horizon to the last year that still contains every annual plan and every project's full-life years;
2. final-close that year;
3. archive the plan.

The same sequence applies at the planned end, without step 1.

### 6. Projects do not cross a plan boundary

There is no continuity concept between plans: no project or program continues into its successor, and no budget, carry-in or carry-over crosses the boundary. A project that would outlive its plan must end at the boundary — the existing project-year validation already refuses years outside the horizon — and work that continues after the boundary starts as a **new project** under the successor, with its own budget and its own procurement record.

This is the deliberate cost of keeping the plan a real boundary: a multi-year project is sliced by its plan, and cross-boundary history is read through the two plans' records rather than through one continuous project.

### 7. Opening balances belong to the first plan only

Opening balances bridge the spreadsheets into the app once: they are loaded, reconciled and signed off for the **first** plan. A successor plan does not offer the opening-balance import or the sign-off, because it has no pre-app period of its own; its first annual plan starts from the archived plan's final closed year, with zero carry across the boundary.

The first plan's signed-off opening balances remain readable from that plan's archived page through the read-only opening-balances view. They are the historical bridge, not money the successor can spend.

### 8. Archived plans stay navigable

The **Archived plans** list is reachable from **Plan → Archived plans**. It lists each archived plan with its name, horizon, archived date and archived reason — the date and reason are read from the `status_change` audit entry that archived it, not stored on the plan row.

An entry opens a read-only archived plan page: the plan's initiatives with their envelope figures, its annual plans, annual programs and projects, and links into the existing read-only annual plan, program, project and allocation pages. Every write control is absent; the archived plan is history with a working index.

### 9. Scope and non-goals

- **No carry across a plan boundary.** No carry-over entry, carry-in, budget or opening balance moves from an archived plan to its successor. The final close carries zero by design.
- **No copy-forward or re-plan.** A successor starts empty; initiatives, programs, projects and their records are not cloned, and there is no "copy last plan" action.
- **No plan switcher and no cross-plan reporting.** The app reports on one plan at a time — the current plan. Comparing plans means reading each plan's reports in turn; there is no combined multi-plan report.
- **No restore, reopen or delete.** An archived plan cannot be made active or draft again, a closed year cannot be reopened (ADR-0007, BR-24), and a wrong succession is corrected forward rather than undone.
- **No second concurrent plan.** A deployment still runs one plan at a time: no parallel plan, no overlapping horizon, no multi-tenancy.
- **No schema change for the archive record.** The archive date and reason are derived from the audit trail; the plan row keeps its status only.
- Historical checkpoint documents and release notes are not rewritten.

### 10. Amendments to earlier decisions

- **ADR-0006 §3 is amended** in one place: at the strategic plan's end year the close does not read carry amounts or target programs at all — the carried amount is zero and every available amount is recorded as not carried with the final-close reason. The rest of ADR-0006 §2–3 stands unchanged, including the snapshot invariants and the ledger as the only source of carry-in.
- **BR-1 and A1 are read as "one plan active at a time, with a successor after it"** rather than "one plan per deployment"; charter §6.7 gains the final-close and no-carry-across-a-boundary rules. The implementation that made the deployment a dead end is superseded by this ADR.

### 11. Where the rules live

- Domain rules: `src/domain/plan.ts` (`successorStartYearError`, `latestPlanEndYear`, `archivePreconditionError`, `horizonContainmentError`).
- Plan service: `src/server/plan/actions.ts` (create, horizon update and status change) and `src/server/plan/queries.ts` (current plan, archived plans, archive date and reason, first-plan check).
- Final close: `src/lib/close-form.ts` (final-close plan builder and the fixed reason), `src/server/plan/close-queries.ts` (`isFinalClose`), `src/server/plan/close-actions.ts` and the close route `/plan/annual/{id}/close`.
- Surfaces: `/plan/strategic`, `/plan/strategic/archived`, `/plan/strategic/{id}`, `/plan/opening-balances` (first-plan only; `?plan={id}` reads the first plan's archived figures), `/plan`, `/plan/annual`, `/plan/projects` and `/dashboard`.
- Opening-balance gates: `src/server/plan/opening-import-actions.ts` and `src/server/plan/opening-reconciliation-actions.ts`.

## Consequences

- The horizon stops being a terminal state: the owner can end a plan deliberately (shrink, final-close, archive) and start the next one with a clean boundary.
- The money model stays small. Because nothing crosses the boundary, there is no cross-plan ledger, no reconciliation between a source plan and a target plan, and no second current plan to disambiguate — the final close is ordinary close arithmetic with zero carry.
- The last year of a plan can be closed without inventing a next-year annual plan outside the horizon, which removes the contradiction that previously made the end of the horizon unclosable.
- The cost is continuity: a multi-year project that spans a plan boundary must be split into two projects, and its lifetime figures no longer live in one record. The owner accepted this — the plan is the reporting boundary, and the two plans' pages carry the two halves.
- Archived plans become a first-class read-only surface (list, detail page, links), so history is reachable without a database query and without offering a write path.
- Opening balances remain a one-time, first-plan concern; a successor never re-runs the go-live ceremony.
- The archive date and reason live in the audit trail, so the archived plans list is only as complete as the audit entries. The list treats a missing entry as unknown rather than inventing a value.

## Alternatives considered

- **Keep one plan per deployment.** Rejected: it makes the product a dead end after the horizon and contradicts BR-1/A1, which promise one *active* plan, not one plan forever. It also leaves a mistaken draft unarchivable until activation, which is worse.
- **Overlapping horizons with a plan switcher.** Rejected: two plans would both own the same fiscal year, so BR-3 and every "current year" report would need a plan context and every screen a switcher. The owner's model is sequential.
- **Copy the last plan forward as a new draft.** Rejected: it would copy initiatives, projects and money that belong to the finished plan, and the copy would immediately look like an approved re-plan. A successor is a new plan, not a duplicate.
- **Carry the remaining budget into the successor.** Rejected: the carry-over ledger's whole point is a source and target year inside one plan; a cross-plan entry would need a new origin, a new target resolver and a policy for when the successor's first year differs. The owner's decision is no carry across the boundary.
- **Allow archiving with open annual plans.** Rejected: an open annual plan on an archived (read-only) plan could never be closed or corrected, and its money would be unaccounted. Refusing the archive is the honest rule.
- **Require a successor annual plan at the final close.** Rejected: the successor plan does not exist yet, and the horizon forbids an annual plan beyond the end year. The final close exists precisely to break that circular requirement.
- **Store `archived_at` / `archived_reason` on the plan row.** Rejected: the audit entry already records actor, reason and timestamp for the status change; a second copy would be a second truth to keep in sync. A derived read is enough for a read-only list.
- **Restore an archived plan.** Rejected: archive is the final boundary. A wrong plan is archived and a corrected successor created; allowing a restore would put two plans in play and rewrite history.
