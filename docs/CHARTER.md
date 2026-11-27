# Strapla Project Charter

## 1. Document control

| Field | Value |
| --- | --- |
| Project | Strapla: IT Portfolio Management |
| Charter version | 0.2 |
| Date | 2026-10-25 |
| Owner | Portfolio owner (author) |
| Status | Approved for v1 build — shared-understanding record of 2026-10-25 |
| Repository | Public, MIT-licensed (owner decision 2026-11-20) |
| Scope of this charter | The project and the product. Technology, authentication and deployment decisions are recorded in architecture decision records in [`docs/adr/`](adr/). |
| Related documents | [`AGENTS.md`](../AGENTS.md), [`GLOSSARY.md`](../GLOSSARY.md), [`docs/data-model.md`](data-model.md), [`docs/agents/domain.md`](agents/domain.md), ADR-0001 (stack), ADR-0002 (authentication and deployment), ADR-0003 (funding and settlement), ADR-0004 (audit trail and administrator role) |

## 2. Problem and background

The IT strategic plan covers five years and is delivered through annual plans. Each annual plan contains annual programs (each tied to a strategic initiative) and a recurring-operations budget. Programs contain projects, projects consume budget across one or more fiscal years, and spending must be reported against capex and opex.

Today this is managed in spreadsheets. That makes four things hard:

1. **Traceability.** It is difficult to trace a Rupiah of spend back to a project, its program, its strategic initiative, and the annual plan it belongs to.
2. **Funding discipline.** Budget is allocated top-down (initiative envelope, then program, then project) and the remaining unallocated balance at each level is not reliably visible.
3. **Approval and procurement pricing.** A project passes through an in-principle approval (ijin prinsip) by the directors, vendor price submissions, and a final deal price. These figures are recorded inconsistently, so the approved budget is rarely compared cleanly with the final contract.
4. **Multi-year money.** Projects carry over between fiscal years. A contract is for the whole project while the commitment booked in a given fiscal year is only that year's portion. Carry-over rules are applied by hand and are not auditable.

## 3. Vision and objectives

**Vision.** One source of truth for the IT portfolio: plan it, fund it, execute it, spend it, and report it in the same place.

**Objectives.**

- O1. Keep the five-year strategic plan, its initiatives, and their budget envelopes in one system.
- O2. Make the annual plan a first-class object: annual programs tied to initiatives, plus recurring operations, each with its own budget.
- O3. Allocate budget top-down with visible remaining balances at initiative, program, and project level.
- O4. Record the full funding and procurement trail per project: allocated budget, approved budget (ijin prinsip), submitted price, final deal price.
- O5. Track contracts, fiscal-year commitments, and actual spending as distinct figures, with explicit settlement between commitments and spend.
- O6. Record capex and opex spending against projects and recurring operations.
- O7. Handle multi-year projects and explicit, auditable carry-over between fiscal years.
- O8. Report budget versus actual and commitment versus contract at every level, for the whole five-year horizon.
- O9. Keep every change attributable, with an audit trail and no hard deletion.

## 4. Scope

### In scope (v1)

- Strategic plan, strategic initiatives, and five-year budget envelopes.
- Annual plans per calendar year with draft, active, and closed states.
- Annual programs: linked to exactly one initiative, with capex and opex budgets, carry-in, and continuation links (program thread).
- Multi-year projects with a full-life financial record and one allocation slice per active fiscal year.
- Recurring operations: annual, opex-only budget items with actual spending and optional commitment entries.
- Top-down budget allocation with remaining and unallocated balances.
- Ijin prinsip metadata (document number, date, approved amount, approver, document link).
- Project pricing chain: allocated budget, approved budget, submitted price, final deal price.
- Fiscal-year commitments, commitment settlement (including cross-year settlement), and contract value per project.
- Spend entry form for projects (capex or opex) and recurring operations (opex), with administrator-managed spend categories.
- Explicit carry-over at project and program level, with year close.
- Opening balances for data that predates the app. The first in-app fiscal year is FY2027; FY2026 is closed manually outside the app.
- Budget-versus-actual, commitment-versus-contract, and capex/opex reporting across the portfolio.
- CSV/XLSX exports and print-friendly report views.
- Shared team access with a complete audit trail; every user is an administrator.

