# M2 Funding — checkpoint evidence (allocations and flag engine)

Captured 2026-10-26 against the dev server with PostgreSQL 18.

| Screenshot | What it shows |
| --- | --- |
| `01-project-allocations.png` | Project detail with the new annual allocation (`FY2027 · PRG-2027-001`, capex Rp 600,000,000 / opex Rp 200,000,000) and per-component remaining |
| `02-program-budget-position.png` | FY2027 program card after allocation: capex available Rp 1.3B, allocated Rp 600M, unallocated Rp 700M; opex available Rp 325M, allocated Rp 200M, unallocated Rp 125M |
| `03-over-allocation-flag.png` | Allocation raised above the program budget: allowed (BR-17), flagged as over-allocated (BR-7) with a negative unallocated budget (-Rp 100,000,000) |
| `04-funding-flags.png` | Project funding flags: commitment ceiling (BR-8) shown alongside the pricing chain flags (BR-9/BR-18) |

## Browser verification (headless Chromium)

Project year allocations (#12):

1. Open `PRJ-2027-001` and add an allocation against the FY2027 program — only programs for the
   project's SI inside its active years are offered; one allocation per project per fiscal year.
2. The project card shows allocation, carry-in and remaining per component; the program card shows
   available / allocated / unallocated per component.
3. Raise the allocation above the program budget: the save is allowed with the over-allocated flag
   and the negative unallocated budget; revert to the approved amount afterwards.

Balances and flag engine (#13):

4. `src/domain/funding.ts` (property/unit tested): program budget position, allocation remaining,
   and the project funding flags — over approved budget (BR-9), above submitted price (BR-18),
   lifetime commitments over contract value (BR-8), annual allocations above the full-life
   allocated budget.
5. The program card and the project pricing card render flags from that engine; flags never block
   entry (BR-17). Negative computed amounts render as `-Rp 100.000.000` (the money display helper
   supports computed negatives; stored amounts stay non-negative).

Pricing chain and contract value (#14):

6. The project view shows allocated / approved (ijin prinsip) / submitted / final deal price side
   by side, plus lifetime commitments, total annual allocations and full-life allocated budget, with
   the corresponding flags.

## Next

M2 reporting (#15): SI five-year view, annual plan view, project register and budget-versus-actual
with CSV/XLSX exports and print views — checkpoint 3 and the December release core.
