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

## Import foundation (W3a) — field list, template, parser

The one-time load is being prepared for a bulk import before the wizard lands. This is the W3
Phase A foundation (**W3a**); the four-step wizard is Phase B (**W3b**) — see the
[UX enhancement proposal](UX-ENHANCEMENT-PROPOSAL.md) **W3**. The foundation in this repository
is deliberately headless: a declared field list, CSV/XLSX template generation, a typed
parser/validator with line-level errors, and a dry-run harness. **There is no UI, no server action
and no database write in this foundation** — the parser returns validated rows or errors and nothing
else. The code lives in `src/lib/opening-import/` so the CSV/XLSX file I/O stays out of the
framework-free `src/domain/` layer.

### The three data sets

The import covers the three opening edit surfaces. The declared field list in
`src/lib/opening-import/field-list.ts` is the single source of truth for both the template and the
parser: it declares each column's header, type, required flag and description.

| Data set | Contains | Opening figures |
| --- | --- | --- |
| `strategic-initiatives` | Code, name, owner, objective, envelope, notes | Prior program budget consumed |
| `annual-programs` | Code, name, SI code, continuation link, capex/opex budgets, notes | Capex carry-in, opex carry-in |
| `projects` | Code, name, originating program, external reference, owner, description, fiscal years, full-life allocated/submitted/final prices, ijin prinsip record | Opening allocated, opening open commitments, opening actual spend |

**Allocation carry-in is not part of `projects`; it is a separate opening figure, not one of these
three data sets.** It is stored per project *per fiscal year* on `project_year_allocations`
(`allocation + carry-in − open commitments − spend`, ADR-0003 §2 and the “Opening balances” table in
`data-model.md`). A project row is one whole-life
record, so folding a per-year figure into it would blur the project-versus-annual-money distinction.
The app already enters allocation carry-in when the annual allocation is created (load order step 6),
and that stays the manual path until the Phase B wizard adds an allocation level. The W3a data sets
therefore stop at the project columns above.

### Owner-added columns

Extra columns live in `src/lib/opening-import/owner-columns.ts`, committed to the repo and
reviewed like configuration (G1–G6 in the
[`UX-ENHANCEMENT-PROPOSAL.md`](UX-ENHANCEMENT-PROPOSAL.md) §13.3 decision log). Each declares
`name`, `label`, `type` (`text`, `number`, `date`), `required`, `description` and `example`;
merging is validated (duplicate names or headers are rejected). Owner-added columns are validated
exactly like app-owned columns, appear in both templates and in the parsed rows, and never
participate in money, remaining or flags. One owner column is committed on `projects`
(`Procurement method`, text, optional) as the working demonstration of the mechanism and for the
import UAT (“one extra typed column proven end to end”); replace or extend it when the owner declares
the real columns for this deployment. Storage of the values per record arrives with the Phase B load
(W9).

### Templates

Generate a template from the declared field list:

```sh
pnpm opening:template strategic-initiatives --closing-fiscal-year 2026 --format csv
pnpm opening:template projects --closing-fiscal-year 2026 --format xlsx --out projects.xlsx
```

Both formats carry the headers, the type rules, an example row and the load reason convention
(`Opening balance — FY<closing year> close / <reference>`). The CSV example row is commented out, and
lines beginning with `#` are ignored by the parser, so a template never imports as data. The XLSX
workbook has an `Instructions` sheet (column table, example row, reason convention) and a `Data`
sheet whose first row is the header.

Type rules enforced by the parser:

- `text` — any text; required columns must not be blank.
- `number` — whole, non-negative number; dots may group thousands (`1.234.567`), `Rp` is tolerated.
- `date` — `YYYY-MM-DD`, or `DD/MM/YYYY` (day first); returned in ISO form. Impossible dates fail.

### Parser and dry run

```sh
pnpm opening:validate annual-programs fixtures/opening-import/annual-programs.sample.csv
```

The dry run prints a result per line and exits `0` when the file is valid, `1` when it is not. It
never writes: validation is pure, so a failed file cannot partially apply. Undeclared columns are
rejected rather than dropped, duplicate and missing required headers fail the file, and every bad
value is reported (all rows, one pass) with its physical line number — spreadsheet row number for
XLSX. A blank optional cell returns `null`; a blank required cell fails the row. Referential checks
(does the SI code exist?) belong to the Phase B load, which resolves and writes the rows; year
ranges and `endFiscalYear >= startFiscalYear` are domain rules applied there too, not by the type
validator. The modules import one another with explicit `.ts` specifiers so the CLI runs directly on
Node 24 type stripping with no build step; `allowImportingTsExtensions` in `tsconfig.json` keeps
TypeScript happy.

### Sample workbooks

`fixtures/opening-import/` holds fictitious sample workbooks used by the unit tests: the three good
CSV samples, an invalid project sample, an owner-column example, and `projects.sample.xlsx` (the same
rows as its CSV sibling; the tests keep them in agreement). The real FY2026 workbook stays off-repo.

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