### Out of scope (v1)

- In-app approval workflows. Ijin prinsip approval happens outside the app; the app records the outcome.
- Procurement, tender, or RFP management.
- Integration with ERP, finance, or procurement systems.
- Multi-currency and FX handling.
- Notifications and alerts (over-budget conditions are shown as in-app flags only).
- Mobile apps.
- Timesheets, asset or CMDB management.
- Vendor master data beyond the amounts quoted for a project.
- Per-vendor quote records; versioned contract values (latest value plus audit trail is used).
- File attachments and uploads; documents are referenced by document number and link.
- CSV import; opening balances and plan data are entered manually in v1.
- Bespoke PDF report layouts (print-friendly views produce PDF through the browser).
- Authentication through external identity providers (local accounts in v1).
- Read-only, editor, or viewer roles (every account is an administrator in v1).
- Technology stack, hosting, authentication implementation, and deployment topology (recorded in ADRs).

## 5. Stakeholders and roles

| Stakeholder | Interest | Interaction with Strapla |
| --- | --- | --- |
| Portfolio owner (author) | Runs the IT portfolio, owns the plan and budgets | Owns the data, defines the plan, allocates budget, reviews reports, administers accounts |
| IT team | Plans and executes projects, records spending | Accounts with full administrator capability: create and edit plans, projects, spend entries |
| Directors | Approve capex/opex in the ijin prinsip | Receive exports and print views; approval happens outside the app; no accounts |
| Finance | Consolidates and audits IT spending | Receives budget-versus-actual and capex/opex exports; no accounts |

**Access model (v1).** Every team member has an account and **every account is an administrator**: there is no editor or read-only role in v1. Administrators manage members (create, deactivate, reset credentials), revise budgets while a fiscal year is open, and perform audited corrections on closed years. Every financial change is audited. There is no approval workflow inside the app.

- Accounts are created by an administrator; no self-service signup.
- Accounts are deactivated, never deleted, so audit references remain valid.
- Directors and finance do not log in during v1; they receive CSV/XLSX exports and print views.
- There is no reopen of a closed year, no rollback, and no version restore: the audit trail provides traceability, the void status provides cancellation.

## 6. Domain model and business rules

### 6.1 Entities

| ID | Entity | Description |
| --- | --- | --- |
| E1 | Strategic Plan | One active five-year plan (for example 2026 to 2030). Horizon is configurable. |
| E2 | Strategic Initiative (SI) | A multi-year initiative within the plan, with a five-year budget envelope. |
| E3 | Annual Plan | One per fiscal year within the plan horizon. Status: draft, active, or closed. |
| E4 | Annual Program | Belongs to one annual plan and exactly one SI. Has a capex budget, an opex budget, and carry-in per component. May continue a prior year's program through a continuation link. |
| E5 | Project | Multi-year; derived from an originating program. Holds the full-life financial record and the opening figures for data that predates the app. |
| E6 | Project Year Allocation | The annual slice of a multi-year project: linked to one annual plan and one annual program, with that year's allocation, carry-in, commitments, and spend. |
| E7 | Recurring Ops Item | Annual opex-only budget item (leased lines, existing maintenance, subscriptions). No project, no SI link. May carry commitment entries. |
| E8 | Spend Entry | Actual spending. Attached to a project year allocation (capex or opex) or to a recurring ops item (opex). May settle commitment entries, including prior-year commitments. |
| E9 | Ijin Prinsip Record | Directors' in-principle approval: document number, date, approved amount, approver, and document link. Attached to a project; exactly one active record per project. |
| E10 | Commitment Entry | A commitment recorded against a project year allocation or a recurring ops item (for example a purchase order or contract milestone). Has an open → partially settled → settled lifecycle driven by settlements. |
| E11 | Commitment Settlement | The link between a spend entry and a commitment entry it pays, with the settled amount. Settlements may cross fiscal years. |
| E12 | Audit Entry | Append-only record of a change: actor, action, entity, before and after values, reason, timestamp. |
| E13 | Spend Category | Administrator-managed category referenced by spend entries (for example hardware, software, services). |
| E14 | Opening Balance | Pre-app figures loaded at go-live: prior program budget consumed per SI, prior allocated/committed/spent per project, and carry-in per program and allocation. |

