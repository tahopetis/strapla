# ADR-0003: Funding model — allocations, commitments, settlement, opening balances

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Portfolio owner (approval), engineering lead (proposal)
- **Related:** [Charter §6.4–6.9](../CHARTER.md), [Data model](../data-model.md), [GLOSSARY](../../GLOSSARY.md)

## Context

The charter describes a top-down funding chain and three figures that must never be conflated: contract value (project, whole life), fiscal-year commitment (allocation), and actual spend (allocation). While building the model we found two gaps the original draft did not resolve:

1. **Commitments and spend overlap.** A purchase order committed in FY2026 is paid in FY2027. The literal formula `remaining = allocation + carry-in − commitment − spend` double-counts a payment against its own commitment, and a payment of a prior-year commitment booked against the new year reads as an overspend.
2. **The app starts at FY2027.** FY2026 is closed manually outside the app, so the SI-envelope check, contract ceiling, and lifetime figures would otherwise be blind to everything before go-live.

## Decision

### 1. The chain and the components

The funding chain is exactly the charter's: Strategic Plan → SI (envelope) → Annual Plan → Annual Program (capex + opex budget, plus carry-in) → Project Year Allocation (allocation, carry-in) → commitments and spend. Recurring ops items hang off the annual plan, opex-only.

Every monetary figure is held **per component** (capex, opex). Combined totals are always derived, never stored. All amounts are whole-Rupiah integers ≥ 0.

### 2. Project figures versus annual money

- The **project** holds the whole-life procurement record: full-life allocated budget, ijin prinsip approved amount, submitted price, final deal price (contract value), start and end fiscal year. These are project-level totals; they are reference figures, not the operative annual budget.
- The **project year allocation** holds the operative annual money: `allocation_capex`, `allocation_opex`, `carry_in_capex`, `carry_in_opex`. Exactly one allocation per active fiscal year, attached to that year's annual plan and to that year's program for the same SI.
- Allocations are what program budgets are checked against. Cumulative allocations across years are compared with the project's full-life allocated budget and flagged when they exceed it (soft flag; data entry is never blocked).

### 3. Commitment lifecycle and settlement

