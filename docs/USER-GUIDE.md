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
| Guide last updated | 2026-11-22 |
| Audience | Finance and portfolio administrators |
| App scope | Plan, funding and execution, year close, reports, dashboard, administration, help |
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
  **Annual plans**, **Projects**, **Opening balances**.
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
- **Closed years block ordinary writes.** Forms disappear or refuse with a closed-year message once an
  annual plan is closed (see [6.3 After the close](#63-after-the-close)).

## 2. Core concepts

### 2.1 The portfolio hierarchy

```
Strategic plan (e.g. 2026–2030; one per deployment)
└── Strategic initiative (SI) — five-year envelope, prior consumption
    └── Annual plan (exactly one per fiscal year; draft → active → closed)
        └── Annual program (one SI; capex + opex budget; carry-in; continuation link)
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

### 2.2 The objects in one table

| Object | What it represents | Where you manage it |
| --- | --- | --- |
| **Strategic plan** | The multi-year horizon (start/end fiscal year) and its status. One plan per deployment. | Plan → Strategic plan & SIs |
| **Strategic initiative (SI)** | A five-year envelope: code, name, owner, objective, prior program budget consumed. | Plan → Strategic plan & SIs |
| **Annual plan** | One fiscal year inside the horizon; draft → active → closed. | Plan → Annual plans |
| **Annual program** | A budget line for one SI in one year: capex budget, opex budget, carry-in, optional continuation. | Annual plan page |
| **Project** | The whole-life investment record: full-life allocated budget, submitted price, final deal price, years, owner, originating program. | Plan → Projects |
| **Ijin prinsip** | The directors' in-principle approval for a project: document number, date, approved amount, approver, document link. | Project page → Ijin prinsip |
| **Project year allocation** | The project's slice of a program's budget in one fiscal year: allocation and carry-in per component. | Project page → Annual allocations |
| **Recurring ops item** | An opex-only running cost item under an annual plan (no SI, no project). | Annual plan page |
| **Commitment entry** | A purchase order or contract milestone attached to an allocation or recurring ops item. | Open commitments & spend |
| **Spend entry** | Realized spend (for example an invoice) with category, vendor and reference. | Open commitments & spend |
| **Settlement** | The link recording that a spend entry pays part or all of a commitment. | Recorded with the spend entry |
| **Carry-over** | Budget remaining at year close, explicitly moved into the next fiscal year with an approval reference. | Annual plan → Close fiscal year |
| **Custom field** | An administrator-defined extra typed field on eight record types. Metadata only; never part of money rules. | Administration → Custom fields |

### 2.3 Statuses and what changes them

| Record | Statuses | What changes it |
| --- | --- | --- |
| Strategic plan | `draft`, `active`, `archived` | **Activate plan** / **Archive plan** in the page header (reason required). Archived is final and read-only. |
| Annual plan | `draft`, `active`, `closed` | **Activate annual plan** in the page header; **Close fiscal year** workflow. Closed is read-only (see §6). |
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
| **Program budget** | The budget for one SI in one fiscal year, per component. |
| **Available program budget** | `budget + carry-in`. |
| **Unallocated program budget** | `available − allocations`. Always visible; allocating above it is flagged, not blocked. |
| **Allocation** | The project's slice of a program's available budget for one fiscal year. |
| **Carry-in** | Budget explicitly carried in from a previous year (or the opening balance). It adds to available money but is not part of this year's program budget. |
| **Carry-over** | The amount moved into next year at close, per component, with an approval reference. |
| **Commitment** | Money promised (PO / contract milestone) but not necessarily paid yet. |
| **Open commitment** | `commitment amount − settled amount`. Open commitments reduce remaining but are **not** carry-over. |
| **Spend** | Realized money booked (for example an invoice). |
| **Settlement** | The part of a commitment paid by a spend entry. Partial settlement is allowed. |
| **Cross-year settlement** | A spend in year N paying a commitment from an **earlier open year**. Counted as actual spend, but does not reduce year N's remaining. |
| **Prior-year opening payment** | A spend paying a commitment that existed before Strapla. Excluded from the current year's remaining; reported separately. |
| **Post-close settlement** | A spend in an open year paying a commitment whose annual plan is **closed**. The closed-year portion is either charged to the current year or reserved in the closed year. |
| **Post-close adjustment (reserve)** | The closed year's separately labelled report line for reserve-treated post-close settlements. Never part of the locked close snapshot or carry-over. |
| **Remaining** | `allocation + carry-in − open commitments − current-year spend`, per component. |
| **Lifetime commitments** | Opening committed + all in-app commitment amounts of a project; compared with the contract value (BR-8). |

### 2.5 Two formulas to remember

```
Remaining (per component)   = allocation + carry-in − open commitments − current-year spend
Unallocated program budget  = budget + carry-in − allocations
```

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
| Allocations exceed the program's available budget | BR-7 | Program card (`over-allocated`) and reports |
| SI program budgets exceed the SI envelope | BR-2 | SI card and reports (`Over envelope`) |
| Current-year spend exceeds the fiscal-year commitments | BR-11 | Allocation card, execution summary and reports |

## 3. Set up the portfolio

Work **top-down**: strategic plan → initiatives → annual plan → programs → projects → allocations →
execution. Each step needs the step above it.

### 3.1 Strategic plan and initiatives

**Plan → Strategic plan & SIs**

1. **Create the strategic plan**: enter **Plan name**, **Start fiscal year** and **End fiscal year**,
   then click **Create plan**. The horizon must be 1–10 years and end no earlier than it starts. This
   release supports **one plan per deployment**: edit the existing plan to change its name or horizon
   (archiving it is final and does not free the slot for a new plan).
2. For a draft plan, the page header carries the status and an **Activate plan** form; enter a reason
   and activate it. Annual plans can only be created once the strategic plan is active. **Archive
   plan** is final: everything becomes read-only, and no replacement plan can be created in this release.
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

### 3.2 Annual plans

**Plan → Annual plans**

1. Choose a **Fiscal year** inside the horizon and click **Create annual plan**. The plan starts as a
   draft and is the only plan for that year.
2. For a draft plan, the page header carries the status and an **Activate annual plan** form; enter a
   reason and activate it when the budget is settled. Programs stay editable until the close.
3. A plan can be closed only through the year-close workflow (§6). The **Annual plans** table lists
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
| Capex budget / Opex budget | The program's budget for the year, per component. |
| Capex carry-in / Opex carry-in | Opening balance or prior-year carry-over. |
| Notes | Free text. |

Rules:

- A program belongs to exactly one annual plan and exactly one SI.
- A continuation must be a program from an **earlier** fiscal year, in the same strategic plan and
  the same SI; a program cannot continue itself.
- The program card shows **Capex available (budget + carry-in)**, **Capex allocated** and **Capex
  unallocated**, and the same for opex. Allocating above available is flagged (`over-allocated`),
  never blocked (BR-7).
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
before its originating program's year. The plan must be active and the originating year open.

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

- Fields: **Name**, **Category**, **Owner**, **Opex budget**, **Opex carry-in**, **Notes**.
- Recurring ops items have **no SI link and no projects**, and are **opex only** (BR-12). The opex
  budget is the item's annual budget.
- Commitments and spend are recorded on the item's own **Open commitments & spend** page.

### 3.6 Opening balances and the import wizard

The first in-app fiscal year is the year **after** the strategic plan's start year (FY2027 when the
plan starts at FY2026). The prior year is closed manually in the spreadsheets; pre-app data enters as
**opening figures**, never as reconstructed records.

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

Allocation carry-in is **not** imported: enter it when you create the allocation; plans, recurring ops, commitments and spend are form entry only.

**Reconciliation and sign-off.** On **Plan → Opening balances**, enter the eight spreadsheet
**control totals** and click **Save control totals**. The comparison table shows each control total
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
| Capex carry-in / Opex carry-in | Opening balance or prior-year carry-over. |
| Notes | Free text. |

Rules and behaviour:

- One allocation per project per fiscal year. Use **Edit allocation** to change it (reason required);
  a voided allocation can be restored by re-adding it.
- The allocation must use a program for the project's SI (BR-6). The year must be inside the
  project's years and the annual plan must not be closed.
- Allocating above the program's available budget is flagged (BR-7), never blocked.
- Each allocation card shows **allocation**, **carry-in** and **remaining** per component, plus
  **capex spend above commitment** / **opex spend above commitment** badges when BR-11 applies.
- **Open commitments & spend** opens the execution page for that year (§4).
- The year-close workflow writes carry-in into the next year's allocation, creating the allocation
  automatically when the project spans into the target year. A closed year's allocation is read-only.

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
| **SI five-year view** | Envelope, prior consumption, in-app program budgets, allocations, commitments, spend, consumed and headroom per SI, with a portfolio total. Capex and opex are combined here. |
| **Annual plan by SI and program** | Every annual program with capex/opex budget, carry-in, available, allocated and unallocated money, plus committed and spent; a second table lists recurring operations with opex budget, carry-in, available, committed, spent, prior-year openings and remaining. |
| **Project register** | Full-life figures, ijin prinsip approved amount, submitted and final deal price, allocations, lifetime commitments, spent to date and flags; the footer adds open commitments, prior-year opening settlements and in-app spend. |
| **Budget versus actual** | Program-level available, allocated and unallocated per component, plus committed, spent, prior-year settlements and prior-year openings, with a status badge. A **Post-close adjustments (reserve)** block follows the table. |

Reports are read-only; all data comes from the plan, funding and execution records. Without a strategic plan each report asks you to create one first.

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
and no version restore.

### 6.1 Before you close

- The annual plan must be **active**.
- The **next fiscal year's annual plan must exist** and must not be closed — carry-over lands there.
- Agree the carry-over amounts and the approval reference with the portfolio owner.
- Remember: only **remaining budget** and **unallocated program budget** can be carried. Open
  commitments are not carry-over; they stay commitments.
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
7. On success the year becomes `closed`: carry-in is added to the target programs and allocations
   (creating allocations when needed), every carry-over entry and the close are audited, and the page
   shows the snapshot with the approval reference, closed date, totals and entries.

### 6.3 After the close

- **Read-only plan data.** Creating, editing and voiding plan records in a closed year is blocked:
  programs, allocations and recurring ops items in the closed year refuse with a closed-year message,
  a project (and its ijin prinsip) refuses when the fiscal year of its originating program is closed,
  and the closed allocation has no spend form. This release has no in-app reopen, rollback or
  correction screen for closed-year plan figures.
- **Settlement lifecycle continues.** Existing spend entries can still be edited or voided (audited,
  with a reason); voiding releases their settlements. To pay a closed-year commitment, record a new
  spend in the **open** year and settle the closed-year commitment there (§4.4). The locked close
  snapshot and carry-over figures never change.
- The **Fiscal year closed** card shows the approval reference, closed date, and the carried amounts
  per entity and component. The locked snapshot figures for the closed year stay frozen.

### 6.4 Program threads

Open **Thread** on a program card, or a thread from **Plan → Annual plans → Program threads**, to see
the program across fiscal years:

- Each year's program with plan status, budget, carry-in, allocated, unallocated and project count.
- **Carry-in reconciliation** — carry-over recorded at the prior year close against the carry-in on the
  continuation program, with the approval reference and a badge: *carry-in includes the close* or
  *carry-in below the close snapshot*.
- The current program links back to the prior year's program. Program carry-in can also come from the
  opening balances, which have no close entry.

## 7. Dashboard

The **Dashboard** summarises portfolio health:

- **Stat cards** — Envelope, Program budget + carry-in, Allocated + carry-in, Open commitments,
  In-app spend, Remaining, Fiscal-year commitments, and Flags (with a count of over-allocated programs
  and flagged projects).
- **Plan versus execution** — available, allocated, open commitments, current-year spend and remaining
  for capex, opex and the total, with the cross-year and prior-year opening amounts excluded underneath.
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

- Nothing is hard-deleted. Wrong data is corrected with an audited edit (reason required), or the
  record is voided/cancelled with a reason.
- Closed years are read-only. The only writes that touch a closed year are settlement lifecycle
  events: editing or voiding an existing spend (audited with a reason), and a payment recorded in an
  open year that settles a closed-year commitment (§4.4). New plan records belong to open years.
  There is no reopen, rollback, undo or version restore.
- Closed-year plan figures (program budgets, allocations, project figures) cannot be changed from the
  app in this release. Document the correction and raise it with the engineering lead or as a GitHub
  issue; do not attempt a database edit.

## 9. The annual cycle: checklist

**Before the fiscal year**

- [ ] Strategic plan created and **active**; SIs with envelopes and prior consumption up to date.
- [ ] Annual plan created and **active**; programs created with their capex/opex budgets, carry-in and continuation links.
- [ ] Projects created with full-life figures and ijin prinsip, and their annual allocations entered; recurring operations items created with their opex budgets and carry-in.
- [ ] Opening balances loaded and reconciled, then signed off (first in-app year only).

**During the year**

- [ ] Commitments recorded when POs/contracts are issued.
- [ ] Spend recorded when invoices are booked; settle commitments where applicable.
- [ ] Post-close payments recorded in the open year with the correct treatment.
- [ ] Review the dashboard and reports monthly; resolve flags or accept them with the owner.
- [ ] Export the reports before director/finance reviews.

**Year end**

- [ ] Ensure the next year's annual plan exists and is not closed.
- [ ] Agree the carry-over amounts and the approval reference.
- [ ] Close the fiscal year (typed phrase `CLOSE FY<year>`) and verify the carry-in on the next year's programs and allocations.
- [ ] Reconcile the program threads' carry-in against the close snapshot.
- [ ] Confirm that open commitments remain open and are not expected as carry-over.

## 10. Reference

### 10.1 Field reference

| Record | Fields |
| --- | --- |
| Strategic initiative | code, name, owner, objective, envelope, prior program budget consumed, notes |
| Annual plan | fiscal year (one per year), notes, status |
| Annual program | code, name, SI, continues program, capex/opex budget, capex/opex carry-in, notes |
| Project | originating program, name, code, owner, external reference, start/end fiscal year, full-life allocated budget, submitted price, final deal price, description; opening allocated / open commitments / actual spend; status |
| Ijin prinsip | document number, document date, approved amount, approver, document link, notes |
| Project year allocation | fiscal year program, capex/opex allocation, capex/opex carry-in, notes |
| Recurring ops item | name, category, owner, opex budget, opex carry-in, notes |
| Commitment entry | component, amount, commitment date, reference, description |
| Spend entry | component, amount, spent-on date, category, vendor, invoice/reference, description, settlement classification, settlement splits, post-close treatment |
| Year close | approval reference, typed confirmation, carry amounts and target programs per program, carry amounts per project allocation |
| Custom field | field name, type (text, number, date), required flag, description, example value, order, machine key; active or archived |

### 10.2 Status transitions

```
Strategic plan:   draft ──activate──▶ active ──archive──▶ archived (read-only, final)
Annual plan:      draft ──activate──▶ active ──close────▶ closed (read-only, no reopen)
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
| `A strategic plan already exists. This deployment supports one plan…` | One plan per deployment. | Edit the existing plan under Plan → Strategic plan & SIs; a second plan cannot be created in this release. |
| `This fiscal year is closed and read-only.` / `That fiscal year is closed and read-only.` / `The originating fiscal year is closed and read-only.` | The annual plan behind the record (or the project's originating year) is closed. | Use an open year; closed years accept only settlement lifecycle writes (§6.3). |
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
| `You cannot deactivate your own account.` / `The last active account cannot be deactivated.` | Member-management guard. | Keep at least one active administrator and use another admin for your own account. |
| `Cannot restore “…”` … | A custom-field name or key already exists on that record type. | Rename the active field or use another name before restoring. |

## 11. FAQ

**Is there a default administrator username or password?**
No. A fresh database has no account; open `/setup` and create the first administrator. Every other
account is created in Administration → Members.

**Who can do what?**
Every signed-in account is an administrator: all accounts can manage members, edit open-year data and
use every screen. There are no editor or viewer roles in this release, and no self-service sign-up.

**Can I delete accounts, projects or records?**
No. Accounts are deactivated; plan records are voided or cancelled with a reason and stay in history
and in the audit trail.

**Can I reopen a closed year or roll back?**
No. Closing is irreversible and there is no version restore. See §6.3 for what still works after close.

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

**Why can I not edit anything in a closed year?**
The year is closed and its figures are frozen. Plan records are read-only; only the settlement lifecycle
on existing spend entries remains available, and new payments are recorded in the open year.

## 12. Known limitations

- One strategic plan per deployment; one annual plan per fiscal year; plan horizon 1–10 years.
- No reopen, rollback, undo or version restore. Closed-year plan figures cannot be edited in the app
  in this beta (the charter's audited-correction path is not exposed); closed-year spend entries can
  only be edited or voided as settlement lifecycle events.
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