### 6.2 Money and time conventions

- Currency: Indonesian Rupiah (IDR), single currency, whole Rupiah, stored as integers. No floating-point arithmetic and no rounding in storage; display may round.
- Fiscal year: calendar year, January to December.
- Plan horizon: five years by default, configurable at plan creation.
- Timestamps are stored in UTC and displayed in Asia/Jakarta. Business dates display as DD/MM/YYYY; amounts display as `Rp 1.234.567`.
- The interface is in English, retaining the organisation's Indonesian domain terms (ijin prinsip, Rupiah).
- Every monetary figure is held per component (capex and opex); combined totals are always derived and displayed alongside.

### 6.3 Funding chain

The funding chain is top-down:

```
Plan
└── SI (five-year envelope)
    └── Annual Plan (one per fiscal year)
        └── Annual Program (linked to the SI, capex + opex budget, carry-in)
            └── Project Year Allocation (annual slice of a project)
                ├── Commitment Entries (open until settled)
                │   └── Settlement (against spend entries)
                └── Spend Entries (capex or opex)
```

Recurring operations sit beside the programs, not under an SI:

```
Annual Plan
└── Recurring Ops Item (opex only, annual budget, carry-in)
    ├── Commitment Entries (optional)
    └── Spend Entries (opex)
```

### 6.4 Multi-year projects and program continuation

A project can run for more than one fiscal year. It is created once and must not be duplicated year over year.

- The project has a start fiscal year and an end fiscal year.
- In every fiscal year in which it is active, the project appears as exactly one **Project Year Allocation**, attached to that year's annual plan and to that year's program for the same SI.
- Each allocation carries only that year's money. The annual plan therefore never counts a project more than once.
- A program that continues into the next year is a **new annual program**, linked to the previous year's program through a program continuation link. The chain of linked programs is the **program thread**.
- An SI can have several programs in the same year. A program maps to exactly one SI.
- The first in-app fiscal year is **FY2027**. Projects and programs that started earlier carry their pre-app figures as opening balances (§6.9); pre-app records are not reconstructed inside the app.

### 6.5 Contract, fiscal-year commitment, spend, and settlement

A multi-year contract has a total value, but the commitment booked in any one fiscal year is only that year's portion. The app tracks distinct figures and never conflates them:

| Figure | Level | Meaning |
| --- | --- | --- |
| Contract value (final deal price) | Project, whole life | The total contracted amount for the project. The ceiling for the project's life. |
| Commitment entry | Project year allocation or recurring ops item | A purchase order or contract milestone; open until settled. |
| Fiscal-year commitment | Project year allocation | The sum of that allocation's commitment entries (or a recurring ops item's entries). |
| Settlement | Spend entry ↔ commitment entry | The amount of a commitment paid by a spend entry; partial settlement allowed. |
| Open commitment | Project year allocation or recurring ops item | Commitment amount minus settled amount. |
| Actual spend | Project year allocation or recurring ops item | Spend entries recorded in that fiscal year. |
| Remaining | Project year allocation | `allocation + carry-in − open commitments − current-year spend`, per component. |

Rules:

- The sum of a project's lifetime commitments (opening committed plus in-app commitment amounts) may not exceed the contract value. Exceeding it is flagged.
- Actual spend cannot silently exceed the fiscal-year commitment. Exceeding it warns and is allowed, because invoices can arrive before commitments are updated. Cross-year settlements of prior-year commitments are excluded from this comparison.
- A payment that settles a same-year commitment changes open commitments and current-year spend by the same amount and therefore does not change remaining: the money was already committed.
- A **cross-year settlement** — a spend entry paying a commitment of an earlier fiscal year — is counted in the project's actual spend and cash reporting but does not reduce the current year's allocation, remaining, or commitment check. It is reported on its own line.
- Spend entries that pay commitments existing before the app are recorded with `settlement_kind = prior_year_opening` and follow the same rule.
- The project view shows contract value, committed to date, spent to date, and open commitments side by side.

