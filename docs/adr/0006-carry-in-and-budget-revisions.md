# ADR-0006: Carry-in is an input, held in a ledger, with close snapshots and in-year budget revisions

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Portfolio owner (approval), engineering lead (proposal)
- **Related:** [Charter §6.7–6.8](../CHARTER.md), [GLOSSARY](../../GLOSSARY.md), [Data model](../data-model.md), [ADR-0003](0003-funding-and-settlement.md), [ADR-0004](0004-audit-and-roles.md)

## Context

Carry-in is the money one fiscal year hands to the next. The owner's question that started this decision was narrow: *carry-in is only one input for the next year, right — it can still be cut while that year is running?* The answer is yes, and making that answer true exposed four gaps in the current model:

1. **Carry-in is a column written from four directions** — year close, annual program form, project year allocation form, opening import. The close writes it, and once the target year's allocations exist the column can be edited or zeroed in place. The append-only `carry_over_entries` record and the column can disagree; nothing enforces them to match.
2. **The year close records only what was carried.** A partial carry is a management decision, yet the amount that was available and deliberately *not* carried is recorded nowhere.
3. **There is no revision document.** Once an annual plan is active, a program's budget changes only by in-place edits with a reason — indistinguishable from data entry. The owner's process has formal budget additions, switches and cuts; the app cannot represent them.
4. **The SI envelope is one number**, while every budget, allocation, commitment and spend is per component (BR-16). Capex and opex never shift into each other, so the envelope must be checked per component too.

The owner also decided that a revision may be entered before its formal decision exists (the IT steering committee meets later), that a cut is "just gone" rather than parked in a reserve, and that capex and opex never shift.

## Decision

### 1. Carry-in is an input, not an entitlement

Once a carry-over is approved, the amount enters the target year as one budget input among others: available program money is `effective budget + carry-in` (see §4–5), and the remaining formula is unchanged (`remaining = allocation + carry-in − open commitments − current-year spend`). It is fully fungible — allocated, left unallocated, or cut like any other money. The only special property of carry-in is provenance: it can be traced to the receipt that granted it.

### 2. The carry-over ledger is the single source of carry-in

- `carry_over_entries` is an append-only ledger and the **only** source of carry-in. Each entry records: origin (`close`, `opening`, `manual`), source and target annual plan, entity type (`program` or `allocation`), source and target entity, component, amount, reason, actor, timestamp, and optionally the receipt entry it was carried from (carry of carry — one hop; the chain is reconstructable).
- The sum of entries for a target entity and component **is** that entity's carry-in. The `carry_in_capex` / `carry_in_opex` columns stop being writable inputs: they either disappear and are derived on read, or remain as a cache with a server/database guard that they equal the ledger sum. No form writes carry-in directly.
- Opening-balance carry-in (FY2027) and a manual management grant are entries of origin `opening` and `manual`, each with a reason. They are not silent edits.
- Entries are never updated or deleted. There is **no reversal entry**: a later cut is a budget revision, not a partial undo of the receipt (see §4).

### 3. The year close records a snapshot, not just the carried amount

- Carry remains explicit per component, per program and per project year allocation, bounded by the same candidates as today: program unallocated (`effective budget + carry-in − allocations`) and allocation remaining (`allocation + carry-in − open commitments − current-year spend`), per component.
- A close writes one **close snapshot row per source entity and component**: available amount, carried amount, not-carried amount, and the reason for the not-carried part. Carried must equal the sum of carry-over entries written for that entity and component; carried + not-carried must equal available. All three are written in the close transaction.
- Zero carry must be typed; a blank blocks the close. Nonzero program carry requires a target program. Open commitments are not carried and remain commitments.
- One approval reference is recorded on the annual plan for the close as a whole. Per-program treatment may differ and is captured by the per-row amount and the not-carried reason; entries inherit the close reference.
- The carry target is the source program's **continuation program** (`prev_program_id`) when one exists. Another program in the same SI is selectable only when the source program is discontinued or merged, and that choice must be explicit — it is a reallocation decision, not a default.
- Carry of carry is allowed: the unused part of a carried amount can be carried again next year. Lineage is one hop per entry; no expiry is built in, and the close decision is the only limit.

### 4. In-year budget revisions

Once an annual plan is **activated**, its program budgets are frozen. Changes to a program's capex or opex budget — and the de-allocation lines of a switch — go through a **budget revision**. Nothing else does: non-amount fields (name, notes, SI) and project year allocations remain editable in place with the usual reason and audit, and a program created during an active year starts with a zero budget and is funded by a revision.

- **Scope.** Revisions exist only for `active` annual plans. Draft plans are edited directly; a closed plan accepts in-place corrections only and never a revision ([ADR-0007](0007-closed-year-audited-corrections.md)). The first revision-enabled year is **FY2027**; FY2026 stays manually closed outside the app. For an FY2027 plan that is already active at rollout, the baseline is the budget at rollout — no retroactive revisions.
- **Document.** A revision has a header (system number per fiscal year, e.g. `REV-2027-001`, date, decision reference, reason, actor) and lines (entity, component, signed delta). It is multi-line, applied atomically, immutable after posting, and corrected by a new revision — never edited or deleted.
- **No component shift.** Every line names a component; capex and opex never offset each other. A switch is a balanced pair of lines in the same document and the same component: one program down, another up. The no-shift rule applies on every path — draft edits, revisions, and allocation edits.
- **Switch floor.** A switch may take only a program's unallocated budget, or must carry explicit de-allocation lines. A de-allocation may not push a project year allocation below its open commitments plus current-year spend.
- **Involuntary cuts.** An efficiency cut or a delayed program may push a program's budget below its allocations (over-allocated flag) or below open commitments plus spend (unfunded flag). Those are flags, never blocks (BR-17); project de-allocation is a separate later decision.
- **Cuts are deltas only.** A cut reduces the program budget and is "just gone": no reserve account, no negative carry entry, no destination entity. An addition is equally a delta, funded by an approved request or a parallel switch line. The revision's reason and decision reference are the record of why.
- **Approval may follow.** A revision may be posted before its formal decision exists. `decision_reference` is nullable; such a revision is shown as *awaiting decision reference*. A later **record decision** action attaches the reference as metadata only — lines and deltas are already frozen — and is audited.

