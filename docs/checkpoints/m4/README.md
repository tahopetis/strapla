# M4 Multi-year — checkpoint evidence (year close and carry-over)

Captured 2026-10-26 against the dev server with PostgreSQL 18.

| Screenshot | What it shows |
| --- | --- |
| `01-close-review.png` | Close review for FY2027: program unallocated budget, project allocation remaining, per-component carry-over inputs, target program selection and the approval reference |
| `02-closed-year.png` | FY2027 after closing: the close page shows the approval reference, closed timestamp and every carry-over entry in the read-only closed state |
| `03-carry-in-target-year.png` | FY2028 program showing the carried-in capex/opex amounts on top of its budget |

## Browser verification (headless Chromium)

1. Open FY2027 (active) → **Close fiscal year**. The review shows unallocated program budget and
   allocation remaining per component, with open commitments excluded from the carry-over base.
2. Enter program carry-over 500M capex + 100M opex with the default continuation target program;
   enter 100M capex carry-over for the cross-year project's FY2027 allocation; approval reference
   `BOARD-CLOSE-FY2027-001`.
3. Submit: FY2027 becomes `closed` with the reference and closing timestamp; the annual plan page
   shows the success flash and the closed badge.
4. The close page now shows the snapshot: approval reference, closed date, total carry-in and one
   row per carry-over entry.
5. FY2028 program card shows carry-in 500M/100M; the project's FY2028 allocation shows the 100M
   carry-in. Carry-over was added to whatever carry-in already existed.
6. Attempted edits on the closed year are blocked (creates/voids); updates remain audited
   administrator corrections, and settlement lifecycle events (paying existing commitments) are
   still allowed and audited.

## Rules implemented (charter §6.7, ADR-0003 §7)

- Close requires an **active** annual plan and the **next fiscal year's plan** to exist and not be closed.
- Carry-over candidates: `max(0, remaining)` per allocation component and `max(0, unallocated)`
  per program component — open commitments are not carried.
- Every carry amount is validated server-side against the candidate (no over-carry), with a required
  approval reference stored on each snapshot entry.
- Closing writes carry-in onto the target program and target allocation (creating the target
  allocation with zero allocation amounts when the project spans the target year), records
  `carry_over_entries`, audits every carry-over and the plan close in one transaction, then locks
  the year (`status = closed`, `closed_at`, `closed_by`, `close_reference`).
- No reopen, rollback or restore: closed years are read-only except audited administrator updates;
  creates and voids are blocked.
- Settlement lifecycle events after close (spend entries settling existing commitments) are allowed
  and audited, per charter §6.7.
