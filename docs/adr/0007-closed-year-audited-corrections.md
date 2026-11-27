# ADR-0007: Closed-year audited corrections

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** Portfolio owner (approval), engineering lead (proposal)
- **Related:** [Charter §6.7 and Q4](../CHARTER.md), [GLOSSARY](../../GLOSSARY.md), [Data model](../data-model.md), [ADR-0003](0003-funding-and-settlement.md), [ADR-0004](0004-audit-and-roles.md), [ADR-0006](0006-carry-in-and-budget-revisions.md), issue #108

## Context

Four product documents promise that a closed fiscal year can still be corrected with a reason: ADR-0004 ("Administrators may perform audited corrections with a reason"), charter §6.7 ("prevents edits except audited administrator corrections"), charter Q4 ("closed years allow audited administrator corrections") and the glossary entry for **Administrator**. [ADR-0006](0006-carry-in-and-budget-revisions.md) recorded the opposite in two places: §4 ("closed plans are read-only") and §7 ("closed-year corrections remain unimplemented").

The code followed ADR-0006. Every plan-record update on a closed year was refused by the editability guards, while those guards still carried an unused `allowClosed` option left over from the year-close work. Creates, voids and status changes were refused too; settlement lifecycle writes on spend entries were (and remain) the only exception allowed after close. A typo in a closed year therefore had no in-app fix and could only be repaired by a direct database edit, which the product forbids.

Issue #108 asked for a policy decision before implementation. Two models were on the table:

- **A. Narrow audited corrections** — a closed year accepts in-place updates to existing monetary plan records, with a mandatory reason and a distinct audit action; the close snapshot and the carry-over ledger stay immutable.
- **B. Immutable close** — amend ADR-0004 and the charter to drop the correction promise, and provide an explicit next-period adjustment mechanism instead.

The owner chose **A**. The promise in the charter and ADR-0004 is the intended policy: a close freezes history, not the ability to fix a mistake in it.

## Decision

### 1. A correction is an in-place update, and only that

A closed fiscal year accepts **updates** to existing plan records. It does not accept creates, voids or status changes, and it does not accept edits to settlement links. Those keep refusing with the closed-year message; an archived strategic plan, a cancelled project and a voided record stay fully read-only, exactly as today.

The corrected record must be a record that already exists. There is no correction of a missing record: a record that was never entered is not a typo.

### 2. Scope: six correctable record types

Correctable in a closed year, every field the existing update form edits:

| Record type | Fields |
| --- | --- |
| Annual program | capex and opex budget, name, notes, strategic initiative, continuation link |
| Project year allocation | capex and opex allocation, notes |
| Project | full-life allocated budget, submitted price, final deal price, project opening figures (allocated, committed, spent), metadata |
| Ijin prinsip | document number, date, approved amount, approver, document link, notes |
| Recurring ops item | opex budget and its in-place carry-in, name, category, owner, notes |
| Commitment entry | component, amount, commitment date, reference, description |

Carry-in needs one distinction. A **program or project year allocation** carry-in is derived from the carry-over ledger (ADR-0006 §2), and the ledger is immutable, so there is nothing in a closed year to correct: a wrong receipt is adjusted in the **receiving** year by a budget revision (ADR-0006 §4), where it is an ordinary in-year change. A **recurring ops item** is outside the ledger and outside the year close (ADR-0006 §7): its single carry-in is an in-place audited field, so it is on the correctable list together with its opex budget.

### 3. Corrections do not change money semantics

- A closed-year program budget is corrected **in place**. **No budget revision is posted** to a closed year: revisions exist only for `active` annual plans (ADR-0006 §4), and that stays true. The revision register is unchanged by a correction, and the program's effective budget equals its corrected initial budget because the year has no revisions.
- A program budget correction is still subject to the no-component-shift rule (BR-16): capex and opex never move into each other. The rule applies on every path.
- A commitment still cannot drop below its already settled amount.
- An allocation may be corrected to a figure below its open commitments plus current-year spend. Over-committed and unfunded states are **flags, never blocks** (BR-17), and the closed year is no exception.
- The same validation rules as the open-year path apply: project years stay inside the plan horizon and inside the originating program's year, codes stay unique, continuation links stay valid, spend categories stay active.

### 4. The snapshot, the ledger and the carry-in caches are immutable

A correction never writes:

