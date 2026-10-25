# M5 Insight — checkpoint evidence (dashboard, audit search, polish)

Captured 2026-10-26 against the dev server with PostgreSQL 18.

| Screenshot | What it shows |
| --- | --- |
| `01-portfolio-dashboard.png` | Portfolio health on one screen: envelope, program budget + carry-in, allocated, open commitments, in-app spend, remaining, fiscal-year commitments and flags; plan-versus-execution table per component; fiscal-year status (FY2027 closed with its approval reference, FY2028 active); program threads; recent audited activity; quick links |
| `02-audit-search.png` | Audit search by free text (actor, entity, action or reason) with action/entity/actor filters and the CSV export action |
| `03-reports-hub.png` | Reports hub reflecting the execution and close data (no more placeholder copy) |

## Browser verification (headless Chromium)

1. Dashboard renders plan-versus-execution totals, both fiscal-year states, the program thread
   `FY2027 PRG-2027-001 → FY2028 PRG-2028-001`, recent audited changes and the quick links.
2. `/admin/audit?q=BOARD-CLOSE` finds the close and carry-over entries (`close`, `carry_over`) with
   their reasons; the **Export CSV** action downloads the filtered trail (20 lines for the test
   filter) with the audit columns.
3. An unauthenticated request to `/admin/audit/export` is refused with 401.
4. The reports hub copy now describes execution, prior-year settlement and prior-year opening lines.

## Acceptance mapping (#23)

- **Portfolio owner can review portfolio health without leaving the app**: envelope → program budget
  → allocations → open commitments → spend → remaining, flags, year status, program threads and
  recent activity all on the dashboard, with quick links into every workflow.
- **Audit queries answer "who changed this and why"**: free-text search across actor/entity/action/
  reason, filters, before/after values in place, and CSV export for directors/finance.

## Full annual cycle in E2E

The Playwright suite now runs the whole cycle on a fresh database: first-run setup → strategic plan
and SIs → annual plan/program → project, ijin prinsip and allocation → commitments, spend and
settlement → all reports and CSV/XLSX downloads → member lifecycle and audit → **create the next
fiscal year and its continuation program → close the year with a carry-over → verify the carry-in on
the continuation program and the program thread**. CI runs it on every merge.
