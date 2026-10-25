# Strapla Project Charter

## 1. Document control

| Field | Value |
| --- | --- |
| Project | Strapla: IT Portfolio Management |
| Charter version | 0.1 (Draft) |
| Date | 2026-10-25 |
| Owner | Portfolio owner (author) |
| Status | Draft for review |
| Scope of this charter | The project and the product. Technology choices are explicitly out of scope and deferred to architecture decision records (ADRs). |
| Related documents | [`AGENTS.md`](../AGENTS.md), [`docs/agents/domain.md`](agents/domain.md) |

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
- O5. Track contracts and fiscal-year commitments separately from actual spending.
- O6. Record capex and opex spending against projects and recurring operations.
- O7. Handle multi-year projects and explicit, auditable carry-over between fiscal years.
- O8. Report budget versus actual and commitment versus contract at every level, for the whole five-year horizon.

## 4. Scope

### In scope (v1)

- Strategic plan, strategic initiatives, and five-year budget envelopes.
- Annual plans per calendar year with draft, active, and closed states.
- Annual programs: linked to exactly one initiative, with capex and opex budgets.
- Multi-year projects with a full-life financial record and one allocation slice per active fiscal year.
- Recurring operations: annual, opex-only budget items with actual spending.
- Top-down budget allocation with remaining and unallocated balances.
- Ijin prinsip metadata (document number, date, approved amount).
- Project pricing chain: allocated budget, approved budget, submitted price, final deal price.
- Fiscal-year commitments and contract value per project.
- Spend entry form for projects (capex or opex) and recurring operations (opex).
- Explicit carry-over at project and program level, with year close.
- Budget-versus-actual and capex/opex reporting across the portfolio.
- Shared team access with audit trail.

### Out of scope (v1)

- In-app approval workflows. Ijin prinsip approval happens outside the app; the app records the outcome.
- Procurement, tender, or RFP management.
- Integration with ERP, finance, or procurement systems.
- Multi-currency and FX handling.
- Notifications and alerts.
- Mobile apps.
- Timesheets, asset or CMDB management.
- Vendor master data beyond the amounts quoted for a project.
- Technology stack, hosting, authentication provider, and deployment topology (separate ADRs).

## 5. Stakeholders and roles

| Stakeholder | Interest | Interaction with Strapla |
| --- | --- | --- |
| Portfolio owner (author) | Runs the IT portfolio, owns the plan and budgets | Owns the data, defines the plan, allocates budget, reviews reports |
| IT team | Plans and executes projects, records spending | Shared editors: create and edit plans, projects, spend entries |
| Directors | Approve capex/opex in the ijin prinsip | Receive reports; approval happens outside the app |
| Finance | Consolidates and audits IT spending | Receives budget-versus-actual and capex/opex reports |

**Access model (v1).** Each team member has an account. All members are editors; an administrator manages members and performs corrections on closed years. Every financial change is audited. There is no approval workflow inside the app.

## 6. Domain model and business rules

### 6.1 Entities

| ID | Entity | Description |
| --- | --- | --- |
| E1 | Strategic Plan | One active five-year plan (for example 2026 to 2030). Horizon is configurable. |
| E2 | Strategic Initiative (SI) | A multi-year initiative within the plan, with a five-year budget envelope. |
| E3 | Annual Plan | One per fiscal year within the plan horizon. Status: draft, active, or closed. |
| E4 | Annual Program | Belongs to one annual plan and exactly one SI. Has a capex budget and an opex budget. May continue a prior year's program. |
| E5 | Project | Multi-year; derived from a program. Holds the full-life financial record. |
| E6 | Project Year Allocation | The annual slice of a multi-year project: linked to one annual plan and one annual program, with that year's allocation, carry-in, commitment, and capex/opex actuals. |
| E7 | Recurring Ops Item | Annual opex-only budget item (leased lines, existing maintenance, subscriptions). No project, no SI link. |
| E8 | Spend Entry | Actual spending. Attached to a project year allocation (capex or opex) or to a recurring ops item (opex). |
| E9 | Ijin Prinsip Record | Directors' in-principle approval: document number, date, approved amount, approver. Attached to a project. |
| E10 | Commitment Entry | A commitment recorded against a project year allocation (for example a purchase order or contract milestone). The fiscal-year commitment is the sum of its entries. |

### 6.2 Money and time conventions

- Currency: Indonesian Rupiah (IDR), single currency, whole Rupiah.
- Fiscal year: calendar year, January to December.
- Plan horizon: five years by default, configurable at plan creation.
- All amounts are stored once and never recomputed by rounding; display may round, storage does not.

### 6.3 Funding chain

