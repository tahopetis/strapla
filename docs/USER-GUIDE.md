# Strapla user guide — v0.5.0 (beta)

Strapla is the single source of truth for the IT portfolio: **plan it, fund it, execute it, close the
year and report it** in one place. This guide is for the administrators who run the portfolio day to
day. In this release every account is an administrator — there are no editor or viewer roles — so
everything described here is available to every signed-in user.

> **First time here?** There is no default username or password. On a fresh installation open
> `/setup` and create the first administrator (see [1.1 First-run setup](#11-first-run-setup)).
> The in-app **Help** page carries a condensed version of this guide.

| Field | Value |
| --- | --- |
| Product | Strapla — IT portfolio management |
| Version | **v0.5.0 (beta)** |
| Guide last updated | 2026-11-27 |
| Audience | Finance and portfolio administrators |
| App scope | Plan (including plan succession), funding and execution, year close, reports, dashboard, administration, help |
| In-app help | **Help** in the main navigation |

## Contents

1. [Getting started](#1-getting-started)
2. [Core concepts](#2-core-concepts)
3. [Set up the portfolio](#3-set-up-the-portfolio)
4. [Execution: commitments, spend and settlement](#4-execution-commitments-spend-and-settlement)
5. [Reports, exports and print](#5-reports-exports-and-print)
6. [Year close and carry-over](#6-year-close-and-carry-over)
7. [Dashboard](#7-dashboard)
8. [Administration](#8-administration)
9. [The annual cycle: checklist](#9-the-annual-cycle-checklist)
10. [Reference](#10-reference)
11. [FAQ](#11-faq)
12. [Known limitations](#12-known-limitations)
13. [Support and further reading](#13-support-and-further-reading)

## 1. Getting started

### 1.1 First-run setup

A fresh database has no account. Open **`https://<your-host>/setup`** in a browser (the sign-in page
does not create accounts, so use this URL for the first run):

1. Enter **Name**, **Email**, **Password** (at least 12 characters) and **Confirm password**.
2. Click **Create administrator**. The button shows *Creating…* while it saves.
3. You are signed in and land on the **Dashboard**. `/setup` now redirects to `/login`; every further
   account is created in **Administration → Members**.

There is no self-service sign-up or password reset; if the only administrator loses the password, use the deployment's restore/recovery procedure (see `docs/operations.md`).

### 1.2 Signing in and out

- Sign in at **`/login`** with **Email** and **Password**, then click **Sign in**.
- Sign out with **Sign out** in the header. It ends the current session.
- Sessions last **30 days**. When a session ends (expired, revoked, or the account was deactivated)
  the next page sends you to `/login` with the message *Your session ended. Sign in again to
  continue.*
- An administrator resetting a password or deactivating an account ends **all** of that account's
  sessions immediately.
- **Rate limit:** after 10 failed sign-ins for the same email within 15 minutes, sign-in is blocked
  with *Too many attempts. Try again in 15 minutes.* The limiter is in memory, clears on a successful
  sign-in and resets when the app restarts.
- There is no "forgot password" link and there are **no email notifications**. Ask another
  administrator to reset the password under **Administration → Members**.

### 1.3 The screen layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Strapla  v<version> · <commit>            <your name> [Sign out]  │
├────────────────┬─────────────────────────────────────────────────┤
│ Sidebar        │  Page title, flash message, then page content    │
└────────────────┴─────────────────────────────────────────────────┘
```

- **Dashboard** — portfolio health at a glance.
- **Plan** — the planning side, with its own sub-navigation: **Overview**, **Strategic plan & SIs**,
  **Annual plans**, **Projects**, **Opening balances**, **Archived plans**.
- **Funding** — allocations, balances, flags and the execution model, with links into the workflows.
- **Reports** — the four reports, exports and print views.
- **Administration** — **Members**, **Audit trail** and **Custom fields**; **Help** is the in-app
  quick guide.
- The header badge shows the running build as **`v<version> · <commit>`** (the commit is shortened to
  seven characters; the tooltip reads *Running build (version · commit)*). If no commit was baked into
  the image, only the version shows. Fiscal-year badges (for example `FY2027`) link to their annual
  plan.

### 1.4 How the forms behave

- **Edits and voids require a reason.** The **Reason for change** field is required and stored in the
  audit trail; creates normally do not ask for one. Voids, archives, cancellations, password resets,
  session revocations and custom-field edits/removals/restores all take a reason; the year close takes
  an approval reference and typed confirmation instead. Nothing is hard-deleted: records stay in the
  audit trail and in history.
- **Destructive actions open a confirmation dialog.** It states the consequence in one sentence,
  carries the reason field and offers **Cancel** and the confirming button. A refused submission
  reopens the dialog with your input intact.
- **Validation is immediate and inline.** A red message appears at the top of the form for a
  form-level problem, and a red message appears under the field that caused a field-level problem;
  your input is echoed back, so a refused save never loses what you typed. Buttons disable and
  relabel while saving (*Signing in…*, *Creating…*, *Saving…*, *Closing…*), so a slow save cannot
  become a double submission.
- **Money** is entered in whole Rupiah. Dots and spaces are ignored and an `Rp` prefix is tolerated,
  so `1.234.567`, `1 234 567` and `1234567` all mean the same amount; commas are not accepted.
  Amounts display as `Rp 1.234.567`, and computed negative amounts display with a leading minus.
  Capex and opex stay separate: budgets, allocations, commitments and spend carry one component
  each, and where money is planned or executed per component, the component figures and the combined
  total are both shown.
- **Dates** use the browser's date picker and display as `DD/MM/YYYY`. Timestamps (audit trail,
  dashboard) display as `DD/MM/YYYY HH:mm` in 24-hour time on the **Asia/Jakarta** clock; storage is
  in UTC.
- **Closed years block ordinary writes.** Once an annual plan is closed, creates, voids and status
  changes refuse with a closed-year message; an existing record can still be fixed through **Correct
  record**, which requires a reason and is audited (see [6.3 After the close](#63-after-the-close)).

## 2. Core concepts

### 2.1 The portfolio hierarchy

```
Strategic plan (one active or draft at a time; e.g. 2026–2030, then a successor 2031–2035)
└── Strategic initiative (SI) — five-year envelope, prior consumption
    └── Annual plan (exactly one per fiscal year; draft → active → closed)
        └── Annual program (one SI; initial capex/opex budget + revisions; ledger carry-in; continuation link)
            └── Project (created once for its whole life)
                └── Project year allocation (the project's slice in one fiscal year)
                    ├── Commitment entries (POs / contract milestones; open → settled)
                    └── Spend entries (invoices; may settle commitments)

Recurring operations (opex only, no SI, no project)
└── Annual plan
    └── Recurring ops item
        ├── Commitment entries
        └── Spend entries
```

A project is never duplicated year over year. Each fiscal year gets one **annual allocation**
instead, attached to that year's program for the same SI. Programs continue across years through a
**continuation link**, which forms a **program thread**.

Since ADR-0006, an **active** year's program budgets are frozen: a change is a numbered, immutable
**budget revision**, never an in-place edit. **Carry-in** is received through the carry-over ledger
(an audited receipt), not typed on a program or allocation.

The strategic plan is a **boundary**, not a one-off record. When its horizon ends (or the owner ends
it early), its last annual plan closes as a **final close** with nothing carried, the plan is archived
read-only, and a **successor plan** starts in the year after it. Nothing crosses the boundary — no
budget, carry-in, project or initiative — and the successor starts empty (§6.6).

### 2.2 The objects in one table

| Object | What it represents | Where you manage it |
| --- | --- | --- |
| **Strategic plan** | The multi-year horizon (start/end fiscal year) and its status. One plan is active or draft at a time; a successor follows the archived plan. | Plan → Strategic plan & SIs |
| **Archived plans** | The read-only list of archived plans, with each plan's read-only page: its initiatives with envelope figures, its annual plans, annual programs and projects, and links into the annual plan, program, project and allocation pages. | Plan → Archived plans |
| **Strategic initiative (SI)** | A five-year envelope: code, name, owner, objective, prior program budget consumed. | Plan → Strategic plan & SIs |
| **Annual plan** | One fiscal year inside the horizon; draft → active → closed. | Plan → Annual plans |
| **Annual program** | A budget line for one SI in one year: initial capex/opex budget (frozen once the plan is active), effective budget, ledger carry-in, optional continuation. | Annual plan page |
| **Project** | The whole-life investment record: full-life allocated budget, submitted price, final deal price, years, owner, originating program. | Plan → Projects |
| **Ijin prinsip** | The directors' in-principle approval for a project: document number, date, approved amount, approver, document link. | Project page → Ijin prinsip |
| **Project year allocation** | The project's slice of a program's budget in one fiscal year: allocation and carry-in per component. | Project page → Annual allocations |
| **Recurring ops item** | An opex-only running cost item under an annual plan (no SI, no project). | Annual plan page |
| **Commitment entry** | A purchase order or contract milestone attached to an allocation or recurring ops item. | Open commitments & spend |
| **Spend entry** | Realized spend (for example an invoice) with category, vendor and reference. | Open commitments & spend |
| **Settlement** | The link recording that a spend entry pays part or all of a commitment. | Recorded with the spend entry |
| **Budget revision** | A numbered, immutable document that changes an active year's program budgets (or de-allocates an allocation) with a reason and, when it arrives later, a decision reference. | Annual plan → Budget revisions |
| **Carry-in receipt** | One append-only ledger entry: the money a program or project-year allocation received, its origin (`close`, `opening`, `manual`), reason and — for a close receipt — the source year/entity and approval reference. | Year close, opening import, or a reasoned manual grant on the annual plan page |
| **Close snapshot** | The immutable per-entity, per-component close decision: available, carried, not carried and why. | Annual plan → Close receipt (after the close) |
| **Carry-over** | The close decision that moves remaining budget into the next fiscal year; the carried amounts become carry-in receipts in the next year's ledger. | Annual plan → Close fiscal year |
| **Custom field** | An administrator-defined extra typed field on eight record types. Metadata only; never part of money rules. | Administration → Custom fields |

### 2.3 Statuses and what changes them

| Record | Statuses | What changes it |
| --- | --- | --- |
| Strategic plan | `draft`, `active`, `archived` | **Activate plan** / **Archive plan** in the page header (reason required). An archive needs every annual plan under the plan closed; a draft plan, which has none, may be archived too. Archived is final and read-only, and a successor can then be created (§6.6). |
| Annual plan | `draft`, `active`, `closed` | **Activate annual plan** in the page header; **Close fiscal year** workflow. Closed accepts reasoned corrections of existing records only; no reopen (see §6.3). |
| Project | `active`, `cancelled` | **Cancel project** (reason required). Cancelled is read-only. |
| Commitment | `open`, `partially settled`, `settled` | Settlements: open = amount − settled. A commitment can be voided only while it has no settlements. |
| Spend entry | current-year or prior-year opening classification; voided or not | Void with a reason; the settlement classification is fixed once settlements exist. |
| Member account | active, deactivated | **Deactivate member** / **Activate member** (reason required). Accounts are never deleted. |
| Strategic initiative, annual program, allocation, recurring ops item | normal or voided | Void with a reason; voided records stay in history. |
| Custom field | active or archived | **Remove field** archives it; **Restore field** brings it back (reason required). |

### 2.4 The money vocabulary

| Term | Meaning |
| --- | --- |
| **Envelope** | The SI's five-year ceiling. Consumed = prior program budget consumed + in-app program budgets. |
| **Program budget** | The budget for one SI in one fiscal year, per component. Once the plan is active the stored figure is the frozen **initial** budget. |
| **Effective program budget** | The initial budget plus every posted budget revision delta, per component. Every screen and report uses this, never the initial column alone. |
| **Available program budget** | `effective budget + carry-in`. The two inputs stay visible separately. |
| **Unallocated program budget** | `available − allocations`. Always visible; allocating above it is flagged, not blocked. |
| **Budget revision** | A numbered (`REV-<FY>-<nnn>`), immutable document with one signed line per program/component (and de-allocation lines). It may be posted before its formal decision exists; the register then shows *awaiting decision reference*. |
| **Carry-in** | Money received into a program or project-year allocation from the carry-over **ledger** (year close, opening balance, or reasoned manual grant). It adds to available money but is not part of this year's initial budget. The `carry_in_*` columns on programs and allocations are a guarded cache; the ledger is the source of truth. A recurring ops item's carry-in is outside the ledger and is a plain typed field. |
| **Carry-over** | The year-close decision that moves remaining budget into the next year. The close records a snapshot (available / carried / not carried + reason) and writes one receipt per carried amount. |
| **Final close** | The year close of the annual plan in the plan's end year: no next-year target, every available amount recorded as not carried, and no carry-over receipt. See §6.5. |
| **Allocation** | The project's slice of a program's available budget for one fiscal year. |
| **Commitment** | Money promised (PO / contract milestone) but not necessarily paid yet. |
| **Open commitment** | `commitment amount − settled amount`. Open commitments reduce remaining but are **not** carry-over. |
| **Spend** | Realized money booked (for example an invoice). |
| **Settlement** | The part of a commitment paid by a spend entry. Partial settlement is allowed. |
| **Cross-year settlement** | A spend in year N paying a commitment from an **earlier open year**. Counted as actual spend, but does not reduce year N's remaining. |
| **Prior-year opening payment** | A spend paying a commitment that existed before Strapla. Excluded from the current year's remaining; reported separately. |
| **Post-close settlement** | A spend in an open year paying a commitment whose annual plan is **closed**. The closed-year portion is either charged to the current year or reserved in the closed year. |
| **Post-close adjustment (reserve)** | The closed year's separately labelled report line for reserve-treated post-close settlements. Never part of the locked close snapshot or carry-over. |
| **Remaining (allocation)** | `allocation + carry-in − open commitments − current-year spend`, per component. |
| **Remaining (program money line)** | `effective budget + carry-in − open commitments − current-year spend`, per component. |
| **Over-allocated** | Allocations exceed the program's available money; a warning flag, never a block. |
| **Unfunded** | A budget cut left the program's remaining below zero; a warning flag, never a block. |
| **Lifetime commitments** | Opening committed + all in-app commitment amounts of a project; compared with the contract value (BR-8). |

### 2.5 The formulas to remember

```
Effective program budget    = initial budget + Σ posted revisions
Available program money     = effective budget + carry-in
Remaining (per component)   = allocation + carry-in − open commitments − current-year spend
Program money remaining     = effective budget + carry-in − open commitments − current-year spend
Unallocated program budget  = effective budget + carry-in − allocations
```

- Revisions exist only while the annual plan is **active**: a draft is edited directly and a closed
  year accepts reasoned corrections only, so a closed year's effective budget equals its corrected
  initial budget — no revision is ever posted to a closed year.
- Carry-in is **ledger-only** for programs and allocations. Their forms no longer accept it; a manual
  grant needs a reason and is audited, and the program page lists the receipts behind each amount. A
  recurring ops item is outside the ledger and keeps its own typed carry-in (§3.5).

- Open commitments are **not** carry-over. Committed-but-unpaid money stays a commitment until it is
  settled; only remaining budget can be carried at year close.
- A same-year settlement moves money from open commitments to spend without changing remaining: the
  money was already committed.
- Cross-year settlements and prior-year opening payments do **not** reduce the current year's
  remaining. A post-close settlement's closed-year portion does so only when it is charged to the
  current year.

### 2.6 Flags: warnings, never blocks

Flags appear as coloured badges in place and in reports. They **never prevent** saving — real data
must be recordable (BR-17). Resolve them by correcting the data or accepting them with the portfolio
owner.

| Flag | Rule | Where you see it |
| --- | --- | --- |
| Final deal price exceeds the ijin prinsip approved budget | BR-9 | Project page and project register |
| Final deal price is above the highest submitted price | BR-18 | Project page and project register |
| Lifetime commitments exceed the contract value | BR-8 | Project page and project register |
| Annual allocations exceed the project full-life allocated budget | full-life consistency (soft) | Project page |
| Allocations exceed the program's available budget | BR-7 | Program card and the program money line (`over-allocated`); reports |
| A cut left the program's remaining below zero | ADR-0006 §4 | Program money line (`unfunded`) |
| SI program budgets exceed the SI envelope | BR-2 | SI card and reports (`Over envelope`) |
| Current-year spend exceeds the fiscal-year commitments | BR-11 | Allocation card, execution summary and reports |

## 3. Set up the portfolio

Work **top-down**: strategic plan → initiatives → annual plan → programs → projects → allocations →
execution. Each step needs the step above it.

### 3.1 Strategic plan and initiatives

**Plan → Strategic plan & SIs**

1. **Create the plan**: enter **Plan name**, **Start fiscal year** and **End fiscal year**, then click
   **Create plan**. The horizon must be 1–10 years and end no earlier than it starts, and a successor's
   start year must be after every archived plan's end year (§6.6). Only one plan can be active or
   draft at a time, and only the first plan has opening balances (§3.6). Edit the existing plan to
   change its name or horizon; a horizon edit cannot exclude an existing annual plan or a project's
   full-life years (§6.6).
2. For a draft plan, the page header carries the status and an **Activate plan** form; enter a reason
   and activate it. Annual plans can only be created once the strategic plan is active. **Archive
   plan** is final: everything becomes read-only, and a successor can then be created (§6.5–6.6). A
   plan can be archived only when every annual plan under it is closed; a draft plan may also be
   archived, so a plan created by mistake is not a dead end.
3. **Add initiative** for each SI:
   - **Code** (letters, digits and hyphens, e.g. `SI-01`) and **Name**;
   - **Owner** and **Objective** (optional);
   - **Five-year envelope** — the five-year ceiling;
   - **Prior program budget consumed** — money used before Strapla (opening balance);
   - **Notes**.
4. Each initiative card shows **Envelope**, **Prior consumed**, **In-app program budgets** and
   **Headroom**, with an **Over envelope** / **Within envelope** badge (BR-2). Use **Edit
   initiative** or **Void initiative** below the card; an initiative with annual programs cannot be
   voided until its programs are voided.

**Archived plans** in the Plan sub-navigation lists every archived plan read-only — name, horizon,
archived date and archived reason — and opens each plan's read-only page (§6.6).

### 3.2 Annual plans

**Plan → Annual plans**

1. Choose a **Fiscal year** inside the horizon and click **Create annual plan**. The plan starts as a
   draft and is the only plan for that year.
2. For a draft plan, the page header carries the status and an **Activate annual plan** form; enter a
   reason and activate it when the budget is settled. Activation **freezes the program budgets**:
   from then on a budget change is a budget revision (§3.8). Non-amount fields stay editable, and the
   page header shows the revision count and how many are awaiting their decision reference.
3. A plan can be closed only through the year-close workflow (§6). The annual plan in the strategic
   plan's end year closes as a **final close** with no next-year plan (§6.5). A successor plan's first
   annual plan is created the same way once that plan is active. The **Annual plans** table lists
   fiscal year, status, program count, recurring ops count and an **Open** link; the **Program
   threads** card lists continuation chains.

### 3.3 Annual programs

Open an annual plan and use **Add annual program**:

| Field | Notes |
| --- | --- |
| Code | Suggested automatically (for example `PRG-2027-001`); unique within the plan. |
| Name | Short descriptive name. |
| Strategic initiative | One SI per program (BR-4). |
| Continues program | Optional: the prior fiscal year's program of the same SI. This creates the program thread. |
| Capex budget / Opex budget | The program's **initial** budget for the year, per component. A draft plan edits these in place; an active plan creates the program at zero and funds it by revision. |
| Notes | Free text. |

Program carry-in is not a field: the carry-over ledger delivers it (a year close, the opening import,
or a reasoned manual receipt on the annual plan page).

Rules:

- A program belongs to exactly one annual plan and exactly one SI.
- A continuation must be a program from an **earlier** fiscal year, in the same strategic plan and
  the same SI; a program cannot continue itself.
- The program card shows **Capex available (effective budget + carry-in)**, **Capex allocated** and
  **Capex unallocated**, and the same for opex. Allocating above available is flagged
  (`over-allocated`), never blocked (BR-7).
- The program page (**Thread**) carries the full money line: initial budget | carry-in received |
  revisions (with their numbers) | effective budget | allocations | open commitments | current-year
  spend | remaining, per component, plus the `over-allocated` and `unfunded` flags.
- Use **Thread** to open the cross-year program thread (§6.4).
- A program with projects, or one that a later program continues, cannot be voided; remove those
  dependencies first.

### 3.4 Projects and ijin prinsip

**Plan → Projects**

**Create project** fields:

| Field | Notes |
| --- | --- |
| Originating program | The program that originates the project. The project's SI derives from it (BR-6). |
| Name | |
| Project code | Optional; leave empty to generate the next `PRJ-<FY>-<nnn>` for the start year. Must be unique. |
| Owner | |
| External reference | Optional reference in another system. |
| Start / End fiscal year | The project's whole life; must sit inside the plan horizon and span at most 10 years. |
| Full-life allocated budget | The total planned allocation across the project's life. |
| Submitted price | The highest vendor price submitted. |
| Final deal price | The negotiated contract value (the ceiling for lifetime commitments, BR-8). |

The originating program's fiscal year must fall inside the project years, and a project cannot start
before its originating program's year. The plan must be active and the originating year open. A
project does not cross a plan boundary: its whole life must sit inside the strategic plan's horizon,
so a project that would outlive the plan must end at the boundary, and work that continues after it
starts as a new project under the successor (§6.6).

On the project page:

- **Full-life figures and pricing chain** shows allocated, approved, submitted and final deal prices,
  the opening figures, lifetime commitments and total annual allocations, with the funding flags.
- **Ijin prinsip** — one record per project: **Document number**, **Document date**, **Approved
  amount**, **Approver**, **Document link** (a URL) and **Notes**. Click **Record ijin prinsip** the
  first time and **Update ijin prinsip** afterwards; an update requires a reason. There are no file
  uploads: reference the document by number and link.
- **Annual allocations** — see §3.7.
- **Change history** lists the last 10 audited changes for the project (before/after values and
  reason); the full history is in **Administration → Audit trail**.
- **Cancel project** requires a reason and makes the project read-only. Use audited edits for
  corrections before cancelling.

### 3.5 Recurring operations

On an annual plan page, use **Add recurring ops item** for running costs such as leased lines,
existing maintenance and subscriptions:

- Fields: **Name**, **Category**, **Owner**, **Opex budget**, **Opex carry-in**, **Notes**. The
  carry-in is typed on the item — recurring operations are outside the carry-over ledger and outside
  the year close — so it is edited in place with the budget, and a closed-year correction can include
  it (§6.3).
- Recurring ops items have **no SI link and no projects**, and are **opex only** (BR-12). The opex
  budget is the item's annual budget.
- Commitments and spend are recorded on the item's own **Open commitments & spend** page.

### 3.6 Opening balances and the import wizard

The first in-app fiscal year is the year **after** the strategic plan's start year (FY2027 when the
plan starts at FY2026). The prior year is closed manually in the spreadsheets; pre-app data enters as
**opening figures**, never as reconstructed records.

Opening balances belong to the **first** strategic plan only. A successor plan does not offer the
import or the sign-off: it has no pre-app period of its own, and nothing carries across the plan
boundary (§6.6). The first plan's signed-off figures stay readable from that plan's archived page:
its **Opening balances** link opens the read-only view of the signed-off figures.

| Opening figure | Where you enter it |
| --- | --- |
| Prior program budget consumed | Strategic initiative form |
| Program carry-in (capex / opex) | Annual program form |
| Project opening allocated / open commitments / actual spend | Project form |
| Project allocation carry-in | Project year allocation form |
| Recurring ops carry-in | Recurring ops item form |

**Bulk load.** Open **Plan → Opening balances → Opening import**. The wizard loads three data sets in
this order, each depending on the one before:

1. **Strategic initiatives** — code, name, owner, objective, envelope, prior program budget consumed.
2. **Annual programs** — code, name, SI code, continuation code, capex/opex budgets and carry-in.
3. **Projects** — code, name, originating program code, years, prices, opening figures and the ijin
   prinsip record.

For each data set:

1. Choose the **Data set** and enter the **Approval reference**. Download the **CSV template** or
   **XLSX template**. The template carries the headers, type rules, an example row and the load
   reason convention, and includes the entity's active **custom fields** as extra columns. The CSV
   example row is commented out (lines beginning with `#` are ignored) and the XLSX workbook has
   `Instructions` and `Data` sheets.
2. Upload the **CSV or XLSX file** (maximum 10 MB) and click **Validate file**. Validation writes
   nothing. Unknown columns and every bad row are reported by line and column; a required custom
   field with no value fails that row. The first 100 errors are listed.
3. Click **Validate and load**. The file is re-validated and the records are written in **one
   transaction**, with one audit entry per created record using the reason
   `Opening balance — FY<closing year> close / <reference>`. Any custom-field values are stored on the
   new record and included in its audit entry. The import **creates** records and never updates
   existing ones; duplicate codes and unknown references fail the whole file.
4. The **Opening import** card on **Opening balances** then shows the record count per data set.

Allocation carry-in is **not** imported: the close writes it into the target-year allocation, and a
manual grant goes through the carry-over ledger. Plans, recurring ops, commitments and spend are form
entry only.

**Reconciliation and sign-off.** On **Plan → Opening balances**, enter the ten spreadsheet
**control totals** (the SI envelope and prior consumption are per component) and click **Save control
totals**. The comparison table shows each control total
against the in-app figure, with **Difference** and a *match* / *difference* status. A non-zero
difference is allowed but recorded. When you accept the figures, enter a **Sign-off reason** and click
**Sign off opening balances**. Sign-off is one-time and audited; the control totals then become
read-only, and later corrections to opening figures are audited edits on the records themselves.
The detailed workplan is in `docs/OPENING-BALANCE-LOAD.md`.

### 3.7 Annual allocations

A project is created once; each fiscal year gets exactly one **annual allocation**. On the project
page, use **Add annual allocation**:

| Field | Notes |
| --- | --- |
| Fiscal year program | A program in a draft or active annual plan for the project's SI, in a year inside the project's start/end years that has no allocation yet. |
| Capex allocation / Opex allocation | The project's slice of that year's program budget, per component. |
| Notes | Free text. |

Carry-in is not typed on an allocation: it is received through the carry-over ledger (the year close
writes it into the target-year allocation, the opening import supplies the first year, and a reasoned
manual receipt is possible from the annual plan page).

Rules and behaviour:

- One allocation per project per fiscal year. Use **Edit allocation** to change it (reason required);
  a voided allocation can be restored by re-adding it.
- The allocation must use a program for the project's SI (BR-6). The year must be inside the
  project's years and the annual plan must not be closed.
- Allocating above the program's available budget is flagged (BR-7), never blocked.
- Each allocation card shows **allocation**, **carry-in received** and **remaining** per component,
  plus **capex spend above commitment** / **opex spend above commitment** badges when BR-11 applies.
  The carry-in is read from the ledger, not from the guarded cache.
- **Open commitments & spend** opens the execution page for that year (§4).
- The year-close workflow writes carry-in into the next year's allocation, creating the allocation
  automatically when the project spans into the target year. A closed year's allocation accepts a
  reasoned correction of its figures (§6.3) but keeps no spend form; record new spend in the open
  year (§4.4).

### 3.8 Budget revisions (active years)

**Annual plan → Budget revisions**

Once an annual plan is **active**, its program budgets are frozen. A change — an addition, a cut, or
a switch between programs — is a **budget revision**:

| Field | Notes |
| --- | --- |
| Revision date | Defaults to today. |
| Decision reference | Optional. Leave it blank when the steering committee has not met yet; the register shows *awaiting decision reference* and **Record the decision reference** attaches it later as metadata only. |
| Reason | Required; part of the immutable record. |
| Lines | One signed delta per program and component. A switch is a balanced pair in the same component (one program down, one up); a de-allocation line lowers a project year allocation and may not go below its open commitments + current-year spend. |

Rules:

- Revisions are numbered per fiscal year (for example `REV-2027-001`), applied atomically and never
  edited or deleted — a correction is a new revision.
- Capex and opex never shift into each other; every line names one component.
- A cut that leaves a program over-allocated or unfunded is a **flag**, never a block (BR-17);
  resolve it with a later revision or a project de-allocation.
- The register lists every revision with its date, decision reference (or the awaiting badge), reason,
  total delta and each line; every program line links to that program's page.
- The annual plan header shows the revision count and how many are awaiting a decision. The plan's
  program cards show the effective budget (initial + revisions) and the initial/revision split.

## 4. Execution: commitments, spend and settlement

Open a project year allocation or a recurring ops item and click **Open commitments & spend**. The
page shows the budget summary, the commitment table and the spend table.

### 4.1 Commitments

**Record commitment** fields: **Component**, **Commitment amount**, **Commitment date** (defaults to
today), **Reference** (PO number or milestone), **Description**, and any custom fields.

- A commitment starts **open**. As spend settles it, it becomes **partially settled** and finally
  **settled**.
- Open commitments reduce remaining but are **not** carry-over.
- **Manage → Save commitment** edits the commitment (reason required) and cannot reduce the amount
  below what is already settled.
- **Void commitment** requires a reason and is refused while the commitment has settlements: void the
  settling spend first. Voiding keeps the record and its history.

### 4.2 Spend entries

**Record spend** fields: **Component**, **Spend amount**, **Spent on** (defaults to today),
**Category**, **Vendor**, **Invoice / reference**, **Description**, **Settlement classification**, and
any custom fields. The classification is:

- **Current-year spend (may settle commitments)** — the normal case; it counts in the current year
  and may settle commitments.
- **Pays a commitment made before Strapla (opening balance)** — a prior-year opening payment. It is
  excluded from the current year's remaining and reported separately. It cannot settle an in-app
  commitment.

The spend table shows the date, component, vendor/reference, amount, classification, settlements and actions. Classification badges include *current year*, *cross-year settlement*, *prior-year opening*, *closed-year charged to current year* and *closed-year reserve*.

Rules:

- Updating a spend requires a reason and cannot reduce the amount below what was settled.
- Once a spend has settlements, its **component**, **settlement classification** and **post-close
  treatment** are fixed. To change any of them, void the spend and record it again.
- **Settlement links are fixed once recorded.** To change which commitments a spend pays, void it and
  re-enter it.
- **Void spend** requires a reason and releases its settlements, so those commitments become open
  again.

### 4.3 Settlements

In the spend form, enter an amount next to each open commitment the payment settles. Leave a row blank
for none. Partial settlement and multiple commitments in one spend are allowed.

The app refuses a settlement when:

- it exceeds the commitment's open amount;
- the settlements together exceed the spend amount;
- the same commitment appears twice in one spend;
- the commitment and spend use different components or belong to a different project/item;
- the commitment belongs to a **later** fiscal year.

A settlement of a commitment from an **earlier fiscal year whose annual plan is still open** is an
ordinary **cross-year settlement**. It reduces that earlier commitment's open amount and counts as
actual spend, but it does **not** reduce the current year's remaining or enter the BR-11 comparison.
It is reported on its own line as a prior-year settlement. A settlement of a **same-year** commitment
moves money from open commitments to current-year spend and leaves remaining unchanged.

### 4.4 Post-close settlement

A spend is always recorded in an **open** fiscal year, but it may settle a commitment whose annual
plan is **closed**. The commitment's year is the year of the annual plan that owns its allocation. This
is a **post-close settlement**, and its treatment is chosen **per transaction**.

Where it happens: open the **open-year allocation for the same project** (the closed allocation has no
spend form) and use **Record spend**. The settlement picker includes earlier commitments from the same
project; a commitment from a closed year is marked **CLOSED YEAR** in the label (an earlier open year
is marked **PRIOR YEAR**). A recurring ops item only offers its own commitments, so post-close
settlement is a project-allocation workflow in practice.

When a typed settlement amount targets a closed-year commitment, the **Post-close settlement
treatment** control appears in the settlement box. Choose one:

| Option | What it does |
| --- | --- |
| **Charge to the current year (FY<current>)** — the default | The closed-year portion counts as current-year spend and reduces the current year's remaining. The closed year's figures stay frozen. |
| **Charge to the closed year (FY<closed>) — reserve** | The closed-year portion is excluded from the current year's remaining. It is reported as a prior-year settlement in the current-year report, and on the closed year's report as a **Post-close adjustments (reserve)** line per commitment fiscal year. |

The control applies **only to the closed-year portion**. Splits against open-year commitments are
always current-year, and the option is not stored when no closed-year split is in play. Under either
option the settlement is recorded the same way; only its reporting year differs.

What happens to the numbers:

- **Reserve does not reduce current-year remaining.** It is also excluded from the BR-11 current-year
  comparison. It still counts as actual spend and is reported as a prior-year settlement.
- **Charge to current year** does reduce current-year remaining and is included in BR-11.
- **The locked close snapshot and carry-over never change.** A reserve is presented outside the
  snapshot, in a separate report block, and is not added to any existing report column. The spend's
  audit entry records the chosen treatment.
- The treatment is frozen once the spend has settlements, like the component and settlement
  classification: void the spend and re-enter it to change the treatment. Voiding releases the
  settlement and removes both reporting effects.
- An earlier-year commitment whose annual plan is still open stays an ordinary cross-year settlement;
  no treatment control is offered.

### 4.5 What changes when

| Action | Open commitments | Current-year spend | Remaining | Closed-year snapshot |
| --- | --- | --- | --- | --- |
| Record a commitment | ↑ | — | ↓ | — |
| Record a spend with no settlement | — | ↑ | ↓ | — |
| Settle a same-year commitment | ↓ | ↑ (same amount) | unchanged | — |
| Cross-year settlement (earlier year still open) | ↓ | excluded | unchanged | — |
| Prior-year opening payment | — | excluded | unchanged | — |
| Post-close settlement, charge to current year | ↓ | ↑ (closed-year portion) | ↓ (closed-year portion) | unchanged |
| Post-close settlement, reserve in closed year | ↓ | excluded | unchanged | unchanged |
| Void a spend | ↑ (settlements released) | reverses its effect | reverses its effect | unchanged |
| Void a commitment (no settlements) | ↓ | — | ↑ | — |

### 4.6 Remaining and BR-11

- **Remaining** is computed per component:
  `allocation + carry-in − open commitments − current-year spend`.
- **Current-year spend** includes a closed-year portion charged to the current year and excludes
  cross-year settlement portions, reserve-treated closed-year portions and prior-year opening
  payments.
- **BR-11** warns when current-year spend exceeds the year's commitment total. It is a warning, not a
  block — invoices can arrive before commitments are updated.
- The allocation overview, execution summary, dashboard and reports use the same figures.

## 5. Reports, exports and print

### 5.1 The four reports

**Reports** contains four reports, all computed from the same data:

| Report | What it shows |
| --- | --- |
| **SI five-year view** | Envelope, prior consumption, **effective** program budgets, allocations, commitments, spend, consumed and headroom per SI, **capex and opex as separate column groups** (they never share headroom), with a per-component portfolio total. Carry-in is excluded from the envelope check by design. |
| **Annual plan by SI and program** | Every annual program with its initial budget, revisions, **effective budget**, carry-in, available, allocated and unallocated money, plus committed and spent, per component; a second table lists recurring operations with opex budget, carry-in, available, committed, spent, prior-year openings and remaining. |
| **Project register** | Full-life figures, ijin prinsip approved amount, submitted and final deal price, **effective** allocation, **carry-in**, lifetime commitments, spent to date and flags; the footer adds open commitments, prior-year opening settlements and in-app spend. |
| **Budget versus actual** | Program-level effective budget + carry-in as available money (the carry-in is its own column), allocated and unallocated per component, plus committed, spent, prior-year settlements and prior-year openings, with a status badge. A **Post-close adjustments (reserve)** block follows the table. |

Reports are read-only; all data comes from the plan, funding and execution records. Without a strategic plan each report asks you to create one first.

A row whose figures rest on a record corrected after the close carries a **Corrected after close**
badge, and the report's CSV/XLSX export gains a `Corrected after close` column (`yes` for a marked row,
blank otherwise) once at least one row is marked. A report with a marked row also carries a footnote
saying the figures shown are the live corrected figures while the close snapshot remains the historical
record. The marker is a label, not money: every total is the live corrected figure, and a totals row is
never marked.

### 5.2 CSV, XLSX and print

- **CSV** and **XLSX** download the report tables. The XLSX workbook has an **About** sheet, one sheet
  per table and raw Rupiah integers; both formats cover the **whole report**, even when a
  custom-field filter narrows the rows on screen.
- **Print / PDF** opens the browser print dialog. The app header, navigation and on-screen-only
  controls are hidden and the page is set to **A4 landscape**; use the browser's *Save as PDF* option
  to keep a copy.
- The audit trail has its own **Export CSV** under **Administration → Audit trail**.

### 5.3 Custom-field columns and filters

- The **Extra columns** control lists that report's custom fields. Tick the columns to include and
  click **Save selection**; the choice is remembered for you, per report. It also controls the
  on-screen columns. A link that carries an explicit column selection always shows exactly that
  selection, so shared links keep working. Unticking everything is remembered as "no extra columns",
  not "all".
- **Filters:** choose a **Custom field**, enter a **Value** and click **Apply filter**. Text matches
  as a case-insensitive substring; a number must be typed as digits; a date must be a real
  `YYYY-MM-DD` date. Add more filters to narrow further — they combine with **AND**. Active filters
  appear as removable chips, with **Clear all** to remove them together.
- Filters narrow the rows on screen only; **totals and exports always cover the whole report**.
- Custom-field columns and filters never change budgets, remaining, flags or any report total.

## 6. Year close and carry-over

Closing a fiscal year is a manual, audited, **irreversible** workflow. There is no reopen, no rollback
and no version restore. A close freezes the history, not the ability to fix a mistake in it: existing
records can still be corrected in place with a reason (§6.3).

### 6.1 Before you close

- The annual plan must be **active**.
- The **next fiscal year's annual plan must exist** and must not be closed — carry-over lands there.
  The one exception is the strategic plan's end year, which closes as a **final close**: it needs no
  next-year plan and carries nothing (§6.5).
- Agree the carry-over amounts and the approval reference with the portfolio owner.
- Remember: only **remaining budget** and **unallocated program budget** can be carried. Open
  commitments are not carry-over; they stay commitments.
- Any amount deliberately **not** carried needs a **not-carried reason**: the close records it in the
  immutable snapshot per entity and component. Every program row also needs a carry target: the
  continuation program when one exists, otherwise an explicit same-SI choice.
- The confirmation phrase is exactly **`CLOSE FY<year>`** (for example `CLOSE FY2027`).

### 6.2 How to close

1. Open the annual plan and click **Close fiscal year** (visible while the plan is active). The page is
   titled **Close FY<year>**.
2. Review **Close review**: target year, programs with unallocated budget, allocations with remaining,
   and the reminder that recurring ops carry-in is entered manually on the item.
3. **Program carry-over:** for each program, enter **Carry capex** and **Carry opex** (up to the
   unallocated amount shown) and choose the **Target program (FY<next year>)**. The default target is
   the continuation program when there is one. Every field must be filled in explicitly: type `0`
   for a component with no carry-over.
4. **Project allocation carry-over:** for each project, enter **Carry capex** and **Carry opex** (up to
   remaining), again typing `0` for none. The target column says whether an existing target allocation
   will receive the carry-in or whether a new one will be created. A project that ends before the
   target year cannot carry over, and the page says so.
5. Check **Carry-over totals from the amounts entered** (program and allocation, capex and opex). The
   close rejects any amount above what is available or remaining; a blank or non-numeric field blocks
   the close.
6. Enter the **Approval reference** (board approval or memo number), type the **Typed confirmation**
   phrase exactly, and click **Close FY<year> and carry over**.
7. On success the year becomes `closed`: the ledger receives one carry-in receipt per carried amount
   (with origin `close`, the approval reference and the source entity), the target programs and
   allocations show the carry-in (creating allocations when needed), and every receipt and the close
   are audited.
8. The page becomes the **close receipt**: approval reference, closed date, carried totals, the
   **close snapshot** per entity and component (available / carried / not carried / reason, with a
   link from each carried amount to its target), and the **carry-over receipts** (source entity,
   amount, target, origin, reason, who recorded it). The receipt stays reachable from the closed
   annual plan through **Close receipt**. If a record of that year is corrected later, the receipt
   gains a **Corrections after close** notice below the frozen snapshot listing the corrected records
   with their links; the snapshot itself never changes (§6.3).

In the strategic plan's end year the close page is in **final close** mode instead: it shows the
final-close notice, no carry fields and no target programs, and closing records every available amount
as not carried with a fixed reason (§6.5).

### 6.3 After the close

A closed year cannot be reopened, rolled back or restored from a version, and it accepts no new records.
It does accept **corrections**: an existing record can be updated in place, with a reason, and the change
is audited. The close decided which money moved and that decision is frozen; correcting a live figure
does not re-open it (ADR-0007).

**What can be corrected.** Six record types accept a correction after the close:

| Record | What you can change |
| --- | --- |
| Annual program | Capex and opex budget, name, notes, strategic initiative, continuation link |
| Project year allocation | Capex and opex allocation, notes |
| Project | Full-life allocated budget, submitted price, final deal price, the project's opening figures (allocated, committed, spent) and its metadata |
| Ijin prinsip | Document number, date, approved amount, approver, document link, notes |
| Recurring ops item | Opex budget and its own in-place carry-in, name, category, owner, notes |
| Commitment entry | Component, amount, commitment date, reference, description |

Any custom fields on those records are corrected with them; they remain metadata and never enter a money
rule.

**How to correct a record.** Where it happens: open the record — the annual plan page for a program or a
recurring ops item, the project page for the project or its ijin prinsip, the allocation page for a
project year allocation or a commitment, or the recurring ops item page for its commitments. On a closed
year the edit form is not shown; press **Correct record** instead. The form appears under a banner:

> This fiscal year is closed. Saving is recorded as a correction after close, and the close snapshot
> does not change.

Change the figures, give the **Reason for change** and save. The form is the same one an open year
shows, so a closed year gets no different fields and no weaker validation. In a draft or active year the
usual edit form is shown directly under the ordinary rules, and the **Correct record** button does not
appear. If you open the form by mistake, **Cancel** hides it again without saving anything.

- **The reason is mandatory and is the whole ceremony.** There is no typed confirmation and no second
  prompt; the reason is what the history and the audit trail show. A blank reason is refused — the
  reason field is required, and the server also rejects a correction without a usable reason (*Give a
  reason for a correction after close.*).
- **The record is marked.** It shows a **Corrected after close** badge. The project page's **Change
  history** records the action as *Corrected after close* with the reason and the before/after figures;
  a correction to any other record is found in the audit trail by filtering **Action** on *Corrected
  after close* (§8.2).
- **The closed annual plan lists its corrections.** The page opens with a notice that the fiscal year is
  closed, that figures can still be corrected with a reason, and that every correction is audited and
  the close snapshot stays frozen. Below it, a **Corrections after close** card shows the count and one
  row per correction — record link, record type, reason, who corrected it and when. The card appears
  only when the year has at least one correction.
- **The close receipt shows the same list.** Directly below the frozen **Fiscal year closed** snapshot, a
  **Corrections after close** section lists the corrected records with their links, type, reason, who
  corrected it and when, and says: *The close snapshot above is frozen. These records were corrected
  after the close and are shown at their live figures.* The snapshot and the receipt figures themselves
  never change.
- **Reports keep the live figures and mark the row.** The figures are the corrected ones, exactly as an
  open-year edit would move them. A row resting on a corrected record carries a **Corrected after close**
  badge, the export gains a `Corrected after close` column once a row is marked, and the report footnote
  explains that the figures are the live corrected figures while the close snapshot remains the
  historical record (§5.1). Totals are the live corrected figures; no marker changes a total.

**What a correction is not.** It is an update of a record that already exists, and nothing else:

- **No new records in a closed year** — no program, allocation, recurring ops item, project, commitment
  or spend created there. No voids or cancellations either, and no status changes.
- **No reopen, rollback, undo, version restore or hard delete**, and no second close. The plan stays
  `closed` with its original closed date.
- **No budget revision in a closed year.** Revisions are posted only to an **active** plan (§3.8). A
  corrected program budget changes the program in place, and the closed year's effective budget is its
  corrected initial budget.
- **No carry-in correction on a program or an allocation.** Their carry-in is derived from the
  carry-over ledger, not typed on the record, and the ledger is immutable. A wrong receipt is adjusted
  in the year that received it, as a budget revision. A recurring ops item is outside the ledger, so
  its single carry-in is an ordinary field and is corrected with its budget.
- **No correction of the close itself.** The close snapshot, the carry-over receipts and the
  ledger-backed carry-in caches on programs and allocations are never written by a correction: what
  was carried at the close stays carried, and the not-carried reason stays as recorded. If the close
  decided the wrong amount, the fix belongs to the receiving year (§3.8).
- **No settlement-link changes.** A closed allocation still has no spend form; a payment is recorded in
  the open year and may settle the closed-year commitment there (§4.4).
- **An archived strategic plan, a cancelled project, a voided record and a closed year itself stay fully
  read-only.** No **Correct record** affordance appears for them.

**Settlement lifecycle continues.** Existing spend entries can still be edited or voided (audited,
with a reason); voiding releases their settlements. To pay a closed-year commitment, record a new
spend in the **open** year and settle the closed-year commitment there (§4.4). That is not a
correction: it changes no closed-year plan figure, and the locked close snapshot and carry-over
figures never change.

The **Fiscal year closed** card shows the approval reference, closed date, and the carried amounts
per entity and component. The locked snapshot figures for the closed year stay frozen. The **Close
receipt** page shows the snapshot and the ledger receipts; the approval reference links to them.
Carry-in in the receiving year is read from the ledger, so a receipt list always explains the
amount, including an opening balance or a manual grant.

### 6.4 Program threads

Open **Thread** on a program card, or a thread from **Plan → Annual plans → Program threads**, to see
the program across fiscal years:

- Each year's program with plan status, effective budget, revisions, carry-in, allocated,
  unallocated and project count.
- **Money line** for the selected program: initial budget | carry-in received | revisions (with their
  numbers) | effective budget | allocations | open commitments | current-year spend | remaining, per
  component, plus the `over-allocated` and `unfunded` flags. The receipts behind the carry-in are
  listed underneath with their origin, approval reference and source entity.
- **Carry-in reconciliation** — ledger receipts against the carry-in on the continuation program,
  with the approval reference and a badge: *carry-in includes the close* or *carry-in below the close
  snapshot*.
- The current program links back to the prior year's program. Program carry-in can also come from an
  opening-balance receipt or a reasoned manual grant; both appear in the ledger with an origin.

### 6.5 Final close

The annual plan in the strategic plan's **end year** closes as a **final close** — the only close that
needs no next-year annual plan. Every other year keeps the ordinary close and its next-year target
(§6.1).

- The close page shows **Final close** and the notice:

  > This is the strategic plan's final fiscal year. Nothing is carried across the plan boundary:
  > every available amount is recorded as not carried, with the reason below. Close the year, then
  > archive the plan.

- There are **no carry fields and no target programs**: there is no next year inside the plan, so no
  amount is entered and no carry-over receipt is written.
- The **Approval reference** and the typed confirmation phrase (`CLOSE FY<year>`) are still required,
  and the button reads **Close FY<year> as the final close**.
- On success, every available amount — program unallocated and allocation remaining, per component —
  is recorded in the close snapshot as **not carried**, with the recorded reason *Final close:
  FY<year> is the last year of the strategic plan. No carry-over crosses the plan boundary.*
- The snapshot invariants still hold: `available = carried + not carried`, and `carried` equals the
  carry-over entries written for that entity and component — zero.
- The year is then closed and read-only like any closed year: corrections of existing records remain
  available (§6.3), but there is no reopen and no second close.

The final close does not archive the plan by itself — archive it next (§6.6), after the year is
closed. To end a plan before its planned end year, shrink the horizon first (§6.6, step 1): that is
what makes the new last year the final close.

### 6.6 Ending a plan and starting the successor

When the horizon ends — or the owner ends the plan early — the portfolio moves to a **successor plan**.
Nothing crosses the boundary. Four steps:

1. **Shrink the horizon if the plan ends early.** Edit the plan and set **End fiscal year** to the
   last year that still contains every annual plan and every project's full-life years. A save that
   would exclude an annual plan or a project is refused, and the message names the offending year or
   project. Only the end year moves: the start year is the opening-balance bridge year, so once the
   balances are signed off it cannot change. A plan that runs to its planned end skips this step.
2. **Final-close the last annual plan** (§6.5). It needs no next-year annual plan and carries nothing.
3. **Archive the plan.** **Archive plan** becomes possible once every annual plan under it is closed,
   and it is final: the plan becomes read-only. A draft plan may be archived directly, which is how a
   mistaken plan is retired without activating it.
4. **Create the successor.** With no plan active or draft, **Create the successor plan** appears on
   **Plan → Strategic plan & SIs**. Its **Start fiscal year** defaults to the year after the most
   recent archived plan and must be after every archived plan's end year, so horizons never overlap.
   It starts as an empty draft — no initiatives, programs, projects, allocations or budget are
   copied. Add the initiatives, activate the plan, then create its first annual plan from its start
   year under **Plan → Annual plans**.

Between steps 3 and 4 the archived plan stays visible read-only with a prompt to create the successor
— the notice *This plan is archived and read-only. Create a successor plan to continue the
portfolio.* — so the portfolio never falls back to an empty state.

**What does not cross the boundary.**

- **No budget or carry.** The final close carries zero and writes no carry-over entry, so the
  successor has no carry-in from the archived plan and no cross-plan ledger exists.
- **No copy-forward.** Initiatives, programs and projects are not cloned into the successor; there is
  no "copy last plan" action.
- **No project crosses.** A project's years must sit inside its plan (§3.4); work that continues after
  the boundary starts as a new project under the successor, with its own full-life budget and
  procurement record.
- **No plan switcher and no combined report.** Every surface works with the current plan — the
  non-archived plan when one exists, otherwise the most recent archived plan. Reports never combine
  plans.
- **No opening balances.** They belong to the first plan only (§3.6); the successor does not offer
  the import or the sign-off, and the first plan's signed-off figures stay readable from its archived
  page.
- **No restore.** An archived plan cannot be made active or draft again, and a closed year cannot be
  reopened; a wrong succession is corrected by starting another successor, never by undoing it.

**Archived plans.** **Plan → Archived plans** lists every archived plan with its name, horizon,
archived date and archived reason (the reason typed when the plan was archived, read from the audit
trail). Each opens a read-only archived plan page: the plan's initiatives with their envelope figures,
its annual plans, annual programs and projects, and links into the existing read-only annual plan,
program, project and allocation pages. There are no add, edit, archive or void controls anywhere on an archived plan; for
the first plan, the page also links to its signed-off opening balances (§3.6).

## 7. Dashboard

The **Dashboard** summarises portfolio health for the **current plan** — the non-archived plan, or the
most recent archived plan while a successor is being set up (§6.6):

- **Stat cards** — **Capex envelope** and **Opex envelope** (with consumed and remaining per
  component), **Effective budget** (initial + posted revisions), **Carry-in received** (a separate
  input), Allocated, Open commitments, In-app spend, Remaining, Fiscal-year commitments, and Flags
  (with a count of over-allocated programs and flagged projects). The budget and carry-in are never
  folded into one figure.
- **Plan versus execution** — available (effective budget + carry-in), **program carry-in**,
  allocated, open commitments, current-year spend and remaining for capex, opex and the total, with
  the cross-year and prior-year opening amounts excluded underneath.
- **Fiscal years** — every annual plan with its status, program and recurring-ops counts; a closed year
  also shows its approval reference and close date.
- **Program threads** — continuation chains across years.
- **Recent activity** — the latest five audited changes, with a link into the audit trail.
- **Quick links** — Plan overview, Projects & allocations, Opening balances, Funding & flags, Reports & exports, Members, Audit trail and Annual plans & close.

Use it for weekly or monthly reviews and before director/finance meetings; the reports remain the
detailed, exportable sources.

## 8. Administration

### 8.1 Members

**Administration → Members**

- **Create member**: **Name**, **Email** and **Initial password** (at least 12 characters). Hand the
  password over out of band; the member has no email invitation and changes it only through an
  administrator reset.
- The **Accounts** table shows name/email, status, active sessions and created date, with **Manage**
  actions:
  - **Reset password** — sets a **New password** (at least 12 characters), requires a reason and
    revokes all of the member's sessions.
  - **Revoke sessions** — signs the member out everywhere (reason required).
  - **Deactivate member** — requires a reason, revokes all sessions and blocks sign-in. You cannot
    deactivate yourself or the **last active account**.
  - **Activate member** — restores the account (reason required); sessions are not restored, so the
    member signs in again.
- Accounts are never deleted; their history and audit references stay.

### 8.2 Audit trail

**Administration → Audit trail**

- Every change is recorded with actor, action, entity, before/after values, reason and timestamp. The
  trail is append-only and is written in the same transaction as the change.
- **Search and filter**: free-text **Search** across actor, entity id, action and reason; filters for
  **Entity type**, **Action** and **Actor**. The screen shows the latest **200** matching entries.
- **Export CSV** downloads the filtered trail, up to **5000** entries.
- **Show values** expands the before/after JSON in place.
- Custom-field values appear in the before/after values under `customFields`. The five custom-field
  actions and the entity are shown in readable words (*Custom field created / updated / removed /
  restored / reordered*, entity *Custom field*); a report column-selection save appears as *Report
  column selection saved*. The filter keeps machine tokens as its values.
- A closed-year save is shown as *Corrected after close* rather than the ordinary `update` token, and
  the **Action** filter offers it by name, so you can list every correction in the plan. The reason
  typed on the correction form is on the entry, with the before/after figures.
- The project page also has a **Change history** card with the last 10 entries for that project.

### 8.3 Custom fields

**Administration → Custom fields**

- Add extra typed fields to eight record types: **strategic initiatives**, **annual programs**,
  **projects**, **recurring ops items**, **ijin prinsip records**, **project year allocations**,
  **commitment entries** and **spend entries**. The strategic plan and annual plan are deliberately
  excluded: they are plan-level records rather than per-project data.
- A field has a **Field name**, a **Type** (text, number or date), a **Required** flag, a
  **Description** (required) and an optional **Example value**. Every change is audited; editing,
  removing and restoring require a reason, while moving a field is audited without one.
- Type rules: **text** is free text up to 2000 characters; **number** is a whole number written as
  digits with an optional minus (thousands separators are refused); **date** is a real calendar date
  written `YYYY-MM-DD`. A **required** field must have a value whenever its form is saved, so making
  an existing field required means the next save of a record must fill it in. **Example value** is a
  display hint and the opening-import example only; it must match the type and is never stored on a
  record.
- The list shows each field's stable machine **key** and how many records hold a value. Use **Move up**
  / **Move down** to order a record type's fields; the order applies everywhere the fields appear, and
  new fields are added at the end.
- **Remove field** archives it: it disappears from forms, record pages, reports and exports, its
  recorded values are kept but hidden, and its name can be reused. The **Archived fields** section
  lists the name, key, type, archived date, reason and usage. **Restore field** (with a reason) brings
  it back on every surface; it is refused while an active field on that record type already uses the
  same name or key.
- Values appear on the create/edit form, in an **Additional fields** panel on the record, as report
  columns and in exports; the opening import includes the entity's fields as extra template columns,
  and a required field missing from a row fails that row with its line number.
- Custom fields are **metadata**: they never change budgets, remaining amounts, flags, allocations or
  report totals, and the field list applies to this deployment only.

### 8.4 Corrections policy

- Nothing is hard-deleted. Wrong data in an open year is corrected with an audited edit (reason
  required), or the record is voided/cancelled with a reason. A program budget in an **active** year
  changes through a budget revision, not an in-place edit (§3.8).
- A closed year accepts **audited corrections**: in-place updates of existing records of the six
  correctable types, each with a reason, recorded in the audit trail under *Corrected after close*
  rather than as an ordinary edit (§6.3). The server derives "this is a correction" from the annual
  plan's status when it saves, so there is no override switch a client could set, and a correction
  never writes the close snapshot, the carry-over ledger or the ledger-backed carry-in caches on
  programs and allocations (a recurring ops item's carry-in is an ordinary field and is corrected
  with it). The live figures move and the close snapshot stays the historical record.
- Everything else still refuses in a closed year: no creates, no voids or cancellations, no status
  changes, no budget revision (revisions stay active-only), no reopen, rollback, undo or version
  restore, and no edits to settlement links. Settlement lifecycle events remain available: editing or
  voiding an existing spend (audited with a reason), and a payment recorded in an open year that
  settles a closed-year commitment (§4.4). New plan records belong to open years.
- If a figure is wrong in a way a correction does not cover — for instance the close itself recorded
  the wrong amount — do not attempt a database edit. The receiving year is corrected with a budget
  revision (§3.8); otherwise document the problem and raise it with the engineering lead or as a
  GitHub issue.

## 9. The annual cycle: checklist

**Before the fiscal year**

- [ ] Strategic plan created and **active**; SIs with envelopes and prior consumption up to date.
- [ ] Annual plan created and **active**; programs created with their capex/opex initial budgets and continuation links. Any later budget change is a **budget revision** (§3.8), and carry-in arrives through the ledger (§6).
- [ ] Projects created with full-life figures and ijin prinsip, and their annual allocations entered; recurring operations items created with their opex budgets and carry-in.
- [ ] Opening balances loaded and reconciled (ten per-component control totals), then signed off (first in-app year only).
- [ ] When the year closes: review the carry receipt (snapshot + receipts) and confirm every partial carry has a not-carried reason.

**During the year**

- [ ] Commitments recorded when POs/contracts are issued.
- [ ] Spend recorded when invoices are booked; settle commitments where applicable.
- [ ] Post-close payments recorded in the open year with the correct treatment.
- [ ] Review the dashboard and reports monthly; resolve flags or accept them with the owner.
- [ ] Export the reports before director/finance reviews.

**Year end**

- [ ] Ensure the next year's annual plan exists and is not closed — except in the strategic plan's end year, which closes as a final close with no next-year plan (§6.5).
- [ ] Agree the carry-over amounts and the approval reference.
- [ ] Close the fiscal year (typed phrase `CLOSE FY<year>`) and verify the carry-in on the next year's programs and allocations.
- [ ] Reconcile the program threads' carry-in against the close snapshot.
- [ ] Confirm that open commitments remain open and are not expected as carry-over.

**After the year**

- [ ] Fix a wrong closed-year figure with **Correct record** (reason required). Check the record's **Corrected after close** badge, the **Corrections after close** notice on the close receipt and the marker on the affected reports; the close snapshot and the carry-over receipts must stay unchanged.

**When the plan ends**

- [ ] Decide whether it is the planned end or an early termination; for an early end, first shrink the plan's **End fiscal year** to the last year that still contains every annual plan and project's full-life years (a wider cut is refused and names the record, §6.6).
- [ ] Final-close the annual plan in the plan's end year — no next-year plan, nothing carried (§6.5).
- [ ] Archive the plan, then create the successor (its start year must be after the archived plan's end year), add its initiatives, activate it and create its first annual plan (§6.6).
- [ ] Confirm the archived plan is listed under **Plan → Archived plans** with its archived date and reason, its read-only page and the first plan's signed-off opening balances read correctly, and every other surface shows the successor.

## 10. Reference

### 10.1 Field reference

| Record | Fields |
| --- | --- |
| Strategic plan | name, start/end fiscal year, status (draft, active, archived) |
| Strategic initiative | code, name, owner, objective, envelope, prior program budget consumed, notes |
| Annual plan | fiscal year (one per year), notes, status |
| Annual program | code, name, SI, continues program, capex/opex budget, capex/opex carry-in, notes |
| Project | originating program, name, code, owner, external reference, start/end fiscal year, full-life allocated budget, submitted price, final deal price, description; opening allocated / open commitments / actual spend; status |
| Ijin prinsip | document number, document date, approved amount, approver, document link, notes |
| Project year allocation | fiscal year program, capex/opex allocation, capex/opex carry-in, notes |
| Recurring ops item | name, category, owner, opex budget, opex carry-in, notes |
| Commitment entry | component, amount, commitment date, reference, description |
| Spend entry | component, amount, spent-on date, category, vendor, invoice/reference, description, settlement classification, settlement splits, post-close treatment |
| Year close | approval reference, typed confirmation, carry amounts and target programs per program, carry amounts per project allocation; in the plan's end year, final-close mode (approval reference and typed confirmation only) |
| Custom field | field name, type (text, number, date), required flag, description, example value, order, machine key; active or archived |

### 10.2 Status transitions

```
Strategic plan:   draft ──activate──▶ active ──archive──▶ archived (read-only, final)
                  draft ──archive──▶ archived (no annual plans to close)
                  archived ──create──▶ successor draft (start year after the archived horizon)
Annual plan:      draft ──activate──▶ active ──close────▶ closed (corrections only, no reopen;
                                                           the plan's end year is a final close)
Project:          active ──cancel───▶ cancelled (read-only)
Commitment:       open ──settle──▶ partially settled ──settle──▶ settled   (or void)
Spend:            recorded ──void──▶ voided (releases its settlements)
Custom field:     active ──remove──▶ archived ──restore──▶ active
Member account:   active ──deactivate──▶ deactivated ──activate──▶ active
```

### 10.3 Common messages and what to do

| Message | Meaning | What to do |
| --- | --- | --- |
| `Email or password is incorrect.` | Wrong credentials (or a deactivated account). | Check the email and password; an administrator can reset it. Repeated failures trigger the rate limit. |
| `Too many attempts. Try again in 15 minutes.` | Sign-in rate limit for that email. | Wait for the window to pass, then try again. |
| `Your session ended. Sign in again to continue.` | The session expired, was revoked, or the account was deactivated. | Sign in again; if it repeats, ask an administrator to check the account. |
| `Password must be at least 12 characters.` | Setup, member creation or password reset. | Use a password of at least 12 (and at most 200) characters. |
| `Activate the strategic plan before creating annual plans.` / `... before creating projects.` | The strategic plan is not active. | Activate the plan in its page header. |
| `The strategic plan “<name>” is still <status>. Archive it before creating a successor plan.` | An active or draft plan exists, so no successor can be created yet. | Close its open annual plans (the plan's end year as a final close), then archive it and create the successor (§6.6). A mistaken draft plan can be archived directly. |
| `The successor plan must start after FY<year>, the end of “<plan name>”.` | The new start year overlaps an archived plan's horizon. | Choose a start year after the archived plan's end year; the form defaults to the first free year (§6.6). |
| `Every annual plan must be closed before the strategic plan is archived: FY<year> is still <status>.` | The plan still has an open annual plan. | Close that year (as a final close if it is the plan's end year) before archiving (§6.5–6.6). A draft plan with no annual plans can be archived directly. |
| `Another strategic plan is active. Archive it before activating this one.` | Only one plan may be active at a time. | Archive the active plan first, then activate this one. |
| `The opening balances for FY<year> are signed off, so the start fiscal year cannot move. Shrink the plan horizon from the end year instead.` | The edit would move the start year the signed-off opening-balance bridge was based on. | Keep the start year and shrink only the end year (§6.6). |
| `The new horizon excludes the FY<year> annual plan. An annual plan must stay inside the plan horizon.` | A horizon edit would leave an annual plan outside the plan. | Keep that year inside the horizon: a horizon can only shrink to the last year that has an annual plan or project (§6.6). |
| `The new horizon excludes project <code> (FY<start>–FY<end>). A project's full-life years must stay inside the plan horizon.` | A horizon edit would cut a project's life. | Keep the project's years inside the horizon; work continuing after the boundary starts as a new project under the successor (§6.6). |
| `This plan is archived and read-only. Create a successor plan to continue the portfolio.` | The current plan is archived and has no successor yet. | Create the successor from the same page; the archived plan is history until then (§6.6). |
| `This strategic plan is archived and read-only.` | A write was attempted on an archived plan. | Archived plans accept no changes; read it under Plan → Archived plans (§6.6). |
| `Opening balances are recorded once, for the first plan. A successor plan starts without them; the first plan's signed-off figures remain readable from its archived plan page.` | A successor plan is selected under Opening balances. | Nothing to load or sign off there; read the first plan's archived page (§3.6). |
| `This fiscal year is closed and read-only.` / `That fiscal year is closed and read-only.` / `The originating fiscal year is closed and read-only.` | The annual plan behind the record (or the project's originating year) is closed, and this action is not allowed in a closed year. | Creates, voids and status changes need an open year. A closed year accepts reasoned corrections of existing records (§6.3) and settlement lifecycle writes. |
| `Give a reason for a correction after close.` | A correction was submitted without a usable reason. | Enter the reason for the correction; it is stored on the audit entry and shown in the record's history. |
| `This commitment has settlements. Void the settling spend entries first.` | A settled commitment cannot be voided. | Void the spend entries that settled it. |
| `The commitment cannot be reduced below the already settled amount (Rp …).` | Edit target is below settled money. | Raise the amount or reverse settlements by voiding the spend. |
| `The spend amount cannot be reduced below the settled amount.` | Edit target is below settled money. | Keep the amount at or above the settled total, or void and re-enter. |
| `A prior-year opening payment cannot settle an in-app commitment.` | A prior-year opening spend has settlement rows. | Remove the settlement split, or use current-year spend. |
| `Void the spend entry and re-enter it to change its component.` / `... settlement classification.` / `... post-close treatment.` | The spend has settlements and one of these is frozen. | Void the spend and record it again with the correct choice. |
| `Opening balances are signed off; correct records with audited edits.` | The reconciliation is signed off and its totals are read-only. | Correct the opening figures on the records with a reason. |
| `Enter the approval reference for the load.` / `Choose a CSV or XLSX file to import.` / `The file is larger than 10 MB.` | Opening import preconditions. | Enter the reference and choose a CSV/XLSX file no larger than 10 MB. |
| `The FY2028 annual plan does not exist yet; create it before closing.` | Year close has no target. | Create the next year's annual plan first. |
| `Only an active annual plan can be closed.` | The plan is draft or already closed. | Activate the plan before closing. |
| `Type "CLOSE FY2027" exactly to confirm the close.` | Wrong confirmation phrase. | Type the phrase exactly, including case and spacing. |
| `Choose a target program for …` | A carry amount has no target program. | Select the target program in the close form. |
| `A blank or non-numeric field blocks the close.` / `… carry-over is required (use 0 for none).` | A carry field was left empty. | Type `0` for every component with no carry-over. |
| `Part of the available amount is not carried: a reason is required.` | A partial carry (including 0) needs the owner's reason for the rest. | Enter the not-carried reason on that row; the close snapshots it. |
| `Budget revisions are only posted once the annual plan is active…` | The year is a draft. | Edit the draft program budgets in place; revisions begin after activation. |
| `… lines do not balance: a switch must net to zero…` | A revision mixes an increase and a decrease per component without netting to zero. | Make it a balanced switch in the same component, or two separate documents (a pure cut and a pure addition). |
| `A revision can only de-allocate a project year allocation; it cannot add money to one.` | An allocation line is positive. | Use a negative amount; revisions never add money to an allocation. |
| `Capex and opex never offset each other…` | One component nets positive while the other nets negative. | Post separate revisions per component; a cut is "just gone", not moved to the other component. |
| `You cannot deactivate your own account.` / `The last active account cannot be deactivated.` | Member-management guard. | Keep at least one active administrator and use another admin for your own account. |
| `Cannot restore “…”` … | A custom-field name or key already exists on that record type. | Rename the active field or use another name before restoring. |

## 11. FAQ

**Is there a default administrator username or password?**
No. A fresh database has no account; open `/setup` and create the first administrator. Every other
account is created in Administration → Members.

**Why can I not edit a program budget any more?**
The annual plan is **active**, so its program budgets are frozen. Post a **budget revision** instead
(§3.8): it is numbered, immutable and audited, and its deltas build the effective budget that every
screen and report uses. A draft year is still edited in place; a closed year accepts reasoned
corrections only (§6.3).

**Where does carry-in come from, and why can I not type it?**
For a program or allocation, carry-in is a receipt in the append-only carry-over ledger — written by a
year close, by the opening balance load, or by a reasoned manual grant on the annual plan page. The
program/allocation `carry_in_*` fields are only a cache that the ledger service keeps equal to the
receipts; no form writes them. The program page lists the receipts, so every carry-in amount has
provenance. A recurring ops item is outside the ledger and outside the year close: its single **Opex
carry-in** is an ordinary field you type, edited with the item like its budget (and correctable after
close, §6.3).

**What does "awaiting decision reference" mean on a revision?**
The revision was posted before its formal budget decision existed. The lines and totals are already
frozen; **Record the decision reference** on the register attaches the reference later as metadata
and is audited. It is not an approval step and it cannot change the amounts.

**Who can do what?**
Every signed-in account is an administrator: all accounts can manage members, edit open-year data,
correct a closed-year record with a reason, and use every screen. There are no editor or viewer roles in
this release, and no self-service sign-up.

**Can I delete accounts, projects or records?**
No. Accounts are deactivated; plan records are voided or cancelled with a reason and stay in history
and in the audit trail.

**Can I reopen a closed year or roll back?**
No. Closing is irreversible and there is no version restore. Existing records can still be corrected
with a reason (§6.3), and settlement lifecycle events continue.

**How do I start a new strategic plan when this one ends?**
Final-close the annual plan in the plan's end year (§6.5) — it needs no next-year plan and carries
nothing — archive the plan, then create the successor under **Plan → Strategic plan & SIs**; its start
year must be after the archived plan's end year. Add the initiatives, activate it and create its first
annual plan (§6.6). To end a plan before its planned end year, first shrink its **End fiscal year**,
which is refused if the new horizon would exclude an annual plan or a project.

**Do opening balances or projects carry into the successor plan?**
No. Nothing crosses the plan boundary: the final close carries zero, the successor starts empty, and
opening balances are a first-plan load. A project must end inside its plan, so work that continues
after the boundary starts as a new project under the successor (§6.6). The first plan's signed-off
opening balances stay readable from its archived page (§3.6).

**How do I fix a wrong figure in a closed year?**
Open the record — the annual plan page, the project page, the allocation page or the recurring ops item
page — and press **Correct record**. The edit form appears under a banner saying the year is closed;
change the figure, give the **Reason for change** and save. The save is audited as *Corrected after
close*, the record shows the badge, the annual plan's **Corrections after close** card and the close
receipt's notice list it, and the reports show the live corrected figure with the same marker. The close
snapshot and the carry-over figures do not change. There is no typed confirmation.

**Can I import a spreadsheet?**
Only the opening balances: **Plan → Opening balances → Opening import** takes CSV/XLSX files for
strategic initiatives, annual programs and projects, and includes the active custom fields. All other
data is entered through the forms. The import validates first and writes nothing on a bad file.

**Can I attach documents?**
No. Ijin prinsip documents are referenced by number and link (URL). The only file upload is the
opening-balance import file.

**Are there email notifications or password-reset emails?**
No. The dashboard and reports are the review surfaces; administrators hand over passwords out of band.

**Why is spend different from a commitment?**
A commitment is money promised (PO/contract). Spend is money actually booked (invoice). Settling a
same-year commitment with a spend does not change remaining because the money was already committed.

**What is a cross-year settlement?**
A spend in year N paying a commitment from an earlier year that is still open. It counts as actual
spend but does not reduce year N's remaining; it appears as a prior-year settlement line.

**What is a post-close settlement, and what does "reserve" mean?**
A spend in an open year paying a commitment whose annual plan is already closed. Charging it to the
current year counts it in current-year spend and remaining; reserving it in the closed year leaves the
current year's remaining untouched, reports it as a prior-year settlement in the current-year report
and as a **Post-close adjustments (reserve)** block in the closed year's report. The close snapshot and
carry-over never change either way.

**Can I change the settlement treatment after saving?**
No. The treatment is frozen once the spend has settlements. Void the spend and record it again with
the other choice.

**What can I not fix in a closed year?**
You cannot create, void or change the status of a record, post a budget revision, edit settlement links,
repeat the close, or change the close snapshot, the carry-over receipts or the carry-in on a program or
allocation. A program's or allocation's carry-in is ledger-derived and immutable; a wrong receipt is
fixed in the receiving year with a budget revision. A recurring ops item's own carry-in is an ordinary
field, not ledger money, so it is corrected with the item's budget. An archived strategic plan, a
cancelled project and a voided record stay fully read-only. There is no reopen, rollback, undo or
version restore.

## 12. Known limitations

- One strategic plan active or draft at a time, with a successor after it is archived; one annual plan
  per fiscal year; plan horizon 1–10 years. Nothing carries across a plan boundary, a project cannot
  outlive its plan, archived plans are read-only and are never restored, and opening balances belong to
  the first plan only (§6.5–6.6).
- No reopen, rollback, undo or version restore. A closed year accepts reasoned, audited corrections of
  existing plan records (annual programs, project year allocations, projects and their ijin prinsip and
  opening figures, recurring ops items and commitment entries), but no creates, voids, status changes or
  budget revisions, and the close snapshot, the carry-over receipts and the ledger-backed carry-in
  caches on programs and allocations never change (a recurring ops item's typed carry-in is corrected
  with the item). Closed-year spend entries can only be edited or voided as settlement lifecycle events.
- One role: every account is an administrator. No editor/viewer roles, SSO, self-service sign-up or
  email notifications (including password resets).
- No file uploads except the opening-balance CSV/XLSX import (maximum 10 MB), and no CSV/XLSX import
  outside opening balances. Ijin prinsip documents are referenced by number and link.
- No per-vendor quote records (one **submitted price**, the highest quote, per project) and no
  payment-status or payment-date tracking (spend is the realized record).
- Spend categories come from a fixed reference list seeded by the deployment (Hardware; Software &
  Licenses; Cloud & Hosting; Professional Services; Maintenance & Support; Connectivity; Training;
  Other); there is no category administration screen in this release.
- The audit trail screen shows the latest 200 matching entries; CSV export is limited to 5000.
- Amounts are whole Rupiah with no decimals; type digits (dots and spaces are ignored, commas are not accepted).
- Recurring operations are opex-only with no SI link and no contract value, by design.
- Only projects with an allocation in an in-app fiscal year receive in-app spend and commitments;
  earlier projects are opening figures, not records.
- The interface is in English, retaining Indonesian domain terms (ijin prinsip, Rupiah). Only the
  project page has a **Change history** card; use the audit trail for other records.

## 13. Support and further reading

- **Release notes and changelog**: `docs/RELEASE-NOTES-0.5.0.md` (what is in v0.5.0, upgrade notes and limitations) and `CHANGELOG.md` (full release history).
- **Go-live checklist**: `docs/GO-LIVE-CHECKLIST.md` — deployment and first-week checks.
- **Opening-balance workplan**: `docs/OPENING-BALANCE-LOAD.md` — the FY2026 cut-over in detail.
- **UAT plan**: `docs/UAT-PLAN.md` — acceptance scenarios and sign-off.
- **Operations**: `docs/operations.md` — deployment, images/versions, backup and restore.
- **Charter and ADRs**: `docs/CHARTER.md` and `docs/adr/` — the product and technical decisions;
  `GLOSSARY.md` is the canonical vocabulary.
- **Defects and feedback**: raise a GitHub issue at <https://github.com/tahopetis/strapla/issues> with the page, the steps, expected and actual results, and a screenshot. Data-value defects that block the plan are treated as release blockers.

The in-app **Help** page contains a condensed version of this guide for day-to-day use.