### 6.6 Spending, capex/opex, and recurring operations

- Every spend entry belongs to exactly one of: a project year allocation (tagged capex or opex), or a recurring ops item (always opex).
- A spend entry records: date, amount, spend category, vendor, invoice or reference number, and description. It may settle one or more commitment entries.
- The spend category comes from an administrator-managed list.
- Actual spend is the realized record of money spent (for example when an invoice is booked). The app does not track payment status or payment dates in v1.
- **Programs** carry both a capex budget and an opex budget. **Projects** inherit the split through their spend entries and year allocations.
- **Recurring operations** are opex only, are not linked to an SI, and cover running costs such as existing leased lines and existing maintenance contracts. They may carry commitment entries; their annual budget is the ceiling and they have no contract value.
- All budgets, allocations, commitments, and reports show capex and opex separately, and also show the combined total.

### 6.7 Remaining budget, year close, and carry-over

- **Remaining budget** for a project year allocation is:

  `remaining = allocation + carry-in − open commitments − current-year spend`

  computed separately for capex and opex. Current-year spend excludes cross-year settlements of prior-year commitments.
- **Program availability** is `budget + carry-in`; **unallocated program budget** is `budget + carry-in − allocations`, per component. Unallocated program budget is always visible.
- **Carry-over is explicit.** At year close the user decides how much of the remaining balance to carry into the next fiscal year, records an approval reference, and the amount appears as `carry-in` on next year's program or allocation. Both components may be carried; the decision is made per component.
- **Project-level carry-over:** the remaining slice of a project carries into that project's next-year allocation.
- **Program-level carry-over:** unallocated program budget (budget not yet allocated to projects) carries into the continuation program in the next year.
- **Open commitments are not carry-over.** Committed but unpaid amounts remain commitments; they are not re-labelled as carried budget.
- **Year close is manual.** Closing a fiscal year locks its records, snapshots the carry-over figures, and prevents edits except audited administrator corrections. Settlement lifecycle events may still occur after close and are audited.
- **Final close at the plan boundary.** Closing the annual plan in the strategic plan's end year needs no next-year annual plan: every available amount is recorded as not carried with a reason and no carry-over entry is written, while the snapshot invariants (`available = carried + not carried`; `carried` = ledger sum) still hold. Every other year keeps the ordinary close and its next-year target.
- **No carry across a plan boundary.** Budget, carry-in and carry-over never cross from one strategic plan to its successor. A plan is archived only after every annual plan under it is closed, a successor's horizon starts after every archived plan's end year, a project must end inside its plan (continuing work is a new project under the successor), and opening balances are recorded once for the first plan.
- The first in-app year close is **FY2027** (executed January 2028). FY2026 was closed manually before go-live; its carry-in is part of the opening balances.
- There is no reopen of a closed year, no rollback, and no version restore.

### 6.8 Business rules