- the close snapshot rows (`close_snapshots`),
- the carry-over ledger entries (`carry_over_entries`),
- the `carry_in_capex` / `carry_in_opex` caches on annual programs and project year allocations (a recurring ops item's carry-in is an in-place input, not a ledger cache, and is correctable with its budget).

This is the boundary that makes model A safe. The close decided which money moved; a correction to a live plan figure does not re-open that decision. If the close itself was wrong, the fix is in the receiving year (a budget revision), not in the source year's receipt.

The annual plan stays `closed` across a correction, with its original `closed_at`. There is no reopen, no rollback and no version restore.

### 5. Audit: a distinct `correction` action

- Every correction writes exactly one audit entry with action **`correction`**, not `update`, carrying the reason and the before/after snapshots, in the same transaction as the mutation (ADR-0004).
- The server derives "this is a correction" from the governing annual plan's status **at write time**. There is no client-supplied flag: a client cannot ask for a correction in an open year, and cannot disguise one in a closed year.
- The reason is mandatory. It already is on every update form; a correction does not weaken that.
- The token is humanized as *Corrected after close* in the record history and in the audit view.

### 6. "Corrected after close" is derived, never stored

Whether a record has been corrected is read from the audit trail: the presence of a `correction` entry for that entity. There are no new columns and no schema migration — the annual plan's `status`/`closed_at` plus `audit_entries` are the only signals.

Deriving the marker has one consequence worth stating plainly: history is the source of truth for "this changed after close", and deleting or editing audit rows is already forbidden (ADR-0004), so the marker cannot drift from the trail.

### 7. The UI keeps the read-only frame and adds one explicit affordance

A closed page still reads as read-only. Each correctable record gains an explicit **Correct record** affordance that reveals the *existing* edit form under a banner saying the fiscal year is closed and the save is recorded as a correction after close. There is no typed confirmation: the reason field is the ceremony, and a second confirmation on every save would be noise.

- Corrected records show a **corrected after close** badge and their history.
- The closed annual plan shows a "N corrections after close" banner linking to the records.
- The close receipt keeps its frozen figures and adds a notice listing the corrected records with links, so the receipt never silently disagrees with the live figures.

### 8. Reporting: live figures, marked rows, frozen snapshot

- All four reports and their CSV/XLSX exports read **live** figures (initial budget plus revision deltas, corrected in place), exactly as they do now. A correction moves the report the same way an open-year edit moves it.
- Each report row whose figures rest on a corrected record carries a **corrected after close** marker, and each report gains a footnote explaining that the figures are the corrected live figures while the close snapshot remains the historical record.
- Totals equal the live corrected figures. A marker never changes a total.
- The close receipt and the carry-over figures keep reporting the snapshot. The distinction is made visible rather than reconciled.

### 9. Scope and non-goals

- No reopen, rollback, undo, version restore or hard delete.
- No corrections to the close snapshot, carry-over ledger entries or carry-in caches.
- No creates, voids or status changes in a closed year; no editing of settlement links.
- No budget revisions posted to a closed year (revisions stay active-only).
- No change to the settlement lifecycle or the post-close settlement treatment (ADR-0003).
- No new roles and no separate correction permission: every account is an administrator, so the audit trail — not a privilege difference — is the guardrail.
- No typed confirmation, no correction table, no versioning.
- Historical checkpoint documents are not rewritten.

### 10. Amendments to earlier decisions

- **ADR-0004 is clarified, not reversed.** The editing rule "while a fiscal year is closed, ordinary mutations are blocked; administrators may perform audited corrections with a reason" now has a named implementation: an in-place update of an existing plan record, audited as `correction`, with the snapshot and ledger excluded. Everything else in ADR-0004 stands.
- **ADR-0006 §4 is amended.** Its "closed plans are read-only" reads "closed plans accept in-place corrections only; a budget revision is still posted only to an active plan." **ADR-0006 §7's last bullet** ("closed-year corrections remain unimplemented, as before") is superseded by this ADR.

## Consequences

- The documentation and the product stop contradicting each other: the promise in ADR-0004, charter §6.7/Q4 and the glossary is now what the code does.
- The blast radius is deliberately small: no schema change, one new audit token, one derived marker, one guard option wired on six update paths. The close machinery, the ledger and the report totals are untouched.
- A closed year becomes *revisable but not restatable*: live figures move, history does not. Anyone comparing a report to the close receipt will see a difference after a correction, which is why the receipt carries the notice and the reports carry the footnote.
- The unused `allowClosed` guard option stops being dead code. It is the mechanism the correction path uses, so a future reader does not have to invent a second editability story.
- Corrections are harder to see than voids and revisions, because they are updates: the audit trail is the only index. The banner, the badge and the report marker exist to compensate.
- Two truths about the same closed year now coexist by design (live corrected figures, frozen snapshot). That is the accepted cost of not touching an audited close.

## Alternatives considered

- **Model B: immutable close, amended docs.** Rejected by the owner. It deletes a promise the product has already made in four places, and the real need — fixing a typo in a closed year without a database edit — would remain unmet. A next-period adjustment mechanism also cannot fix a figure that belongs to the closed year and is read by every prior-year comparison.
- **Reuse the `update` action for corrections.** Rejected: the report marker, the receipt notice and the audit filter all need to tell a correction from an ordinary in-year edit, and reconstructing that from `created_at` versus `closed_at` is a join the trail already answers for free.
- **A client-supplied `isCorrection` flag.** Rejected: it lets a caller choose its own audit semantics, and an open-year caller could claim a correction. The plan status at write time is the only honest source.
- **Allow budget revisions in closed years instead of in-place corrections.** Rejected: a revision is an immutable document that changes an effective budget by a delta; posting one to a year that already closed its snapshot would create a second, competing history for the same money. Corrections are simple updates and are already understood by the guards.
- **A separate correction table or a versioned copy of the record.** Rejected: the audit trail already holds before/after snapshots and is append-only. A second store would be a second truth with no extra guarantee.
- **Typed confirmation ("type CORRECT to save").** Rejected by the owner: friction without information. The mandatory reason is the ceremony that matters, and it is the part the audit reader actually uses.
- **A separate correction permission.** Rejected: every account is an administrator (ADR-0004), so a permission would be a switch nobody could set to the safe value.
- **Corrections that re-derive the close snapshot.** Rejected: the snapshot is the historical record of a decision taken at close. Recomputing it would rewrite an audited event, and it would make the carry-over ledger disagree with its own source.