- A **commitment entry** has an amount, a component, a commitment date, a reference, a parent (project year allocation XOR recurring ops item), and a lifecycle: `open` → `partially_settled` → `settled`. It is never deleted; it can be voided with a reason.
- A **settlement** is a link between a spend entry and a commitment entry with a settled amount. It is created explicitly when spend is recorded (the form offers the parent's open commitments) or added later as a correction. Partial settlement and multiple settlements are allowed. The sum of settlements for a commitment may not exceed its amount; the sum of settlements in one spend entry may not exceed the spend amount.
- Settlement changes the commitment's settled amount, which is a **lifecycle event**, not an edit of the commitment amount. Settlement events are allowed after the fiscal year has closed and remain audited.
- **Remaining never double counts:**

  ```
  remaining(component) = allocation + carry_in
                       − open_commitments        (commitment amount − settled, component)
                       − current_year_spend      (spend not classified as cross-year)
  ```

  A payment that settles a commitment of the same fiscal year changes `open_commitments` and `current_year_spend` by the same amount, so remaining is unchanged — correct, because the money was already committed.

### 4. Cross-year settlement

- A settlement is **cross-year** when the commitment belongs to a fiscal year earlier than the spend entry's allocation fiscal year.
- Cross-year settlements are counted in the project's lifetime actual spend and cash reporting, but **do not reduce the current year's allocation, remaining, or commitment check**. They are reported on a dedicated line: *settlement of prior-year commitments*.
- Spend entries that settle commitments existing **before the app** (FY2026 and earlier) are recorded with `settlement_kind = prior_year_opening`; they follow the same rule. Their commitment figure is the project's opening committed amount, which is a snapshot and is not reduced by settlements recorded in the app.
- BR-11's warning (spend above fiscal-year commitment) compares *current-year spend excluding cross-year settlements* against the allocation's commitment entries.

### 4a. Post-close settlement

A spend entry can be recorded only in an open fiscal year, but it may settle a commitment whose annual plan is **closed**. The commitment's year is determined by the annual plan that owns its allocation, so "closed" is a plan status, not merely "earlier than the spend". The treatment is chosen **per transaction**, because company policy differs, and applies **only to the closed-year portion** of the settlement — splits against open-year commitments are always current-year.

- **A. Charge to the current year.** The closed-year portion counts as current-year spend: it reduces the current year's remaining and is included in BR-11's current-year spend. The closed year's figures stay frozen. The current-year report shows the money in *spent*, not as a prior-year settlement.
- **B. Charge to the closed year — reserve.** The closed-year portion does not reduce the current year's remaining. It is reported as a prior-year settlement in the current-year report, and on the closed year's report it appears as a separately labelled *post-close adjustment (reserve)* line per commitment fiscal year. The locked close snapshot, carry-over records and carry-over figures never change.
- The default when the choice is relevant is A.
- Under either option the commitment becomes settled (the settlement link is the same). The audit entry is written in the transaction's year and records the treatment.
- The treatment is frozen once the spend has settlements, like the component and the settlement classification: void the spend and re-enter it to change it. Voiding the spend releases the settlement and removes both reporting effects.
- An earlier-year commitment whose annual plan is still open remains an **ordinary cross-year settlement** (§4): no treatment is stored and none is offered.

In the remaining formula (§3), `current_year_spend` therefore excludes every earlier-year settlement portion except a closed-year portion explicitly charged to the current year. BR-11 (§6) compares the same figure against the year's commitments.

### 5. Opening balances (FY2027 start)

Loaded once, manually, by the portfolio owner during UAT:

| Level | Opening figure | Used for |
| --- | --- | --- |
| SI | prior program budget consumed (total already committed to programs before FY2027) | SI envelope check: prior consumed + cumulative in-app program budgets ≤ envelope |
| Project | prior allocated budget, prior open commitments, prior actual spend | contract ceiling, lifetime committed/spent views, project dashboard |
| Annual program (FY2027) | carry-in capex, carry-in opex | program availability from the manual FY2026 close |
| Project year allocation (FY2027) | carry-in capex, carry-in opex | project year remaining |

Pre-app records are **not reconstructed** as in-app records: FY2026 and earlier live in the spreadsheets, and the opening balances are the signed-off bridge. Opening balance edits are audited like any other financial change and are expected only at go-live (administrators can correct them, with a reason, like any other record).

Lifetime commitment check: `opening_committed + Σ commitment amounts (not voided) ≤ final deal price`; exceeded = flag.

### 6. Flags (never blocks)

Computed in `src/domain` and shown in the UI and reports:

- final deal price > approved budget (BR-9)
- final deal price > submitted price (BR-18)
- lifetime commitments > contract value (BR-8, extended with opening committed)
- current-year spend > fiscal-year commitment (BR-11, extended with exclusion of cross-year settlements and reserve-treated closed-year portions)
- allocation > program budget, per component (BR-7)
- cumulative in-app program budgets + prior consumed > SI envelope (BR-2)
- cumulative project allocations > project full-life allocated budget (soft consistency flag)

### 7. Carry-over and year close

- `remaining` per component is the candidate carry-over at close. Carry-over is explicit per component, per project year allocation and per program, requires an approval reference, and is recorded in `carry_over_records`.
- Project-level: the allocation's carried amount appears as `carry_in` on that project's allocation in the next fiscal year. Program-level: unallocated program budget appears as `carry_in` on the continuation program.
- Open commitments are **not** carried; they stay commitments.
- Close locks the annual plan's records and snapshots figures. Corrections on closed years are audited administrator actions. There is no reopen and no rollback.
- The **first in-app close is FY2027** (executed January 2028). FY2026 was closed manually before go-live; its carry-in enters the opening balances.

## Consequences

- The remaining formula and flag semantics are implemented once, in pure functions, with property tests; screens and reports consume them and cannot disagree.
- More M3 work than the literal charter: settlement links, a cross-year line in reports, and opening-balance fields. Accepted in exchange for reports that stay honest across fiscal years.
- The model distinguishes "commitment amount" from "settled amount"; every report must choose one deliberately. Report catalogue documents which figure each report uses.
- Retrospectively reconstructing FY2026 from spreadsheets is explicitly not done; if it is ever wanted, it is a separate milestone.

## Alternatives considered

- **Parallel tracks (literal charter formula):** commits and spends both reduce remaining with no settlement. Rejected: double-counts payments and makes FY2027 look overspent for FY2026 commitments.
- **Availability = allocation − commitments only, spend is reporting-only:** simplest, but budget-versus-actual loses its guardrail and BR-11 becomes meaningless.
- **Full invoice-level matching of every spend to a commitment:** most accurate accounting, out of scope for v1; the settlement link is optional and can be added later per spend entry.