| ID | Rule |
| --- | --- |
| BR-1 | Only one strategic plan is active at a time; a plan is archived before its successor is created, and horizons never overlap. Annual plans can only exist inside the plan horizon. |
| BR-2 | An SI has one five-year envelope. Prior program budget consumed plus cumulative program budgets across all years may not exceed it; exceeding is flagged. Envelope revisions are audited. |
| BR-3 | There is exactly one annual plan per fiscal year, with statuses draft, active, and closed. |
| BR-4 | An annual program belongs to exactly one annual plan and exactly one SI. It has a capex budget, an opex budget, and carry-in per component. |
| BR-5 | A project belongs to an originating program, may span multiple fiscal years, and holds the full-life financial record: allocated budget, approved budget, submitted price, final deal price. It is created once and never duplicated year over year. |
| BR-6 | An active project has exactly one project year allocation per active fiscal year, linked to that year's annual plan and to that year's program for the same SI. |
| BR-7 | The sum of allocations inside a program may not exceed its budget plus carry-in, per component. Unallocated program budget is always visible. Exceeding is flagged. |
| BR-8 | Fiscal-year commitments are the sum of commitment entries for that allocation. Lifetime commitments (opening committed plus in-app commitment amounts) may not exceed the contract value; exceeding is flagged. |
| BR-9 | Approved budget comes from the ijin prinsip. If the final deal price exceeds the approved budget, the app warns, flags the project as over approved budget, and still allows saving. |
| BR-10 | A spend entry belongs to exactly one of: a project year allocation (capex or opex) or a recurring ops item (opex). It may settle commitment entries; the sum of settlements in one spend entry may not exceed the spend amount. |
| BR-11 | Current-year actual spend above the fiscal-year commitment warns but is allowed. Cross-year settlements of prior-year commitments are excluded from the comparison. |
| BR-12 | Recurring ops items are opex only, are not linked to an SI, and have no projects. They may carry commitment entries; the annual budget is the ceiling. |
| BR-13 | Carry-over is explicit, per component, and requires an approval reference. It is recorded at year close. |
| BR-14 | Financial records are never hard-deleted. Cancellation uses a void status with a reason and stays audited. |
| BR-15 | Every financial record stores creator, last editor, and timestamps; every change creates an audit entry. |
| BR-16 | Capex and opex are separated in every budget, allocation, commitment, and report, while combined totals remain visible. |
| BR-17 | Over-budget conditions are flagged and shown in reports; they do not block data entry. |
| BR-18 | Submitting a price is recorded as the highest vendor quote for the project. The final deal price is the negotiated contract value and is normally at or below the submitted price; exceeding the submitted price is flagged. |
| BR-19 | A commitment entry has an open → partially settled → settled lifecycle driven by settlements. Settlements may cross fiscal years and may occur after year close; they are always audited. |
| BR-20 | Opening balances are recorded once at go-live, audited like any financial change. Pre-app records are not reconstructed inside the app. |
| BR-21 | Every user is an administrator. Membership is managed by administrators; there is no self-service signup. |
| BR-22 | Spend categories come from an administrator-managed list. |
| BR-23 | Remaining is per component: allocation + carry-in − open commitments − current-year spend. Cross-year settlements do not reduce current-year remaining. |
| BR-24 | There is no hard delete, no rollback, no version restore, and no reopen of a closed year. |

### 6.9 Opening balances

The app starts with FY2027; FY2026 and earlier are closed outside the app. Opening balances are the signed-off bridge and are entered manually during UAT by the portfolio owner:

| Where | Figures |
| --- | --- |
| Strategic initiative | Prior program budget consumed (for the SI envelope check) |
| Annual program, FY2027 | Carry-in capex and opex (from the manual FY2026 close) |
| Project year allocation, FY2027 | Carry-in capex and opex |
| Project | Prior allocated budget, prior open commitments, prior actual spend |

Lifetime commitment checks use opening committed plus in-app commitments. Spend entries that pay pre-app commitments are recorded as prior-year opening settlements and reported separately. Opening balance edits are audited; they are expected only at go-live and during the opening reconciliation.

## 7. Key workflows

**W-0 Load opening balances.** Before FY2027 becomes active, load the opening figures per §6.9 from the FY2026 spreadsheets and the manual year close.

**W-1 Define the plan.** Create the five-year strategic plan, then its SIs with owners, objectives, and budget envelopes.

**W-2 Build the annual plan.** Create the annual plan for a fiscal year, add annual programs (each linked to an SI with capex and opex budgets and carry-in), and add recurring ops items with opex budgets.

**W-3 Create or continue a project.** Create a project under a program, enter its start and end fiscal years, and record its full-life figures: allocated budget, ijin prinsip approval and approved budget, submitted price (highest vendor quote), and final deal price when known. For a continuing project, add its next-year allocation rather than creating a duplicate.

