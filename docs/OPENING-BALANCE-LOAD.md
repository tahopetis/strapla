# Opening balance load workplan — FY2027 cut-over

The app's first in-app fiscal year is **FY2027**; FY2026 is closed manually outside Strapla. The
opening balances are the signed-off bridge (charter §6.9, ADR-0003 §5). This workplan is executed
once, during UAT, against a **clean database**.

## Cut-off rules

1. FY2026 is completely closed in the spreadsheets before the load starts.
2. No FY2027 transactions are recorded in the app until the opening load is signed off.
3. Opening figures are one-time data: after go-live they are corrected only through audited edits
   with a reason (never by re-running the load).
4. Documents (ijin prinsip letters, contracts) are referenced by number/link; no uploads in v1.

## Source data needed from the spreadsheets

| Source | Used for | Notes |
| --- | --- | --- |
| FY2026 annual plan and program budgets | Program carry-in (unallocated program budget carried forward) | One figure per program per component |
| FY2026 project allocations and closes | Project opening allocated / open commitments / spent, and allocation carry-in | Committed-but-unpaid amounts are open commitments, not carry-over |
| FY2026 SI envelope consumption | SI prior program budget consumed | Total program budgets used before FY2027 |
| FY2027 plan draft | SIs, programs, projects, recurring operations and allocations to build in-app | Entered normally, not as opening figures |
| Contract and ijin prinsip register | Project full-life figures, approved amount, document number/date/link | Part of project creation (UAT-05) |

## Load order

Work strictly top-down; each step assumes the previous one is complete.

| Step | Records | Fields to enter | Where |
| --- | --- | --- | --- |
| 1 | Strategic plan | Horizon 2026–2030, then activate | `/plan/strategic` |
| 2 | Strategic initiatives | Code, name, owner, objective, envelope, **prior program budget consumed** | `/plan/strategic` |
| 3 | FY2027 annual plan | Create as draft, add notes, activate later | `/plan/annual` |
| 4 | Annual programs | Code, name, SI, capex/opex budget, **capex/opex carry-in**, continuation link | `/plan/annual/[id]` |
| 5 | Projects | Code (auto), name, years, full-life allocated, submitted price, final deal price, **opening allocated / open commitments / spent**, ijin prinsip record | `/plan/projects` → project |
| 6 | Project year allocations | Allocation per component, **allocation carry-in**, notes | Project page → Annual allocations |
| 7 | Recurring operations | Name, category, owner, opex budget, **opex carry-in** | `/plan/annual/[id]` |
| 8 | Reconciliation | Compare totals with the spreadsheets and sign off | `/plan/opening-balances` |

## Entering amounts

- Amounts are whole Rupiah; dots in the input are ignored (`1.234.567` and `1234567` are the same).
- Every edit and void requires a reason; the reason is stored in the audit trail.
- Opening figures are edited on the entity forms with the reason convention
  `Opening balance — FY2026 close / <reference>`.
- Flags never block entry: an over-allocation or over-approved project is allowed so the real data
  can be recorded; flags are resolved later with the owner.

## Reconciliation and sign-off

`/plan/opening-balances` must show:

1. **SI envelope reconciliation** — envelope, prior consumed, in-app program budgets, headroom; each
   SI within or explicitly flagged.
2. **Program carry-in** — budget + carry-in available per component for every FY2027 program.
3. **Project opening position** — opening allocated / open commitments / spent per project.
4. **Reconciliation totals** — match these against the spreadsheet control totals.

Record the comparison here and sign:

| Control total | Spreadsheet | Strapla | Difference | OK |
| --- | --- | --- | --- | --- |
| Total envelope (all SIs) |  |  |  |  |
| Prior program budget consumed (all SIs) |  |  |  |  |
| FY2027 program budgets (capex + opex) |  |  |  |  |
| Program carry-in (capex + opex) |  |  |  |  |
| Project opening allocated |  |  |  |  |
| Project opening open commitments |  |  |  |  |
| Project opening spent |  |  |  |  |
| Project full-life allocated |  |  |  |  |

| Sign-off | Name | Date |
| --- | --- | --- |
| Opening balances loaded and reconciled |  |  |
| Engineering lead review |  |  |

## Rollback of the load (before go-live)

Before the load is signed off, a failed load is discarded by rebuilding the environment from the
release image with a clean database (no production data exists yet). After sign-off, corrections are
audited edits — there is no bulk reload path in v1.
