# M3 Execution — checkpoint evidence (commitments, spend and settlement)

Captured 2026-10-26 against the dev server with PostgreSQL 18.

| Screenshot | What it shows |
| --- | --- |
| `01-allocation-execution.png` | FY2027 allocation execution page: capex allocation 600M, commitment 400M partially settled by a 300M spend; remaining computed as allocation − open commitments − current-year spend |
| `02-br11-and-opening.png` | BR-11 warning (current-year spend above the fiscal-year commitment) plus a prior-year opening payment excluded from remaining |
| `03-recurring-ops-execution.png` | Recurring ops item page: opex-only commitment with a partial settlement, remaining derived from budget + carry-in |

## Browser verification (headless Chromium)

1. Open the project allocation execution page from the project's annual allocations card.
2. Record a capex commitment of Rp 400,000,000 (PO-2027-001, 2027-08-15).
3. Record a capex spend of Rp 300,000,000 settling Rp 300,000,000 of that commitment: the commitment
   shows `partially settled`, settled 300M, open 100M; remaining decreases by the open amount plus the
   current-year spend (600M → 200M).
4. Record a second capex spend of Rp 200,000,000 with no settlement: current-year spend (500M) now
   exceeds the commitment total (400M) → the BR-11 warning appears and remaining reaches 0.
5. Record a prior-year opening payment of Rp 100,000,000: it appears in the "prior-year opening
   payments" line and does **not** reduce the current year's remaining.
6. The project page's allocation card shows the BR-11 badge and the updated remaining.
7. Recurring ops: record an opex commitment (50M) and a 20M spend settling 20M of it — the recurring
   item's remaining follows the same formula with its opex budget + carry-in.

## Domain tests (settlement rules)

`src/domain/settlement.ts` (with `settlement.test.ts`):

- open amount and commitment lifecycle (`open` → `partially_settled` → `settled`)
- settlement splits: no over-settlement, no splits beyond the spend amount, no duplicates/zeroes
- cross-year classification (commitment fiscal year earlier than the spend's fiscal year)
- current-year spend excludes cross-year settlement portions and prior-year opening payments
- BR-11 spend-versus-commitment comparison

## Notes

- Settlement links are fixed once a spend is recorded; corrections void the spend and re-enter it
  (audited, no hard deletes). Voiding a spend releases its settlements and restores the open
  commitment amounts.
- Voiding a commitment is blocked while it has settlements; a commitment cannot be reduced below the
  amount already settled.
- Cross-year settlement data flows into the M3 reporting line (#20, next).

## Cross-year settlement reporting (#20)

| Screenshot | What it shows |
| --- | --- |
| `04-cross-year-settlement.png` | FY2028 allocation execution page: a FY2028 spend paying a FY2027 commitment is marked as a cross-year settlement and excluded from the current year's remaining |
| `05-budget-vs-actual-execution.png` | Budget-versus-actual with committed/spent columns filled and the prior-year settlement and prior-year opening columns |
| `06-annual-plan-execution.png` | Annual plan report with execution figures, including recurring ops committed/spent/prior-year opening/remaining |
| `07-project-register-execution.png` | Project register with lifetime commitments (opening committed + in-app commitments) and spent to date (opening spend + in-app spend) |
| `08-si-five-year-execution.png` | SI five-year view with committed and spent columns filled per initiative |

### Browser verification (headless Chromium)

1. Create a project spanning FY2027–FY2028 (200M full-life).
2. FY2027 allocation 100M capex + commitment 100M; FY2028 allocation 100M capex.
3. On the FY2028 allocation page record a 100M spend dated 2028-03-01 settling the FY2027 commitment
   (the prior-year commitment appears in the settlement options with a `PRIOR YEAR` label): the spend
   shows the **cross-year settlement** badge and does not reduce FY2028 remaining.
4. Reports: budget-versus-actual shows the prior-year settlement line for FY2028 (Rp 100.000.000);
   the annual plan shows prior-year opening columns for recurring ops; the project register shows
   lifetime commitments and spent to date; the SI five-year view shows committed and spent.
5. CSV exports of all four reports carry the new execution columns (`Committed capex`,
   `Prior-year settlements`, `Prior-year openings`, `Lifetime commitments`, `Spent to date`,
   `Open commitments`).

### What changed in the queries

`src/server/plan/execution-aggregates.ts` loads commitments, spend and settlements for the plan and
rolls them up by allocation, program, SI, project and recurring ops item: FY commitments, open
commitments, all in-app spend, current-year spend net of cross-year portions, cross-year settlement
amounts and prior-year opening payments. The four report queries consume those rollups; the exports
share the same shapes.