**W-4 Allocate budget.** Allocate program budget to project year allocations for the relevant fiscal year, check the remaining and unallocated balances, and keep cumulative allocations within the SI envelope.

**W-5 Record commitments.** Add commitment entries against a project year allocation or recurring ops item (purchase order, contract milestone). Record settlements when spend pays a commitment; partial settlement is allowed, and a settlement may cross fiscal years. The contract value stays separate on the project.

**W-6 Record spending.** Open the spend form, choose a project year allocation or recurring ops item, enter date, amount, category (capex or opex), spend category, vendor, invoice reference, and description. Optionally settle open commitments; payments of pre-app commitments are flagged as prior-year opening settlements.

**W-7 Close the year and carry over.** Review remaining budget per allocation and program availability, record carry-over amounts with an approval reference, and close the fiscal year. The first in-app close is FY2027.

**W-8 Monitor and report.** Review budget versus actual and commitment versus contract by SI, year, program, project, capex, and opex across the five-year horizon. Export CSV/XLSX or print for directors and finance.

## 8. Success criteria

| ID | Success criterion |
| --- | --- |
| SC-1 | A complete five-year plan with SIs and envelopes can be created and maintained without spreadsheets. |
| SC-2 | An annual plan can be created with programs mapped to SIs plus recurring ops items, each with capex and opex budgets. |
| SC-3 | A multi-year project appears in each active fiscal year with its own allocation, fiscal-year commitment, and actuals, while its contract value stays separate. |
| SC-4 | Every spend entry traces back to project or recurring ops, program, SI, and annual plan, including through settlements. |
| SC-5 | The SI view shows envelope, cumulative allocation, commitments, and actual spend across the five-year horizon. |
| SC-6 | Over-budget conditions are flagged: final deal price above approved budget, final deal price above submitted price, lifetime commitments above contract value, spend above fiscal-year commitment, allocation above program budget, and cumulative allocation above the SI envelope. |
| SC-7 | Carry-over from a closed year is recorded with an approval reference and appears as carry-in in the next year. |
| SC-8 | Capex and opex are reported separately at program, project, SI, and portfolio level. |
| SC-9 | A team member can record a spend entry in under one minute, and every change is attributable in the audit trail. |
| SC-10 | Finance and directors can receive the plan, project register, and budget-versus-actual reports as CSV/XLSX exports and print views. |
| SC-11 | Every change is attributable (actor, time, before/after, reason) and nothing is hard-deleted. |
| SC-12 | The FY2027 plan can be built in the app from opening balances through allocations without spreadsheets. |

## 9. MVP milestones

| Milestone | Deliverable | Target |
| --- | --- | --- |
| M0 Skeleton | Repo conventions, merged planning artifacts, CI, Docker images, PostgreSQL 18, authentication and sessions, audit plumbing, health check. | 30 Oct 2026 |
| M1 Plan | Strategic plan, SIs, annual plans, programs, projects, recurring ops items, opening balances, and plan-data entry. | 13 Nov 2026 |
| M2 Funding | Top-down allocation, ijin prinsip record, submitted price and final deal price, balances, over-budget flags. | 27 Nov 2026 |
| M2.5 Insight core | Report set, CSV/XLSX exports, print views, audit trail and administrator accounts; December release acceptance. | 18 Dec 2026 |
| M3 Execution | Spend entries (capex and opex), commitment entries, settlement (including cross-year), recurring ops actuals. | January 2027 |
| M4 Multi-year | Project year allocations continued, program continuation, year close and auditable carry-over. | Before the FY2027 close, January 2028 |
| M5 Insight | Dashboards, audit search, and reporting polish. | Through 2027 |

Milestone order is deliberate: the funding model comes before execution, and multi-year mechanics come after the single-year flow works, because carry-over is the riskiest part of the model. The **first usable release** is M1 + M2 + core insight in December 2026, in time for the FY2027 annual plan; FY2026 is closed manually outside the app.

## 10. Risks and mitigations

| ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Multi-year and carry-over rules are complex and easy to get wrong | High: incorrect budget figures | Rules are explicit and implemented as pure, property-tested domain functions; M4 is built after the single-year flow is stable and validated against the manual FY2026 close. |
| R2 | Existing spreadsheets hold inconsistent or incomplete data | Medium: poor reports at launch | Manual entry for v1, validation rules on entry, opening balances are a signed-off one-time load; CSV import in a later phase. |
| R3 | Team adoption | Medium: system becomes stale | Simple forms, one source of truth, quick entry, reports that remove manual consolidation. |
| R4 | Financial data is sensitive | High: confidentiality | The source repository is public (owner decision 2026-11-20) and contains no real data: sample fixtures are fictitious and the real FY2026 workbook stays off-repo. Production data is protected by account-based access, session security, the audit trail and nightly backups; hosting is decided before real data enters the app. |
| R5 | Scope creep toward a full ERP/procurement suite | High: never ships | Explicit non-goals in section 4; milestone gate before each expansion. |
| R6 | Governance expectations from directors and finance | Medium: reports not trusted | Audit trail, approval references, no hard deletes, clear capex/opex separation, exports. |
| R7 | Capex and opex carry-over policies may differ across the organisation | Medium: wrong carry-over | Carry-over is per component and uses an approval reference, so policy can differ by component. |
| R8 | Cross-year settlement misunderstood or double-counted | High: wrong remaining and budget-versus-actual | ADR-0003, pure domain tests, an explicit "settlements of prior-year commitments" report line, and one real annual cycle of validation. |
| R9 | Go-live blocked by an undecided production host | Medium: December release late | Docker images and Compose from day one; host decision by mid-November 2026; temporary tunnel as a fallback. |
| R10 | Manually loaded opening balances are wrong | Medium: reports wrong from day one | Entry by the portfolio owner during UAT, audit trail, and an opening-balance reconciliation report compared against the spreadsheets. |

## 11. Assumptions and open questions

### Assumptions

- A1. One active five-year plan at a time; a successor plan continues the portfolio after the archived plan, with a horizon that starts after the archived plan's end year. The horizon is configurable.
- A2. An SI envelope is a total, not pre-split by year.
- A3. Recurring operations have no SI link and are opex only.
- A4. Ijin prinsip approval happens outside the app; the app stores its metadata and approved amount.
- A5. Submitted price is the highest vendor quote; per-vendor quote records are deferred.
- A6. Every team member is an administrator; an administrator manages members; there is no in-app approval workflow in v1.
- A7. Year close is manual and carry-over requires an approval reference. The first in-app close is FY2027; FY2026 is closed manually.
- A8. Contract amendments are handled by correcting the final deal price with an audit trail.
- A9. Technology stack, hosting, authentication implementation, and deployment topology are decided in ADRs.
- A10. The app is internal to the organisation; public access is out of scope.
- A11. Authentication uses local email and password accounts; external identity providers are deferred.
- A12. All money is whole Rupiah, stored as integers, with no rounding in storage.
- A13. Plan data and opening balances are entered manually in v1; CSV import is deferred.
- A14. Documents are referenced by document number and link; file uploads are deferred.
- A15. "Actual spend" is the realized record (for example when an invoice is booked); payment tracking is out of scope.
- A16. The first in-app fiscal year is FY2027 and the opening balances are the signed-off bridge to the spreadsheets.

### Open questions resolved in v0.2