The funding chain is top-down:

```
Plan
└── SI (five-year envelope)
    └── Annual Plan (one per fiscal year)
        └── Annual Program (linked to the SI, capex + opex budget)
            └── Project Year Allocation (annual slice of a project)
                └── Spend Entries (capex or opex)
```

Recurring operations sit beside the programs, not under an SI:

```
Annual Plan
└── Recurring Ops Item (opex only, annual budget)
    └── Spend Entries (opex)
```

### 6.4 Multi-year projects and program continuation

A project can run for more than one fiscal year. It is created once and must not be duplicated year over year.

- The project has a start fiscal year and an end fiscal year.
- In every fiscal year in which it is active, the project appears as exactly one **Project Year Allocation**, attached to that year's annual plan and to that year's program for the same SI.
- Each allocation carries only that year's money. The annual plan therefore never counts a project more than once.
- A program that continues into the next year is a **new annual program**, linked to the previous year's program through a program continuation link. The chain of linked programs is the **program thread**.
- An SI can have several programs in the same year. A program maps to exactly one SI.

### 6.5 Contract versus fiscal-year commitment

A multi-year contract has a total value, but the commitment booked in any one fiscal year is only that year's portion. The app tracks three distinct figures and never conflates them:

| Figure | Level | Meaning |
| --- | --- | --- |
| Contract value (final deal price) | Project, whole life | The total contracted amount for the project. The ceiling for the project's life. |
| Fiscal-year commitment | Project Year Allocation | The amount committed in that fiscal year, derived from commitment entries. |
| Actual spend | Project Year Allocation | Capex and opex spend entries in that fiscal year. |

Rules:

- The sum of a project's fiscal-year commitments may not exceed the contract value. Exceeding it is flagged.
- Actual spend cannot silently exceed the fiscal-year commitment. Exceeding it warns and is allowed, because invoices can arrive before commitments are updated.
- The project view shows contract value, committed to date, and spent to date side by side.

### 6.6 Spending, capex/opex, and recurring operations

- Every spend entry belongs to exactly one of: a project year allocation (tagged capex or opex), or a recurring ops item (always opex).
- A spend entry records: date, amount, category, vendor, invoice or reference number, and description.
- **Programs** carry both a capex budget and an opex budget. **Projects** inherit the split through their spend entries and year allocations.
- **Recurring operations** are opex only and are not linked to an SI. They cover running costs such as existing leased lines and existing maintenance contracts.
- All budgets, allocations, commitments, and reports show capex and opex separately, and also show the combined total.

### 6.7 Carry-over and year close

- **Remaining budget** for a project year allocation is:

  `remaining = allocation + carry-in - fiscal-year commitment - actual spend`

  computed separately for capex and opex.
- **Carry-over is explicit.** At year close the user decides how much of the remaining balance to carry into the next fiscal year, records an approval reference, and the amount appears as `carry-in` on next year's allocation.
- **Project-level carry-over:** the remaining slice of a project carries into that project's next-year allocation.
- **Program-level carry-over:** unallocated program budget (budget not yet allocated to projects) carries into the continuation program in the next year.
- **Open commitments are not carry-over.** Committed but unpaid amounts remain commitments; they are not re-labelled as carried budget.
- **Year close is manual.** Closing a fiscal year locks its records, snapshots the carry-over figures, and prevents edits except by an administrator, whose corrections remain audited.
- Carry-over applies per budget component, so capex and opex can follow different policies.

### 6.8 Business rules

| ID | Rule |
| --- | --- |
| BR-1 | Only one strategic plan is active at a time. Annual plans can only exist inside the plan horizon. |
| BR-2 | An SI has one five-year envelope. Cumulative program allocations across all years may not exceed it. Envelope revisions are audited. |
| BR-3 | There is exactly one annual plan per fiscal year, with statuses draft, active, and closed. |
| BR-4 | An annual program belongs to exactly one annual plan and exactly one SI. It has a capex budget and an opex budget. |
| BR-5 | A project belongs to an originating program, may span multiple fiscal years, and holds the full-life financial record: allocated budget, approved budget, submitted price, final deal price. |
| BR-6 | An active project has exactly one project year allocation per active fiscal year, linked to that year's annual plan and to that year's program for the same SI. |
| BR-7 | The sum of allocations inside a program may not exceed its budget, per component (capex and opex). Unallocated program budget is always visible. |
| BR-8 | Fiscal-year commitments are the sum of commitment entries for that allocation. Their total may not exceed the contract value; exceeding it is flagged. |
| BR-9 | Approved budget comes from the ijin prinsip. If the final deal price exceeds the approved budget, the app warns, flags the project as over approved budget, and still allows saving. |
| BR-10 | A spend entry belongs to exactly one of: a project year allocation (capex or opex) or a recurring ops item (opex). |
| BR-11 | Actual spend above the fiscal-year commitment warns but is allowed. |
| BR-12 | Recurring ops items are opex only, are not linked to an SI, and have no projects. |
| BR-13 | Carry-over is explicit, per component, and requires an approval reference. It is recorded at year close. |
| BR-14 | Financial records are never hard-deleted. Cancellation or correction uses a void status with a reason, and stays audited. |
| BR-15 | Every financial record stores creator, last editor, and timestamps. |
| BR-16 | Capex and opex are separated in every budget, allocation, commitment, and report, while combined totals remain visible. |
| BR-17 | Over-budget conditions are flagged and shown in reports; they do not block data entry. |
| BR-18 | Submitting a price is recorded as the highest vendor quote for the project. The final deal price is the negotiated contract value and is normally at or below the submitted price. |

