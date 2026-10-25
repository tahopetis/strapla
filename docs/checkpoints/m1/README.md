# M1 Plan — checkpoint evidence

Captured 2026-10-25/26 against the dev server with PostgreSQL 18.

| Screenshot | What it shows |
| --- | --- |
| `01-strategic-plan.png` | Active 2026–2030 plan, add-initiative form, two initiatives with envelope, prior consumed, in-app program budgets and headroom (BR-2) |
| `02-plan-overview.png` | Plan overview: SI count, envelope totals (consumed vs remaining), roadmap |
| `03-annual-plan-2027.png` | FY2027 annual plan after activation: program creation form and `PRG-2027-001` with capex/opex availability |
| `04-si-envelope-after-programs.png` | SI-01 headroom after the program budget: in-app program budgets Rp 1,500,000,000, headroom Rp 2,750,000,000 |
| `05-continuation-program.png` | FY2028 program continuing `PRG-2027-001` (program thread), with its own budgets and availability |
| `06-annual-plans-list.png` | Annual plans list showing FY2027 and FY2028 with status and program counts |
| `07-projects-register.png` | Project register after creating `PRJ-2027-001` (auto code) under `PRG-2027-001` |
| `08-project-over-approved.png` | Project detail with the full-life pricing chain and the BR-9 flag (final deal price above the ijin prinsip approved amount) |
| `09-recurring-ops.png` | FY2027 annual plan with the recurring ops section and `Leased lines 2027` (managed category, opex budget, availability) |
| `10-annual-plans-counts.png` | Annual plans list showing program and recurring ops counts per fiscal year |

## Browser verification (headless Chromium)

Strategic plan slice (#5):

1. Sign in as the first-run administrator
2. Empty `/plan` state → create the strategic plan → activate it with a reason
3. Add `SI-01 Digital Workplace` (envelope Rp 5,000,000,000; prior consumed Rp 750,000,000) and
   `SI-02 Core Systems Resilience` (envelope Rp 3,500,000,000; prior consumed Rp 400,000,000)
4. Duplicate SI code rejected with a friendly flash; invalid amount (`12,5`) rejected by Zod

Annual plans and programs slice (#6, #7):

5. Create the FY2027 annual plan (draft) and activate it with a reason
6. Add `PRG-2027-001` under SI-01 with capex Rp 1,200,000,000 and opex Rp 300,000,000
7. Duplicate program code in the same year rejected with a friendly message
8. SI-01 headroom drops by exactly the program budget (envelope check reads program budgets)
9. Create the FY2028 annual plan, activate it, and add `PRG-2028-001` continuing `PRG-2027-001` —
   the continuation link renders and is validated as the same SI from an earlier fiscal year

Projects and recurring ops slice (#8, #9):

10. Create a project under `PRG-2027-001` leaving the code empty — `PRJ-2027-001` is generated
11. Record the ijin prinsip: document `IP-2027-017`, approved Rp 800,000,000 against a final deal
    price of Rp 900,000,000 → the BR-9 "over approved budget" flag appears
12. Raise the approved amount to Rp 1,000,000,000 with a required reason → the flag clears
13. A project outside the plan horizon (start FY2032) is rejected with a friendly message
14. Add recurring ops `Leased lines 2027` with the managed `Connectivity` category and opex
    budget Rp 240,000,000 → availability shows on the card and the annual plans list counts it

## Audit trail

`create` (plan, initiatives, annual plans, programs, projects, ijin prinsip, recurring ops),
`status_change` (plan and annual plan activation with reasons), `update`/`void` actions all write
`audit_entries` in the same transaction (ADR-0004). Ijin prinsip updates require a reason and store
the before/after amounts.

## Remaining M1 work

Tracked by #10 (opening balances entry and reconciliation) and #11 (E2E happy path and navigation).