### 5. The SI envelope is per component

- The SI envelope is split into `envelope_capex` and `envelope_opex`; `prior_program_budget_used` is split the same way, and the opening-balance control envelope follows.
- The BR-2 check is per component: prior consumed component + Σ effective program budget component ≤ envelope component. **Effective budget** is the program's initial budget plus all revision deltas; carry-in is excluded because it was already counted in the source year's program budget.
- Envelope changes stay a plan-level SI edit: reason required, history visible, no approval reference (the steering committee may follow). They remain a flag, never a block (BR-2, BR-17). A revision never changes the envelope; when a revision needs more envelope, the plan-level change is separate.
- A switch may cross SIs; the envelope check moves consumption between the two component envelopes accordingly and only flags.
- Migration splits existing single envelope and prior figures manually, with the old figures and the current capex/opex budget composition shown as reference. No automatic proportional split: the envelope is a policy number, not a derived one.
- Moving a program to another SI is a structural, audited edit; envelope consumption moves with it. Recurring ops items stay outside the SI envelope check (no SI link).

### 6. Display and reporting

- The program's money line reads: initial budget | carry-in received | revisions (+/−, with number) | effective budget | allocations | commitments | spend | remaining, per component. Effective budget is computed in one domain function; every screen and report consumes it.
- Each annual plan has a revision register: number, date, decision reference (or *awaiting*), reason, total delta. The close receipt shows the snapshot (available, carried, not carried).
- Reports use effective budget, never the initial budget alone. Envelope figures are shown per component, with the same warning-only semantics.

### 7. Scope and non-goals

- **Recurring ops items are out of scope.** They have no SI link and no year-close carry; their opex budget and single carry-in column stay in-place audited fields. Adding them to the ledger or revision model is a separate decision.
- **Closed-year corrections are out of this ADR's scope.** This ADR adds no correction path; a corrected closed year is [ADR-0007](0007-closed-year-audited-corrections.md), which leaves this ADR's snapshot, ledger and revision rules unchanged.
- No reserve account, no negative carry entry, no destination accounting, no automatic envelope split.

## Consequences

- **ADR-0004 is amended** for annual program budgets: "administrators edit records in place while a year is open" no longer holds for a program's capex/opex budget once the plan is active; budget revisions take over. Every other record keeps in-place audited editing with a reason.
- **ADR-0003 is amended** in three places: §5 opening carry-in becomes ledger entries and the envelope/prior figures split per component; §6 the envelope flag is per component; §7 `carry_over_entries` becomes the ledger, the approval reference moves to the close as a whole, the snapshot stores available/carried/not-carried, and the carry target follows the continuation link.
- **BR-13** is read at close level: one approval reference per close, with per-row treatment and reason. **BR-2** is read per component. Neither charter rule is deleted.
- New tables: close snapshot, budget revisions, revision lines. New columns: envelope and prior per component; `carry_over_entries` gains origin, reason and lineage. `data-model.md` is updated when the schema changes ship.
- The ledger and the snapshot agree by construction: carried = Σ entries; available = carried + not-carried. Both are enforced in the close transaction.
- Cuts being "just gone" keeps the model small, at the cost of no destination accounting: an audit reader sees the decision and the delta, not a fund that received the money. Accepted by the owner.
- Posting before the decision exists is a deliberate audit state; the register must surface *awaiting decision reference* so a bare revision is not mistaken for an approved one.
- Migration is a one-time manual job: existing `carry_in_*` values become ledger entries with origin `opening` or `close`; envelope and prior figures are entered per component.
- More UI surface than before: revision register, close receipt, awaiting-decision state, per-component envelope figures. Reporting must consume the effective-budget function so screens cannot disagree.

## Alternatives considered

- **Keep the columns and guard them.** Rejected: four writers plus a cache column still leave two truths to reconcile; one ledger is the smaller surface.
- **Reversal entries (negative carry).** Rejected by the owner: a cut in the following year is a budget revision, not a partial undo of the receipt.
- **A reserve account for cut money.** Rejected by the owner: cuts are "just gone"; parking would invent a fund nobody approved.
- **Mandatory decision reference at posting.** Rejected: revisions happen before the steering committee meets. Optional-plus-later-attach keeps the audit honest without blocking reality.
- **Allow capex/opex shifts per revision.** Rejected: the owner's rule is that the two components never shift.
- **Hard-block over-budget cuts.** Rejected: BR-17 says flags do not block; the switch floor is a transaction rule, not a flag.
- **Automatic proportional envelope split on migration.** Rejected: the envelope is a policy number, not a derivation from current budgets.