## 7. Key workflows

**W-1 Define the plan.** Create the five-year strategic plan, then its SIs with owners, objectives, and budget envelopes.

**W-2 Build the annual plan.** Create the annual plan for a fiscal year, add annual programs (each linked to an SI with capex and opex budgets), and add recurring ops items with opex budgets.

**W-3 Create or continue a project.** Create a project under a program, enter its start and end fiscal years, and record its full-life figures: allocated budget, ijin prinsip approval and approved budget, submitted price (highest vendor quote), and final deal price when known. For a continuing project, add its next-year allocation rather than creating a duplicate.

**W-4 Allocate budget.** Allocate program budget to project year allocations for the relevant fiscal year, check the remaining and unallocated balances, and keep cumulative allocations within the SI envelope.

**W-5 Record commitments.** Add commitment entries against a project year allocation (purchase order, contract milestone); the fiscal-year commitment is their sum. The contract value stays separate on the project.

**W-6 Record spending.** Open the spend form, choose a project year allocation or recurring ops item, enter date, amount, category (capex or opex), vendor, invoice reference, and description.

**W-7 Close the year and carry over.** Review remaining budget per allocation and program, record carry-over amounts with an approval reference, and close the fiscal year.

**W-8 Monitor and report.** Review budget versus actual and commitment versus contract by SI, year, program, project, capex, and opex across the five-year horizon.

## 8. Success criteria

| ID | Success criterion |
| --- | --- |
| SC-1 | A complete five-year plan with SIs and envelopes can be created and maintained without spreadsheets. |
| SC-2 | An annual plan can be created with programs mapped to SIs plus recurring ops items, each with capex and opex budgets. |
| SC-3 | A multi-year project appears in each active fiscal year with its own allocation, fiscal-year commitment, and actuals, while its contract value stays separate. |
| SC-4 | Every spend entry traces back to project or recurring ops, program, SI, and annual plan. |
| SC-5 | The SI view shows envelope, cumulative allocation, commitments, and actual spend across the five-year horizon. |
| SC-6 | Over-budget conditions are flagged: final deal price above approved budget, spend above commitment, allocation above program budget, and cumulative allocation above the SI envelope. |
| SC-7 | Carry-over from a closed year is recorded with approval reference and appears as carry-in in the next year. |
| SC-8 | Capex and opex are reported separately at program, project, SI, and portfolio level. |
| SC-9 | A team member can record a spend entry in under one minute, and every change is attributable in the audit trail. |

## 9. MVP milestones

| Milestone | Deliverable |
| --- | --- |
| M1 Plan | Strategic plan, SIs, annual plans, programs, projects, recurring ops items, and budget entry. |
| M2 Funding | Top-down allocation, ijin prinsip record, submitted price and final deal price, over-budget flags. |
| M3 Execution | Spend entries (capex and opex), commitment entries, fiscal-year commitment versus contract, recurring ops actuals. |
| M4 Multi-year | Project year allocations, program continuation, year close, and auditable carry-over. |
| M5 Insight | Dashboards and reports: SI five-year view, budget versus actual, capex/opex split, audit trail, team access. |

Milestone order is deliberate: the funding model comes before execution, and multi-year mechanics come after the single-year flow works, because carry-over is the riskiest part of the model.

## 10. Risks and mitigations

| ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Multi-year and carry-over rules are complex and easy to get wrong | High: incorrect budget figures | Keep the rules explicit (6.4 to 6.7), build them as M4 after the single-year flow is stable, validate with one real annual cycle. |
| R2 | Existing spreadsheets hold inconsistent or incomplete data | Medium: poor reports at launch | Manual entry for v1, validation rules on entry, CSV import in a later phase. |
| R3 | Team adoption | Medium: system becomes stale | Simple forms, one source of truth, quick entry, reports that remove manual consolidation. |
| R4 | Financial data is sensitive | High: confidentiality | Private repository, account-based access, audit trail, hosting decided in a separate ADR. |
| R5 | Scope creep toward a full ERP/procurement suite | High: never ships | Explicit non-goals in section 4; milestone gate before each expansion. |
| R6 | Governance expectations from directors and finance | Medium: reports not trusted | Audit trail, approval references, no hard deletes, clear capex/opex separation. |
| R7 | Capex and opex carry-over policies may differ across the organisation | Medium: wrong carry-over | Carry-over is per component and uses an approval reference, so policy can differ by component. |

## 11. Assumptions and open questions

### Assumptions

- A1. One active five-year plan at a time; the horizon is configurable.
- A2. An SI envelope is a total, not pre-split by year.
- A3. Recurring operations have no SI link and are opex only.
- A4. Ijin prinsip approval happens outside the app; the app stores its metadata and approved amount.
- A5. Submitted price is the highest vendor quote; per-vendor quote records are deferred.
- A6. All team members are editors; an administrator manages members; no in-app approval workflow in v1.
- A7. Year close is manual and carry-over requires an approval reference.
- A8. Contract amendments are handled by correcting the final deal price with an audit trail.
- A9. Technology stack, hosting, authentication, and deployment topology are decided later in ADRs.
- A10. The app is internal to the organisation; public access is out of scope.

### Open questions

- Q1. Does opex carry over at all, or only capex? The model allows either; policy must be confirmed.
- Q2. Does the ijin prinsip approve a total project value, or per-fiscal-year amounts?
- Q3. Should each vendor quote be stored with vendor name and amount, rather than only the highest submitted price?
- Q4. Mid-year budget revisions: who may change an allocation or program budget, and do changes require an approval reference?
- Q5. Contract amendments: should each amended contract value be versioned, or is the latest value plus an audit trail enough?
- Q6. Are multiple commitment entries per project year allocation required in practice? The model assumes yes.
- Q7. Should recurring ops items also carry commitments (for example annual maintenance contracts), or is budget plus actuals enough?
- Q8. Are Excel or PDF exports required for director and finance reviews?
- Q9. Who administers accounts and access?
- Q10. Are there data-retention or access-review requirements for financial records?
- Q11. Should SIs have annual allocation targets in addition to the five-year envelope?
- Q12. Are threshold notifications needed (for example when an allocation approaches its budget)?

## 12. Glossary

| Term | Definition |
| --- | --- |
| Strategic Plan | The five-year IT strategic plan. Holds strategic initiatives. |
| Strategic Initiative (SI) | A multi-year initiative within the plan, with a five-year budget envelope. |
| Annual Plan | The plan for one fiscal year. Contains annual programs and recurring ops items. |
| Annual Program | A yearly delivery programme, tied to exactly one SI, with capex and opex budgets. Contains project year allocations. |
| Program thread | The chain of annual programs linked across years through continuation links. |
| Project | A multi-year delivery unit derived from a program. Holds the full-life funding and procurement record. |
| Project Year Allocation | The slice of a multi-year project in one fiscal year: allocation, carry-in, commitment, actuals. |
| Allocated budget | The amount assigned to a project (full life) or to its annual slice, from the program budget. |
| Approved budget | The amount approved by the directors in the ijin prinsip. |
| Ijin prinsip | The directors' in-principle approval document authorising a project's budget. |
| Submitted price | The highest vendor price submitted for the project. |
| Final deal price | The negotiated contract value of the project. |
| Contract value | The total contracted amount for the project's whole life; the ceiling for commitments. |
| Fiscal-year commitment | The amount committed in one fiscal year for a project, from commitment entries. |
| Commitment entry | A single commitment record, such as a purchase order or contract milestone. |
| Actual spend | Spend entries recorded against a project year allocation or recurring ops item. |
| Capex | Capital expenditure: spending that creates or improves an asset. |
| Opex | Operational expenditure: ongoing running cost. |
| Recurring ops | Annual opex-only budget items for running services, not tied to an SI. |
| Carry-over | Budget remaining at year close that is explicitly moved into the next fiscal year with approval. |
| Carry-in | The carried amount received by the next fiscal year's allocation. |
| Remaining | Allocation plus carry-in minus fiscal-year commitment minus actual spend, per component. |
| Envelope | The five-year budget ceiling of a strategic initiative. |
| Year close | The manual action that locks a fiscal year and records carry-over. |

## 13. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-10-25 | Initial draft from the discovery discussion. |
