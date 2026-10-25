# M1 Plan — checkpoint (strategic plan & initiatives)

Captured 2026-10-25 against the dev server with PostgreSQL 18.

| Screenshot | What it shows |
| --- | --- |
| `01-strategic-plan.png` | The active 2026–2030 plan, the add-initiative form, two initiatives with envelope, prior consumed, in-app program budgets and headroom (BR-2) |
| `02-plan-overview.png` | The plan overview: SI count, envelope totals (consumed vs remaining) and the module roadmap |

Browser verification (headless Chromium, script not committed because it seeds test data):

1. Sign in as the first-run administrator
2. Empty `/plan` state → create the strategic plan → activate it with a reason
3. Add `SI-01 Digital Workplace` (envelope Rp 5,000,000,000; prior consumed Rp 750,000,000) and
   `SI-02 Core Systems Resilience` (envelope Rp 3,500,000,000; prior consumed Rp 400,000,000)
4. Duplicate SI code is rejected with a friendly flash; an invalid amount ("12,5") is rejected by Zod
5. Audit trail contains `create` (plan), `status_change` (plan) and `create` (initiative) entries with the reasons

Remaining M1 work (tracked by #6–#11): annual plans, annual programs, projects + ijin prinsip,
recurring ops items, opening balances, and the end-to-end happy path.
