# Strapla user guide

Strapla is the single source of truth for the IT portfolio: **plan it, fund it, execute it and report
it** in one place. This guide is for the administrators who use the app day to day. Every account in
v1 is an administrator (there are no editor/viewer roles), so everything described here is available
to every signed-in user.

> **First time here?** There is **no default username or password**. On a fresh installation, open
> the app and complete **first-run setup** to create the first administrator (see
> [1. Getting started](#1-getting-started)).

## Contents

1. [Getting started](#1-getting-started)
2. [Core concepts](#2-core-concepts)
3. [Set up the portfolio](#3-set-up-the-portfolio)
4. [Execute: commitments, spend and settlement](#4-execute-commitments-spend-and-settlement)
5. [Reports, exports and print](#5-reports-exports-and-print)
6. [Year close and carry-over](#6-year-close-and-carry-over)
7. [Dashboard](#7-dashboard)
8. [Administration](#8-administration)
9. [The annual cycle — checklist](#9-the-annual-cycle--checklist)
10. [Reference](#10-reference)
11. [FAQ](#11-faq)
12. [Known limitations](#12-known-limitations)
13. [Support and further reading](#13-support-and-further-reading)

---

## 1. Getting started

### 1.1 First-run setup (fresh installation)

There is no seeded account. Open the app URL; if the database has no accounts you are sent to
**`/setup`**:

1. Enter **name**, **email**, **password** (at least 12 characters) and confirm the password.
2. Click **Create administrator**. You are signed in and land on the Dashboard.
3. `/setup` then becomes unreachable — every further account is created from
   **Administration → Members**.

You can create more administrators at any time; each one signs in with their own email and password.

### 1.2 Signing in and out

- Sign in at **`/login`** with your email and password.
- Sign out with the **Sign out** button in the top-right corner.
- Forgot your password? Ask another administrator to reset it in **Administration → Members**.
  There is no self-service "forgot password" in v1.
- Repeated wrong passwords temporarily block sign-in for that email (about 15 minutes) as a safety
  measure. Wait, then try again.
- Deactivating an account or resetting its password ends all of that account's sessions immediately.

### 1.3 The screen layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Strapla   IT portfolio management   v<version>   <name>  [Sign out]  │
├────────────┬─────────────────────────────────────────────────────────┤
│ Dashboard  │  Page title and description                             │
│ Plan       │  [flash messages: success or error]                     │
│ Funding    │                                                         │
│ Reports    │  Cards, tables and forms for the current page           │
│ Administration │                                                     │
│ Help       │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
```

- **Dashboard** — portfolio health at a glance.
- **Plan** — the planning side: strategic plan & SIs, annual plans, programs, projects, recurring
  operations, opening balances.
- **Funding** — overview of allocations, budget availability and the flag engine.
- **Reports** — the four reports, exports and print views.
- **Administration** — member accounts and the audit trail.
- **Help** — the in-app quick guide (a condensed version of this document).
- The small badge in the header (`v<version> · <commit>`) tells you exactly which build is running.

### 1.4 How the forms behave

- **Edits and voids require a reason.** The reason is stored in the audit trail and is what
  directors/finance will see later. Creating something usually does not require a reason.
- Buttons like **Manage**, **Edit …**, **Void …** open a collapsible panel; nothing is deleted —
  records are voided or cancelled and remain in history.
- Forms validate immediately and show a red message at the top if something is wrong (for example a
  missing reason or a closed fiscal year). Your input is not lost.
- **Amounts**: enter whole Rupiah. Dots and spaces are ignored, so `1.234.567`, `1 234 567` and
  `1234567` all mean the same amount. Amounts display as `Rp 1.234.567`.
- **Dates**: date fields use your browser's date picker (stored as a calendar date). Dates display as
  `DD/MM/YYYY`; timestamps display in `Asia/Jakarta` time.
- **Capex and opex are always separate.** Budgets, allocations, commitments and spend carry one
  component each; reports show both components and their total.

---

## 2. Core concepts

### 2.1 The portfolio hierarchy

```
Strategic plan (e.g. 2026–2030)
└── Strategic initiative (SI) — five-year envelope
    └── Annual plan (one per fiscal year, e.g. FY2027)
        └── Annual program (belongs to one SI; capex + opex budget; carry-in)
            └── Project (created once for its whole life)
                └── Project year allocation (the project's slice in one fiscal year)
                    ├── Commitment entries (purchase orders / contract milestones)
                    └── Spend entries (invoices / realized spend)
                        └── Settlements (spend paying commitments)

Recurring operations (leased lines, maintenance, subscriptions)
└── Annual plan (opex only, no SI, no project)
    ├── Commitment entries
    └── Spend entries
```

### 2.2 The objects in one table

| Object | What it represents | Where you manage it |
| --- | --- | --- |
| **Strategic plan** | The multi-year horizon (start/end fiscal year) and its status. One strategic plan at a time. | Plan → Strategic plan & SIs |
| **Strategic initiative (SI)** | A five-year envelope: owner, objective, envelope amount, prior program budget consumed. | Plan → Strategic plan & SIs |
| **Annual plan** | One fiscal year inside the horizon; draft → active → closed. | Plan → Annual plans |
| **Annual program** | A budget line for one SI in one year: capex budget, opex budget, carry-in. Can continue last year's program (program thread). | Annual plan page |
| **Project** | A whole-life investment: full-life allocated budget, submitted price, final deal price, start/end years, owner, originating program. | Plan → Projects |
| **Ijin prinsip** | The approval record for a project: document number, date, approved amount, approver, document link. | Project page |
| **Project year allocation** | The project's slice of a program's budget in one fiscal year (capex/opex allocation + carry-in). | Project page → Annual allocations |
| **Recurring ops item** | An opex-only running cost item under an annual plan (no SI, no project). | Annual plan page |
| **Commitment entry** | A purchase order or contract milestone; open until settled. | Allocation/items page → Commitments |
| **Spend entry** | Realized spend (e.g. an invoice) with category, vendor and reference. | Allocation/items page → Spend entries |
| **Settlement** | The amount of a commitment paid by a spend entry; partial settlement allowed. | Recorded with the spend entry |
| **Carry-over** | At year close, the remaining budget explicitly carried into the next fiscal year (with approval reference). | Annual plan page → Close fiscal year |

### 2.3 Statuses

| Record | Statuses | What changes it |
| --- | --- | --- |
| Strategic plan | `draft`, `active`, `archived` | Activate/archive actions (with reason). An archived plan is read-only. |
| Annual plan | `draft`, `active`, `closed` | Activate action; **Close fiscal year** workflow. A closed year is read-only (see §6). |
| Project | `active`, `cancelled` | Project page actions (with reason). Cancelled projects are read-only. |
| Member account | active, deactivated | Administration → Members (with reason). Accounts are never deleted. |
| Commitment / spend / allocation / program / recurring item | normal or voided | Void with a reason; voided records stay in history and can often be restored by re-adding. |

### 2.4 The money vocabulary

| Term | Meaning |
| --- | --- |
| **Envelope** | The SI's five-year ceiling. Consumed = prior program budget consumed + in-app program budgets. |
| **Program budget** | Budget for one SI in one year, per component. |
| **Available program budget** | `budget + carry-in`. |
| **Unallocated program budget** | `available − allocations`. Always visible; allocating above it is flagged (not blocked). |
| **Allocation** | The project's slice of a program's available budget for one fiscal year. |
| **Carry-in** | Budget explicitly carried in from a previous year (or the FY2026 opening balance). It adds to available money but is not part of this year's program budget. |
| **Commitment** | Money promised (PO/contract milestone) but not necessarily paid yet. Open commitment = commitment − settled. |
| **Spend** | Realized money spent (invoice booked). |
| **Settlement** | The portion of a commitment paid by a spend entry. A payment may settle several commitments. |
| **Cross-year settlement** | A spend paying a commitment from an **earlier** fiscal year. Counted as spend, but does not reduce the current year's remaining. |
| **Prior-year opening payment** | A spend paying a commitment that existed before Strapla (opening committed). Excluded from current-year remaining. |
| **Remaining** | `allocation + carry-in − open commitments − current-year spend`, per component. |
| **Lifetime commitment** | Opening committed + all in-app commitments of a project; compared to the contract value (BR-8). |

### 2.5 Two formulas to remember

```
Remaining (per component)  = allocation + carry-in − open commitments − current-year spend
Unallocated program budget = budget + carry-in − allocations
```

Open commitments are **not** carry-over. Committed-but-unpaid money stays a commitment until it is
settled; only the remaining budget can be carried at year close.

### 2.6 Flags — warnings, never blocks

Flags are shown as coloured badges. They warn you about a condition but **never prevent** saving —
real data must be recordable (BR-17). Resolve them by correcting the data or by discussing with the
portfolio owner.

| Flag | Meaning / rule |
| --- | --- |
| Final deal price exceeds the ijin prinsip approved budget | BR-9 |
| Final deal price is above the highest submitted price | BR-18 |
| Lifetime commitments exceed the contract value | BR-8 |
| Annual allocations exceed the project full-life allocated budget | allocation vs project full life |
| Allocations exceed the program's available budget | BR-7 (over-allocated program) |
| SI program budgets exceed the SI envelope | BR-2 |
| Current-year spend exceeds the fiscal-year commitments | BR-11 (spend above commitment) |

---

## 3. Set up the portfolio

Work **top-down**: plan → initiatives → annual plan → programs → projects → allocations → execution.
Each step needs the step above it.

### 3.1 Strategic plan and initiatives

**Plan → Strategic plan & SIs**

1. **Create plan**: enter the plan name and the start/end fiscal years (e.g. 2026–2030).
2. Activate the plan: open **Manage / Activate plan**, enter a reason. Annual plans can only be
   created once the strategic plan is active. Archiving the plan makes it read-only.
3. **Add initiative** for each SI:
   - **Code** (e.g. `SI-01`) and **name**;
   - **owner** and **objective** (optional text);
   - **envelope amount** — the five-year ceiling;
   - **prior program budget consumed** — money already used before Strapla (opening balance).
4. Flags: if prior consumed + in-app program budgets exceed the envelope, the SI is flagged as
   **over envelope** (BR-2).

### 3.2 Annual plans

**Plan → Annual plans**

1. Select a fiscal year inside the horizon (a year can have only **one** annual plan) and create it
   as a draft.
2. Open the plan and **Activate annual plan** with a reason when the budget is settled.
3. A plan can be closed only through the year-close workflow (§6). Closed years are read-only.
4. Notes on the plan are free text and audited.

### 3.3 Annual programs

Open an annual plan and use **Add annual program**. Fields:

| Field | Notes |
| --- | --- |
| Code | Suggested automatically (e.g. `PRG-2027-001`); unique within the plan. |
| Name | Short descriptive name. |
| Strategic initiative | One SI per program (BR-4). |
| Continues program | Optional: the previous fiscal year's program of the same thread. This is what makes a **program thread** visible across years. |
| Capex budget / Opex budget | The program's budget for the year, per component. |
| Capex carry-in / Opex carry-in | Opening balance or prior-year carry-over. Normally written by the year close (or the FY2026 opening load). |

Rules:

- The program page shows **available** (`budget + carry-in`), **allocated**, and **unallocated** per
  component. Allocating above available is flagged, never blocked (BR-7).
- A program with projects or with a later continuation cannot be voided; remove those first.
- Every program card has a **Thread** link to the cross-year program thread and carry-in
  reconciliation.

### 3.4 Projects and ijin prinsip

**Plan → Projects**

**Create project** fields:

| Field | Notes |
| --- | --- |
| Originating program | The program that originates the project. The project's SI derives from it (BR-6). |
| Name and owner | |
| Start / end fiscal year | The project's whole life. Annual allocations must fall inside these years. |
| Full-life allocated budget | The total planned allocation across the project's life. |
| Submitted price | The highest submitted vendor price. |
| Final deal price | The contract value (ceiling for lifetime commitments, BR-8). |
| Description | Optional. |

The project code (`PRJ-<FY>-<nnn>`) is generated automatically.

On the project page:

- **Record ijin prinsip**: document number, document date, approved amount, approver and document
  link (a URL/number — there are no file uploads).
- Flags appear when the final deal price exceeds the approved budget (BR-9), the final deal price is
  above the submitted price (BR-18), or later when commitments exceed the contract value (BR-8).
- **Cancel project** requires a reason and makes the project read-only. Correction? Use audited edits
  before cancelling.
- The **Change history** card at the bottom lists every audited change for the project.

### 3.5 Recurring operations

On an annual plan page, use **Add recurring ops item** for opex-only running costs (leased lines,
maintenance, subscriptions):

- Fields: name, category (managed list), owner, **opex budget**, **opex carry-in**, notes.
- Recurring ops items have **no SI link and no projects**, and only opex (BR-12).
- Commitments and spend are recorded on the item's own execution page (see §4).

### 3.6 Opening balances (the FY2026 cut-over)

The first in-app fiscal year is FY2027; FY2026 is closed manually in the spreadsheets. Pre-app data
enters as **opening figures**, never as reconstructed records:

| Opening figure | Where you enter it |
| --- | --- |
| Prior program budget consumed | Strategic initiative form |
| Program carry-in (capex/opex) | Program form (FY2027 program) |
| Project allocation carry-in | Project year allocation form |
| Opening allocated / committed / spent (whole life) | Project form |
| Recurring ops carry-in | Recurring ops item form |

**Bulk load (the wizard).** Open **Plan → Opening balances → Opening import**, then for each data set
in this order:

1. Download the generated **CSV/XLSX template** — headers, type rules, an example row and the load
   reason convention come from the committed field list plus the custom fields defined under
   **Administration → Custom fields** (they appear as extra columns).
2. Upload the file and choose **Validate file**. Every bad value and unknown column is reported by
   line, and nothing is written. A required custom field with no value fails that row.
3. Choose **Validate and load**. The file is re-validated and the records are written in one
   transaction, with one audit entry per record and the reason
   `Opening balance — FY<year> close / <reference>`. Any custom-field values are stored on the new
   record and recorded in its audit entry. Duplicate codes and unknown references fail the whole
   file; the import creates records and never updates existing ones.

Then reconcile on **Plan → Opening balances**: enter the eight spreadsheet control totals, save, and
compare every difference against the in-app totals on one screen. Sign off with a reason when you
accept the figures. Sign-off is a one-time, audited action; later corrections are audited edits.

The manual path stays available: use the forms in the table above and the per-view reconciliation
tables. Use the reason convention on those edits too. The detailed workplan is in
`docs/OPENING-BALANCE-LOAD.md`.

### 3.7 Annual allocations (the project's slice per year)

A project is created once; each fiscal year gets one **annual allocation**.

**Add annual allocation** on the project page:

| Field | Notes |
| --- | --- |
| Fiscal year program | A program for the project's SI in the target fiscal year. The year must be inside the project's start/end years. |
| Capex allocation / Opex allocation | The project's slice of that year's program budget, per component. |
| Capex carry-in / Opex carry-in | Brought-in budget from a prior year/opening balance. |
| Notes | |

Rules and behaviour:

- **One allocation per project per fiscal year**; a voided allocation can be restored by re-adding.
- Allocating above the program's available budget is flagged (BR-7), not blocked.
- Each allocation card shows **allocation, carry-in and remaining** per component, plus BR-11 badges
  when spend is above the year's commitments.
- **Open commitments & spend** on the card opens the execution page for that year — this is where
  commitments and spend are recorded (§4).
- The year-close workflow writes carry-in into the next year's allocation, creating it automatically
  for projects that span into the next fiscal year.
- A closed fiscal year's allocation is read-only; audited administrator corrections are the
  exception.

---

## 4. Execute: commitments, spend and settlement

Open a project year allocation (or recurring ops item) and click **Open commitments & spend**.
The page shows the budget summary, the commitment table and the spend table.

### 4.1 Commitments

**Record commitment**: component, amount, commitment date, reference (PO number / milestone) and
description.

- A commitment starts **open**. When spend settles it, it becomes **partially settled** and finally
  **settled**.
- Open commitments reduce the available budget but are **not** carry-over.
- Editing a commitment is audited and requires a reason; it **cannot be reduced below the amount
  already settled**.
- A commitment **cannot be voided while it has settlements** — void the settling spend first.
  Otherwise voiding is audited and restorable by re-adding.

### 4.2 Spend entries

**Record spend**: component, amount, spent-on date, category, vendor, invoice/reference, description,
and a settlement classification.

- **Current-year spend** (normal): reduces the current year's remaining. It may settle open
  commitments of the same project/item and component.
- **Pays a pre-Strapla commitment (opening balance)**: `prior_year_opening` — used only for payments
  of commitments that existed before Strapla. It is excluded from the current year's remaining and
  reported separately.
- **Settle open commitments** (optional): enter an amount next to each open commitment you are paying.
  The app validates that:
  - a settlement cannot exceed a commitment's open amount,
  - settlements cannot exceed the spend amount,
  - the same commitment cannot be settled twice in one spend,
  - commitment and spend use the same component and belong to the same project/item,
  - you cannot settle a commitment from a **later** fiscal year.
- Settling a commitment from an **earlier** fiscal year is automatically a **cross-year settlement**
  (badge shown). Its amount counts as spend, but does not reduce this year's remaining or the BR-11
  comparison.
- Updating a spend entry is audited and cannot reduce the amount below what was settled. Changing the
  settlement classification after settlements exist requires voiding and re-entering.
  **Settlement links are fixed once recorded**: to change them, void the spend and record it again.
- Voiding a spend is audited; it releases its settlements, reopening the commitments.

### 4.3 What changes when

| Action | Open commitments | Current-year spend | Remaining |
| --- | --- | --- | --- |
| Record a commitment | ↑ | — | ↓ |
| Record a spend that settles a same-year commitment | ↓ (by settled amount) | ↑ (by settled amount) | no change |
| Record a spend with no settlement | — | ↑ | ↓ |
| Cross-year settlement portion | — | excluded from current year | no change |
| Prior-year opening payment | — | excluded | no change |
| Void a spend | ↑ (settlements released) | ↓ | ↑ |

### 4.4 Remaining and BR-11

- Remaining is computed per component: `allocation + carry-in − open commitments − current-year
  spend`.
- **BR-11** warns when current-year spend exceeds the year's commitment total. It is a warning, not a
  block — invoices can arrive before commitments are updated.
- The allocation overview on the project page and the dashboard reflect the same numbers.

---

## 5. Reports, exports and print

**Reports** contains four reports, all computed from the same data:

| Report | What it shows |
| --- | --- |
| **SI five-year view** | Envelope, prior consumed, in-app program budgets, allocations, commitments, spend and headroom per SI, with portfolio totals. |
| **Annual plan by SI and program** | Every program with capex/opex budget, carry-in, available, allocated and unallocated money, plus execution (committed/spent); recurring operations with committed/spent/prior-year openings/remaining. |
| **Project register** | Full-life figures, ijin prinsip approved amount, submitted/final deal price, allocations, lifetime commitments, spent to date, open commitments, prior-year opening settlements and flags. |
| **Budget versus actual** | Program-level budget versus allocated, committed and spent, with prior-year settlement and prior-year opening lines. |

- **CSV** and **XLSX** buttons download the same tables (XLSX has one sheet per table, raw Rupiah
  integers). The downloaded file respects the report's current data.
- **Print / PDF** opens a print view: the app header/navigation are hidden and the page is set to A4
  landscape. Use the browser's print dialog to save as PDF.
- Reports are read-only; all data comes from the plan/funding/execution records.
- The audit trail can also be exported as CSV from **Administration → Audit trail**.

---

## 6. Year close and carry-over

Closing a fiscal year is a manual, audited, **irreversible** workflow (there is no reopen).

### 6.1 Before you close

- The annual plan must be **active**.
- The **next fiscal year's annual plan must exist** and must not be closed — carry-over lands there.
- Agree the carry-over amounts, the approval reference and the typed confirmation phrase with the
  portfolio owner. The phrase is exactly `CLOSE FY<year>` (for example `CLOSE FY2027`).
- Remember: only **remaining budget** and **unallocated program budget** can be carried; open
  commitments are not carry-over.

### 6.2 How to close

1. Open the annual plan and click **Close fiscal year** (visible while the plan is active).
2. Review the **Close review** card: target year, programs with unallocated budget, allocations with
   remaining, and the explanation of the formulas.
3. **Program carry-over**: for each program, enter a capex/opex amount (up to unallocated) and
   choose the target program in the next year (defaults to the continuation program). Every field
   must be filled in explicitly: type `0` for a component with no carry-over.
4. **Project allocation carry-over**: for each project, enter the amounts to carry (up to remaining),
   again typing `0` for a component with no carry-over. A blank field blocks the close.
   If the target year's allocation does not exist yet it will be created with the carry-in; projects
   that end before the target year cannot carry.
5. Check the **carry-over totals** preview above the button (program and allocation, capex and opex):
   it shows the amounts entered; the close rejects any amount above what is available or remaining.
   Enter the **approval reference** (board approval / memo number), type the confirmation phrase
   **`CLOSE FY…`**, and click **Close FY… and carry over**. A wrong phrase or a cleared carry field
   blocks the close.
6. The year becomes `closed`: carry-in is added to the target programs/allocations, a snapshot is
   recorded, every carry-over and the close are audited, and the plan page shows the closed state.
   The **Close fiscal year** page then shows the snapshot (reference, closed date, all entries).

### 6.3 Closed years — what still works

- **Read-only**: creating, editing (except audited administrator corrections) and voiding plan
  records is blocked.
- **Audited corrections**: administrator updates on programs, allocations, recurring ops, projects
  and ijin prinsip remain possible where a reason is required.
- **Settlement lifecycle continues**: spend entries that settle existing commitments may still be
  recorded after close and are audited.
- **No reopen, no rollback, no version restore** (charter §6.7).

### 6.4 Program threads

Open any program card's **Thread** link (or the thread page from the annual plans overview) to see the
program across fiscal years: budgets, carry-in, allocations, unallocated money, project counts, and a
**carry-in reconciliation** comparing the close snapshot with the current carry-in. The annual plans
overview lists every **program thread** chain (e.g. `FY2027 PRG-2027-001 → FY2028 PRG-2028-001`).

---

## 7. Dashboard

The Dashboard summarises portfolio health:

- **Stat cards**: envelope, program budget + carry-in, allocated + carry-in, open commitments,
  in-app spend, remaining, fiscal-year commitments, and flags.
- **Plan versus execution**: available / allocated / open commitments / current-year spend /
  remaining per component and in total; cross-year and prior-year opening amounts noted underneath.
- **Fiscal years**: every annual plan with its status; closed years also show the approval reference.
- **Program threads**: continuation chains across years.
- **Recent activity**: the latest audited changes, with a link to the audit trail.
- **Quick links** to the main workflows.

Use it for weekly/monthly reviews and before director/finance meetings; the reports remain the
detailed exportable sources.

---

## 8. Administration

### 8.1 Members

**Administration → Members**

- **Create member**: name, email, initial password (at least 12 characters). Hand the password over
  out of band.
- **Manage** on each account:
  - **Reset password** — sets a new password, revokes all sessions, audited.
  - **Revoke sessions** — signs the member out everywhere, audited.
  - **Deactivate** — account and history stay; the member cannot sign in. You cannot deactivate
    yourself or the **last active account**.
  - **Activate** — restores the account; sessions are not restored.
- Accounts are never deleted.

### 8.2 Audit trail

**Administration → Audit trail**

- Every change is recorded with actor, action, entity, before/after values, reason and timestamp.
  The audit trail is append-only and is written in the same transaction as the change.
- **Search and filter**: free-text search across actor, entity id, action and reason; filters for
  entity type, action and actor. The screen shows the latest 200 matching entries.
- **Export CSV** downloads the filtered trail (up to 5000 entries) for directors/finance.
- **Custom fields**: when an administrator defines extra fields on a record type, they appear here in
  the before/after values under `customFields`.
- **Values** expands before/after JSON in place.
- Most record pages (e.g. projects) also have a **Change history** card.

### 8.3 Custom fields

**Administration → Custom fields**

- An administrator can add, edit and remove extra typed fields on four record types: **strategic
  initiatives, annual programs, projects** and **recurring ops items**.
- A field has a **name**, a **type** (text, number or date), an optional **required** flag and a
  **description**. Every change is audited; a reason is required when editing or removing.
- Values appear on the create/edit form and in an **Additional fields** panel on the record. Text is
  free text, numbers are whole numbers (digits, with an optional minus) and dates are real calendar
  dates.
- Reports show the fields of the record type they list as extra columns, offer a **custom-field
  filter**, and the export lets you choose which extra columns to include. The filter narrows the
  rows on screen; the totals and the export always cover the whole report.
- Custom fields are metadata: they never change budgets, remaining amounts, flags, allocations or
  report totals. Removing a field archives it, so it disappears from forms, record pages, reports
  and exports and its name can be reused; the values already recorded are kept but no longer shown,
  and the audit trail records what was recorded.
- The opening-balance import includes the entity's custom fields as extra template columns and
  stores their values on the imported records. A required field missing from a row fails that row
  with its line number; a number field follows the form rule (whole digits, optional minus), not the
  Rupiah rule.
- The field list is per deployment (one deployment belongs to one organisation).

### 8.4 Corrections policy (v1)

- Nothing is hard-deleted. Wrong data is corrected with an audited edit (reason required), or the
  record is voided/cancelled with a reason.
- Closed years: audited administrator corrections are the only way to change data.
- There is no reopen, rollback or version restore.

---

## 9. The annual cycle — checklist

**Before the fiscal year**

- [ ] Strategic plan active; SIs with envelopes and prior consumption up to date.
- [ ] Annual plan created and activated; programs created (with continuation links).
- [ ] Projects created with ijin prinsip; annual allocations entered for the year.
- [ ] Recurring operations items created with their opex budgets.
- [ ] Opening balances loaded and reconciled (first year only).

**During the year**

- [ ] Commitments recorded when POs/contracts are issued.
- [ ] Spend recorded when invoices are booked; settle commitments where applicable.
- [ ] Review the dashboard/reports monthly; resolve flags or accept them with the owner.
- [ ] Export the reports before director/finance reviews.

**Year end**

- [ ] Ensure the next year's annual plan exists.
- [ ] Agree carry-over amounts and the approval reference.
- [ ] Close the fiscal year; verify the carry-in on the next year's programs/allocations.
- [ ] Reconcile the program threads' carry-in against the close snapshot.

---

## 10. Reference

### 10.1 Field reference

**Strategic initiative**: code, name, owner, objective, envelope amount, prior program budget consumed.

**Annual plan**: fiscal year (unique), notes, status.

**Annual program**: code, name, SI, continuing program (optional), capex budget, opex budget, capex
carry-in, opex carry-in, notes.

**Project**: originating program, name, owner, start fiscal year, end fiscal year, full-life
allocated budget, submitted price, final deal price, description; status.

**Ijin prinsip**: document number, document date, approved amount, approver, document link, notes.

**Project year allocation**: annual program, capex allocation, opex allocation, capex carry-in, opex
carry-in, notes.

**Recurring ops item**: name, category, owner, opex budget, opex carry-in, notes.

**Commitment entry**: parent (allocation or recurring item), component, amount, commitment date,
reference, description.

**Spend entry**: parent (allocation or recurring item), component, amount, spent-on date, category,
vendor, invoice/reference, description, settlement classification, optional settlements.

**Year close**: approval reference, target programs for carried program budgets, carry amounts per
program and per project allocation.

### 10.2 Status transitions

```
Strategic plan:  draft ──activate──▶ active ──archive──▶ archived (read-only)
Annual plan:     draft ──activate──▶ active ──close───▶ closed (read-only, no reopen)
Project:         active ──cancel───▶ cancelled (read-only)
Commitment:      open ──settle──▶ partially settled ──settle──▶ settled   (or void)
Spend:           recorded ──void──▶ voided (releases settlements)
```

### 10.3 Common messages and what to do

| Message | Meaning | What to do |
| --- | --- | --- |
| `Email or password is incorrect.` | Wrong credentials. | Check email/password; an admin can reset the password; repeated failures temporarily lock sign-in. |
| `Too many attempts. Try again in 15 minutes.` | Login rate limit. | Wait ~15 minutes. |
| `Complete the first-run setup before signing in.` / `/setup` | No accounts exist yet. | Complete first-run setup. |
| `This fiscal year is closed and read-only.` | The target annual plan is closed. | Use an open fiscal year; closed years only accept audited corrections (and settlement lifecycle on existing commitments). |
| `That fiscal year is closed and read-only.` | Creating a new record in a closed plan. | Create it in the open/next year, or carry over at close. |
| `An allocation for FY… already exists.` | One allocation per project per fiscal year. | Open the existing allocation and edit it. |
| `The allocation must use a program for the same strategic initiative (BR-6).` | Wrong program chosen. | Choose a program under the project's SI. |
| `FY… is outside the project's active years (…).` | Allocation year outside start/end years. | Change the project years or pick another year. |
| `This commitment has settlements. Void the settling spend entries first.` | Commitment cannot be voided while paid. | Void the spend entries that settled it. |
| `The commitment cannot be reduced below the already settled amount.` | Editing a commitment below settled amount. | Raise the amount or reverse settlements. |
| `The spend amount cannot be reduced below the settled amount.` | Editing a spend below settled amount. | Keep amount ≥ settled, or void and re-enter. |
| `A settlement cannot exceed the open commitment amount.` / `settlements cannot exceed the spend amount.` | Invalid settlement split. | Adjust the split amounts (check the open amounts shown). |
| `A settlement cannot pay a commitment from a later fiscal year.` | Wrong commitment chosen. | Settle commitments of the same or earlier years. |
| `The last active account cannot be deactivated.` / `You cannot deactivate your own account.` | Member management guard. | Keep at least one active admin; use another admin for your own account. |
| `Choose a target program for …` | Year close: a carry amount has no target program. | Select the continuation/target program in the close form. |
| `The FY… annual plan does not exist yet; create it before closing.` | Year close needs the next year's plan. | Create the next year's annual plan first. |
| `No eligible program left …` | The project page has no program available for its years. | Create the program for the right SI/year, or all years already have allocations. |
| `This project is cancelled and read-only.` | Cancelled project. | Projects are read-only after cancellation. |

---

## 11. FAQ

**Is there a default admin username/password?**
No. A fresh database sends you to first-run setup (`/setup`), where you create the first
administrator and choose the password. Every other account is created in Administration → Members.

**Who can do what?**
Every signed-in account is an administrator. There are no editor or viewer roles in v1.

**Where is my data stored?**
In the PostgreSQL database of your deployment. The app has no external SaaS dependency; audit
entries and all records live in that database. Backups are handled by the deployment (see
`docs/operations.md`).

**Can I delete accounts, projects or records?**
No. Accounts are deactivated; plan records are voided/cancelled with a reason and stay in history.

**Can I reopen a closed year or roll back?**
No. Closing is irreversible; corrections on closed years are audited administrator edits only.

**Can I import a spreadsheet?**
Only the opening balances: **Plan → Opening balances → Opening import** takes the generated CSV/XLSX
templates (they include the active custom fields). All other plan data is entered through the forms.

**Can I attach documents?**
No file uploads: ijin prinsip and other documents are referenced by number and link.

**Are there email notifications?**
No. The dashboard and reports are the review surfaces.

**How do I know which version is running?**
The header shows `v<version> · <commit>`. Deployment update instructions are in `README.md` and
`docs/operations.md` (`docker compose pull app && docker compose up -d --force-recreate app`).

**What do the two budget components mean?**
Capex = capital investment (e.g. hardware purchases). Opex = running cost (e.g. leases,
maintenance). They are tracked separately everywhere and shown together in totals.

**Why does the project need an "originating program"?**
It determines the project's SI, which anchors the project in the portfolio and in the SI envelope.
All annual allocations must use programs of the same SI (BR-6).

**Why is spend different from commitment?**
Commitment = money promised (PO/contract). Spend = money actually recorded (invoice). Settling a
commitment with a same-year spend does not change remaining because the money was already committed.

**Can I settle one spend against several commitments?**
Yes — enter an amount next to each open commitment in the spend form. The total must not exceed the
spend amount.

**What is a cross-year settlement?**
Spend in year N paying a commitment raised in an earlier year. It counts as spend but does not reduce
year N's remaining; it appears on its own report line.

**What happens to open commitments at year close?**
Nothing: they are not carry-over. They stay open and can be settled in the next year (cross-year
settlement), while only remaining budget is carried.

---

## 12. Known limitations

- One strategic plan at a time; one administrator role (all users are administrators).
- One annual plan per fiscal year; no reopen of a closed year.
- No CSV import, file uploads, email notifications, per-vendor quote records or external SSO.
- No payment-status/date tracking (spend = realized record, not a payment ledger).
- Audit trail screen shows the latest 200 matching entries; CSV export up to 5000.
- Rupiah amounts are whole numbers (no decimals).
- Recurring operations have no contract value or SI link (opex only, by design).

---

## 13. Support and further reading

- **Release notes**: `docs/RELEASE-NOTES-2026-12.md` — scope, post-release features, known limitations.
- **Go-live checklist**: `docs/GO-LIVE-CHECKLIST.md` — deployment and first-week checks.
- **Opening-balance workplan**: `docs/OPENING-BALANCE-LOAD.md` — the FY2026 cut-over in detail.
- **UAT plan**: `docs/UAT-PLAN.md` — acceptance scenarios and sign-off.
- **Operations**: `docs/operations.md` — deployment, images/versions, backup and restore.
- **Charter and ADRs**: `docs/CHARTER.md`, `docs/adr/` — the product and technical decisions.
- **Defects**: raise a GitHub issue in `tahopetis/strapla` with the page, steps, expected/actual and
  a screenshot. Data-value defects that block the plan are treated as release blockers.

The in-app **Help** page contains a condensed version of this guide for day-to-day use.