| ID | Question | Resolution |
| --- | --- | --- |
| Q1 | Does opex carry over at all, or only capex? | Both components may carry; decided explicitly per component at close with an approval reference. |
| Q2 | Does the ijin prinsip approve a total project value, or per-fiscal-year amounts? | One full-life approved amount per project (one active record). |
| Q3 | Store each vendor quote, or only the highest submitted price? | Highest submitted price only. |
| Q4 | Mid-year budget revisions: who may change, and do they need approval references? | Any administrator while the year is open; mandatory reason and audit; closed years allow audited administrator corrections. No approval reference. |
| Q5 | Version each contract value, or latest value plus audit trail? | Latest value plus audit trail. |
| Q6 | Multiple commitment entries per allocation? | Yes. |
| Q7 | Should recurring ops items carry commitments? | Yes, kept minimal: the annual budget is the ceiling and there is no contract value. |
| Q8 | Are Excel or PDF exports required? | CSV/XLSX exports plus print-friendly HTML views (browser PDF). No bespoke PDF layouts. |
| Q9 | Who administers accounts and access? | Administrators; every user is an administrator; membership is admin-managed. |
| Q10 | Data-retention or access-review requirements? | Records and audit retained permanently; no automatic purge; no formal access review in v1. |
| Q11 | Should SIs have annual allocation targets? | No; the envelope is a total. |
| Q12 | Are threshold notifications needed? | No; over-budget conditions are in-app flags and report badges only. |

### Deferred decisions

- Production host, domain, TLS, and SSH ownership (Docker images and Compose are prepared now).
- External identity provider / SSO.
- CSV import for plan data and opening balances.
- Notifications and alerts.
- Per-vendor quote records and versioned contract values.
- Bespoke PDF layouts.
- Dashboard and audit-search specifics in M5.
- Recurring-ops contract value and ceiling modelling beyond the annual budget.

## 12. Glossary

The canonical vocabulary is [`GLOSSARY.md`](../GLOSSARY.md). Core terms used in this charter:

| Term | Definition |
| --- | --- |
| Strategic Plan | The five-year IT strategic plan. Holds strategic initiatives. |
| Strategic Initiative (SI) | A multi-year initiative within the plan, with a five-year budget envelope. |
| Annual Plan | The plan for one fiscal year. Contains annual programs and recurring ops items. |
| Annual Program | A yearly delivery programme, tied to exactly one SI, with capex and opex budgets. Contains project year allocations. |
| Program thread | The chain of annual programs linked across years through continuation links. |
| Project | A multi-year delivery unit derived from a program. Holds the full-life funding and procurement record. |
| Project Year Allocation | The slice of a multi-year project in one fiscal year: allocation, carry-in, commitments, and actuals. |
| Allocated budget | The amount assigned to a project (full life) or to its annual slice, from the program budget. |
| Approved budget | The amount approved by the directors in the ijin prinsip. |
| Ijin prinsip | The directors' in-principle approval document authorising a project's budget. |
| Submitted price | The highest vendor price submitted for the project. |
| Final deal price | The negotiated contract value of the project. |
| Contract value | The total contracted amount for the project's whole life; the ceiling for commitments. |
| Commitment entry | A single commitment record, such as a purchase order or contract milestone. Open until settled. |
| Settlement | The amount of a commitment paid by a spend entry; partial settlement is allowed and may cross fiscal years. |
| Fiscal-year commitment | The amount committed in one fiscal year for a project, from commitment entries. |
| Actual spend | Spend entries recorded against a project year allocation or recurring ops item. |
| Capex | Capital expenditure: spending that creates or improves an asset. |
| Opex | Operational expenditure: ongoing running cost. |
| Recurring ops | Annual opex-only budget items for running services, not tied to an SI. |
| Carry-over | Budget remaining at year close that is explicitly moved into the next fiscal year with approval. |
| Carry-in | The carried amount received by the next fiscal year's program or allocation. |
| Remaining | Allocation plus carry-in minus open commitments minus current-year spend, per component. |
| Opening balance | Pre-app figures loaded at go-live to bridge the spreadsheets into the app. |
| Envelope | The five-year budget ceiling of a strategic initiative. |
| Year close | The manual action that locks a fiscal year and records carry-over. |

## 13. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-10-25 | Initial draft from the discovery discussion. |
| 0.2 | 2026-10-25 | Approved for build after the design grilling: single administrator role (no editor role); commitment settlement lifecycle with cross-year settlement; opening-balance layer with FY2027 as the first in-app year; all twelve open questions resolved; exports, locale, attachments-as-links, notification exclusion, and no-rollback/no-reopen semantics recorded; milestones re-cut for the December 2026 first release. |
