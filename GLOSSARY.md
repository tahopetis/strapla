# Glossary

The canonical vocabulary for Strapla. Use these terms — and only these terms — in code, issue titles, tests, reports, and UI copy. Where a term is Indonesian, keep the Indonesian spelling (singular and plural identical).

| Term | Definition |
| --- | --- |
| **Strategic Plan** | The five-year IT strategic plan. Holds the strategic initiatives and their budget envelopes. One plan is active at a time. |
| **Strategic Initiative (SI)** | A multi-year initiative within the strategic plan with a five-year budget envelope. Identified by code, name, owner, and objective. |
| **Envelope** | The five-year budget ceiling of a strategic initiative. A total, not pre-split by year. |
| **Annual Plan** | The plan for one fiscal year (calendar year) within the plan horizon. Status: draft, active, or closed. Exactly one per fiscal year. |
| **Annual Program** | A yearly delivery programme belonging to exactly one annual plan and exactly one SI. Has a capex budget and an opex budget, plus carry-in per component. |
| **Program Thread** | The chain of annual programs linked across years through continuation links (prior year's program → next year's program for the same SI). |
| **Project** | A multi-year delivery unit derived from an annual program. Created once and never duplicated year over year; holds the full-life funding and procurement record. |
| **Project Year Allocation** | The slice of a multi-year project in one fiscal year: allocation, carry-in, commitments, and actual spend, per component. Exactly one per active fiscal year. |
| **Allocated Budget** | The amount assigned to a project over its whole life (project-level figure) or to one of its annual slices (allocation). |
| **Approved Budget** | The amount approved by the directors in the ijin prinsip. |
| **Ijin Prinsip** | The directors' in-principle approval authorising a project's budget: document number, date, approved amount, approver, document link. The one record per project, covering the full-life total. |
| **Submitted Price** | The highest vendor price submitted for a project. A single figure; per-vendor quotes are not recorded in v1. |
| **Final Deal Price** | The negotiated contract value of the project. Normally at or below the submitted price. |
| **Contract Value** | The total contracted amount for the project's whole life; the ceiling for commitments. Equivalent to the final deal price. |
| **Commitment Entry** | A single commitment record — purchase order or contract milestone — attached to a project year allocation or a recurring ops item, with component and amount. |
| **Fiscal-Year Commitment** | The total of a project year allocation's commitment entries in that fiscal year, or a recurring ops item's commitment entries. |
| **Open Commitment** | A commitment entry's amount that has not yet been settled by spend. `open = amount − settled amount`. |
| **Settlement** | The link between a spend entry and a commitment entry it pays, carrying the settled amount. Partial settlement is allowed; over-settlement is not. |
| **Cross-Year Settlement** | A settlement of a commitment belonging to an earlier fiscal year. It is reported separately and does not consume the current year's allocation. |
| **Prior-Year Opening Settlement** | A spend entry that pays a commitment existing before the app's first in-app fiscal year (FY2027). Recorded with `settlement_kind = prior_year_opening`; excluded from current-year remaining; counted in cash actuals. |
| **Actual Spend** | Spend entries recorded against a project year allocation or a recurring ops item. The realized record of money spent; the app does not track payment status. |
| **Capex** | Capital expenditure: spending that creates or improves an asset. |
| **Opex** | Operational expenditure: ongoing running cost. |
| **Component** | One of the two budget components, capex or opex. Every budget, allocation, commitment, spend entry, and report is per component, and also shown combined. |
| **Recurring Ops Item** | An annual opex-only budget item (leased lines, existing maintenance, subscriptions), not linked to an SI, with no projects. May carry commitment entries; its budget is the ceiling. |
| **Spend Category** | An administrator-managed classification of spend (hardware, software, services, …), referenced by spend entries. |
| **Remaining** | Per component: `allocation + carry-in − open commitments − current-year spend`. Cross-year settlements do not reduce current-year remaining. |
| **Unallocated Budget** | Program money not yet allocated to project year allocations: `budget + carry-in − allocations`, per component. Always visible. |
| **Carry-Over** | Budget remaining at year close that is explicitly moved into the next fiscal year with an approval reference, per component. Applies at project level and program level. |
| **Carry-In** | The carried amount received by the next fiscal year's program or allocation, per component. |
| **Year Close** | The manual action that locks a fiscal year's records, snapshots its carry-over figures, and records carry-over with approval references. The first in-app close is FY2027 (January 2028); FY2026 is closed manually outside the app. |
| **Opening Balance** | Pre-app figures loaded once at go-live: prior program budget consumed per SI, prior allocated/committed/spent per project, carry-in per program and allocation. Pre-app records are not reconstructed in the app. |
| **Void** | A status on a financial record that cancels it without deleting it. Always has a reason and an audit entry. Records are never hard-deleted. |
| **Audit Entry** | An append-only record of a change: actor, action, entity, before and after values, reason (where required), and timestamp. |
| **Custom Field** | An optional typed field (text, number or date) that an administrator defines on one plan-record entity — strategic initiative, annual program, project, recurring ops item, ijin prinsip record, project year allocation, commitment entry or spend entry. Values are stored beside the record, shown on forms, record pages, reports and exports, and never enter money rules, remaining, flags, allocations or existing report totals. Each definition carries a stable machine key, may carry an example value (a display hint used in the administration row and the opening-import template; it is never stored on a record), and takes a position in the administrator-controlled field order. Removing a field archives it — its recorded values stay stored but are hidden — and an administrator can restore it with a reason (required for the audit trail) unless an active field on that record type already uses the same name or key. |
| **Administrator** | The only role in v1. Every account is an administrator: manages members, edits while a fiscal year is open, and performs audited corrections on closed years. |
| **Flag** | A computed warning shown in the UI and reports (over approved budget, over submitted price, commitments over contract value, spend over fiscal-year commitment, allocations over program budget, cumulative allocation over SI envelope). Flags never block data entry. |
