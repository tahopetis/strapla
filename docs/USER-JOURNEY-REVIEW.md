# Strapla — user journey review

**Scope:** the whole product, end to end — first run, plan build, funding, execution, close, reports, administration.
**Method:** source and content review of all 25 routes, the shared shell and form components, and the UAT / opening-balance plans. No runtime: this host has no PostgreSQL and no installed dependencies, so nothing was rendered or clicked. Findings are about structure, copy and interaction design, not pixels.
**Skill basis:** `design-taste-frontend` (tasteskill 2.5). Its shipping gate is for pages this skill builds; no page was built here, so there is no `GATE:` line. The rules that transfer to an internal business app — one job per screen, plain copy, honest affordances, equal edges, motion that answers the pointer, 390 px, keyboard and screen-reader basics — are used as the rubric in §5. The marketing-specific rules (photographs, heroes, shader scenes, dealt moments, palettes) do not apply and are marked N/A in Appendix C.

---

## Verdict

The domain model is strong and unusually honest: money rules live in one place, every mutation is audited, nothing is deleted, and flags never block entry. The journey that surrounds it is not yet designed. It reads as a set of well-built record screens with the workflow left implicit.

Five things hold it back:

1. **Nobody is walked through the first hour.** The only ordered instructions live in Help, and the dashboard — the screen every user lands on — shows portfolio health instead of the next step.
2. **Two of six top-level nav items are not destinations.** `Funding` is a brochure that describes modules that live elsewhere; `Help` is a manual. The actual daily work (commitments, spend) has no entry point above project level.
3. **The most important go-live task is fragmented.** Loading FY2026 opening balances happens on three unrelated forms across the app; the page named after it is a read-only reconciliation explainer with no import.
4. **The interface talks to the reviewer, not the user.** ADR, BR and charter section numbers are printed as user copy; stale milestone copy ("M1 complete", "arrives with M3") contradicts the shipped product; FY2026/FY2027 are hard-coded where they should be derived.
5. **Error recovery is punitive.** A failed form submit throws away everything typed and returns a one-line flash at the top of the page.

Score, adapted rubric (§5): **2.8 / 5**. Strong foundation, unfinished journey.

---

## 1. The journey as designed

The intended order is stated in Help (`../src/app/(app)/help/page.tsx:54-91`) and in the UAT plan. In the code it is enforced only by status gates and empty-state links.

```
 /setup ──► /login ──► /dashboard
                          │
        ┌─────────────────┼──────────────────────────────┐
        ▼                 ▼                              ▼
   /plan/strategic    /plan/annual                 /admin, /help
   (plan, SIs)        (annual plans, programs,    (members, audit)
        │             recurring ops)
        │                 │
        └────► /plan/projects ──► project detail
                                    │  ijin prinsip, pricing, opening figures
                                    ▼
                              annual allocations
                                    │
                                    ▼
                         allocation execution page
                         (commitments, spend, settlement)

   recurring ops item ──────────────────────────────► execution page
   /plan/opening-balances  = read-only reconciliation, points back at the forms above
   /reports/*              = four read-only reports with CSV/XLSX/print
```

| Stage | Job to be done | Screens | Main action |
|---|---|---|---|
| 0. First run | Create the first administrator, sign in | `/setup`, `/login` | Create administrator |
| 1. Land | Orient, see health, find the next step | `/dashboard` | (none — links only) |
| 2. Horizon | Create and activate the five-year plan, add initiatives | `/plan`, `/plan/strategic` | Create plan |
| 3. Year | Create and activate an annual plan, add programs and recurring ops | `/plan/annual`, `/plan/annual/[id]` | Create annual plan |
| 4. Projects | Create projects, record ijin prinsip and full-life figures | `/plan/projects`, `/plan/projects/[id]` | Create project |
| 5. Allocate | Slice program budget into project-year allocations | Project page → Annual allocations | Add allocation |
| 6. Execute | Record commitments, spend, settlements | Allocation page / recurring item page | Record spend |
| 7. Migrate | Load and reconcile opening balances | `/plan/opening-balances` (+ three edit surfaces) | (none) |
| 8. Report | Read and export four report views | `/reports/*` | Export CSV/XLSX |
| 9. Close | Close the year, carry over | `/plan/annual/[id]/close` | Close FY |
| 10. Govern | Members, audit trail, help | `/admin/*`, `/help` | Create member |

### Step budget for the first real spend entry

From login, recording the first spend entry crosses **six screens and eight fields** (plus an optional settlement amount per open commitment):

`/login` → `/dashboard` → `/plan/projects` → project → (scroll to Annual allocations) → allocation execution page → Record spend form.

Three clicks from the dashboard, and none of them suggest this is the spending route. There is no shortcut, no global "add spend", no command palette and no link from the dashboard. The same is true for commitments. UAT-16 set the target at "one real spend entry in under one minute"; from a cold dashboard this is achievable only if the user already knows the route.

### Volume budget for go-live

The opening load is typed by hand. Per record: initiative 7 fields, program 9, project 10 + 9 opening figures, ijin prinsip 6, allocation 6, commitment 5, spend 9+. Every edit also demands a reason. A modest portfolio — 5 initiatives, 6 programs, 25 projects, 25 allocations, 20 recurring items — is roughly **700+ manual field entries** before the first report is signed off, with no CSV import anywhere in the codebase (`grep` for upload/import returns nothing; `../docs/OPENING-BALANCE-LOAD.md` documents the manual order).

---

## 2. Stage-by-stage

### 2.1 First run and sign-in

**What the user sees.** `/setup` is a centred card: "Strapla — first-run setup", one sentence of explanation ("Every account in v1 is an administrator…"), four fields, one full-width "Create administrator" button (`../src/app/setup/page.tsx:22-78`). `/login` is the same shell with two fields and "Sign in" (`../src/app/login/page.tsx:22-64`). A fresh install redirects to `/setup`; `/setup` redirects to `/login` once a user exists.

**What works.** Clear title, labelled fields, password hint, sensible autocomplete, required attributes, `role="alert"` errors, rate limiting after repeated failures, and a login error that does not leak whether the email exists (`../src/server/auth/actions.ts:49-60`).

**Friction.**

- **No way forward for a locked-out user.** There is no forgot-password flow and no contact line. This is deliberate (admin-managed accounts), but the login screen should say so. It currently says "Accounts are created by an administrator" only on the setup screen and Help.
- **Setup is invisible to the product.** The first screen after account creation is a dashboard with no plan; it says "Create the strategic plan to see portfolio health" and offers one link (`../src/app/(app)/dashboard/page.tsx:146-160`). That is the entire onboarding.
- **Errors lose input.** A password mismatch or policy failure redirects with `?error=` and re-renders empty fields (`../src/server/auth/actions.ts:24-28`). Name and email are retyped.
- **No password visibility toggle** on either form, in a product where 12+ characters are mandatory.

**Verdict.** Competent, unremarkable, and it hands the user off to a screen that does not take over.

### 2.2 The dashboard

**What the user sees.** Title plus plan/horizon, fiscal-year badges, eight money stat tiles, then four cards: Plan versus execution (table), Fiscal years, Program threads, Recent activity, and Quick links (`../src/app/(app)/dashboard/page.tsx:167-389`).

**What works.** It is honest about what it measures — formulas are written next to the numbers, and the "Remaining" hint repeats the ADR-0003 rule. Flags are counted. Programme threads read across years. Recent activity doubles as a trust signal.

**Friction.**

- **No next action.** The page answers "what is the state?" and not "what should I do?". There is no primary button, no task list, no alert.
- **Eight consecutive money numbers with no grouping.** Envelope, program budget, allocated, open commitments, spend, remaining, commitments, flags. Capex/opex only separate in the table below. A portfolio owner cannot scan this and answer "are we over budget?" — the closest thing is a "Flags" number that is not clickable (`../src/app/(app)/dashboard/page.tsx:200-204`).
- **No fiscal-year context.** The dashboard aggregates the whole five-year plan (`loadPortfolio(plan.id)` in `../src/app/(app)/dashboard/page.tsx:29-141`). Once several years exist, "spend this year" is not what the number says.
- **Quick links duplicate the sidebar** and pad the page (`../src/app/(app)/dashboard/page.tsx:345-388`).
- **Threads jump to program threads**, a page with no breadcrumb back and a nav sub-item that does not exist in PlanNav (`../src/app/(app)/plan/programs/[id]/page.tsx:29-45`).

**Verdict.** A good report, not a good home.

### 2.3 Building the horizon

**What the user sees.** `/plan` is an overview with a four-stat plan summary and an envelope card. `/plan/strategic` falls back to a "Create the strategic plan" card (name, start year, end year), then shows plan details and an initiative list with one card per SI. Editing, activating and archiving are folded inside `<details>` disclosures (`../src/app/(app)/plan/strategic/page.tsx:101-161, 256-292`).

**What works.** Status gates are explicit ("The strategic plan is not active yet"), activation requires a reason, archiving warns that it is final, over-envelope states are labelled in place, and the empty states point forward. This is the best-developed part of the journey.

**Friction.**

- **Activation is hidden.** The action that unlocks every other page sits under a closed disclosure called "Activate plan" (`../src/app/(app)/plan/strategic/page.tsx:133-142`). A first-time user reads a page that says "draft" and sees no primary action. The same pattern repeats for annual plans (`../src/app/(app)/plan/annual/[id]/page.tsx:94-103`).
- **Stale milestone card.** `/plan` still renders "M1 plan module complete — … funding allocations arrive with M2" (`../src/app/(app)/plan/page.tsx:109-113`) two milestones after M2 shipped.
- **Hard-coded first year.** The "Prior program budget consumed" field hint says "before the first in-app fiscal year (FY2027)" (`../src/app/(app)/plan/strategic/page.tsx:191`), and setup defaults the horizon to 2026–2030 (`:68-71`). A plan for any other horizon starts with wrong defaults and wrong helper text.
- **A long form and a long list share one page.** Eight fields per initiative, an add form, then N initiative cards each with two disclosures. At ten SIs the page is several screens tall with no in-page navigation.

### 2.4 Year setup

**What the user sees.** `/plan/annual` — create-plan card (year, notes), a table of plans, and a program-threads card. `/plan/annual/[id]` — plan summary, "Add annual program" form (nine fields), one program card per program with available/allocated/unallocated money, then the recurring-ops section (`../src/app/(app)/plan/annual/[id]/page.tsx:114-186`).

**What works.** Continuation links are first-class ("Continues program"), capex and opex are always separate, unallocated is shown per component with an "over-allocated" badge, and recurring ops are correctly modelled as opex-only with no SI.

**Friction.**

- **The program card gives no way to see its projects.** It links only to the program thread; the project register is a separate top-level concept (`../src/app/(app)/plan/annual/[id]/page.tsx:203-213`). "Which projects sit under this program?" is unanswerable on this screen.
- **Stale copy again.** The "every year has an annual plan" branch tells the user to close a year "through the year-close workflow (M4)" (`../src/app/(app)/plan/annual/page.tsx:92-97`) — an internal milestone name shown to a business user.
- **Recurring ops live at the bottom of an already long page**, after every program card. The annual plan page is now the longest screen in the product.

### 2.5 Projects

**What the user sees.** `/plan/projects` — create form (ten fields) above an eight-column register. A project page with project summary, pricing chain, ijin prinsip, annual allocations, entity history, and a cancel section (`../src/app/(app)/plan/projects/[id]/page.tsx`).

**What works.** The pricing chain is presented as a chain, the flags are labelled with the rule they break, entry is never blocked, the allocation card states its formula, and each entity carries its own audit history. The project page is the most complete record surface in the app.

**Friction.**

- **The register does not scale.** No search, no filter, no sort, no pagination, no column for owner or status filter (`../src/app/(app)/plan/projects/page.tsx:108-134`). At 30+ projects this is a scrolling wall.
- **Stale copy.** The create form says annual allocations "land in M2" (`../src/app/(app)/plan/projects/page.tsx:73`).
- **Creation does not go anywhere.** After "Create project" the form resets and the list updates; the user is not taken to the record they just made, so the natural next steps (ijin prinsip, allocations) are three more clicks away.
- **The execution door is easy to miss.** It is a text link at the bottom of each allocation card ("Open commitments & spend", `../src/components/plan/project-allocations.tsx:167-174`), on a page that is already four screens tall.
- **No in-page navigation.** Pricing, ijin, allocations, history and cancel are stacked; there is no jump bar or sticky section nav.

### 2.6 Execution

**What the user sees.** A funding summary card (allocation + carry-in, commitments, spend, remaining per component), then a Commitments section (add form + table) and a Spend section (add form + table) — `../src/components/execution/execution-sections.tsx`.

**What works.** The formulas are stated, BR-11 warnings appear in place, settlement links are shown per spend line, cross-year and prior-year-opening classifications are visible, and voiding explains what it releases. The model is coherent and the tables are readable.

**Friction.**

- **No portfolio-level execution surface.** This is the product's daily job and it has no top-level page. Commitments and spend exist only under a project-year allocation or a recurring item. The `Funding` nav item does not show them (`../src/app/(app)/funding/page.tsx`).
- **The spend form crowds as data grows.** Every open commitment becomes a numeric input with a long label inside the primary form (`../src/components/execution/execution-sections.tsx:377-398`). With twenty open commitments, the actual spend fields are buried under a wall of optional settlement inputs.
- **Hard-coded year in a business label.** "Pays a pre-FY2027 commitment" and "Payments of pre-FY2027 commitments" (`:332, :373`) ship the first deployment's fiscal year into the model's UI.
- **Raw ISO dates in tables.** `commitmentDate` and `spentOn` are printed as stored (`:213, :426`) while the rest of the app renders `dd/mm/yyyy` (`../src/lib/format.ts:25-31`).
- **"Manage" repeated.** Every row's disclosure says only "Manage" (`:234-235, :462-463`) — unusable by screen reader and ambiguous by eye.
- **Default date can be yesterday.** The form's `today` is built from `new Date().toISOString()` (UTC) on `../src/app/(app)/plan/projects/[id]/allocations/[allocationId]/page.tsx:36` and `../src/app/(app)/plan/annual/[id]/recurring-ops/[itemId]/page.tsx:34`, but the app displays and reasons in Asia/Jakarta. Between 00:00 and 07:00 local time the default commitment/spend date is the previous day.

### 2.7 Opening balances

**What the user sees.** A header explaining the FY2026 → FY2027 bridge, one card telling the user that figures are entered "per strategic initiative", "per annual program" and "per project" with links, then three reconciliation tables (`../src/app/(app)/plan/opening-balances/page.tsx:40-296`).

**What works.** This is the one screen that answers the one-time migration question, and the reconciliation tables are exactly what a sign-off needs.

**Friction.**

- **The page named "Opening balances" has no way to enter an opening balance.** It is documentation plus a report. The most important task in the release (UAT-08) is split across three edit surfaces with no single workflow, no checklist and no progress state.
- **No import.** Every figure is typed. `../docs/OPENING-BALANCE-LOAD.md` describes an eight-step manual load with no tooling.
- **Stale reference.** "Project year allocation carry-in is entered when the annual allocations are created in M2 (#12)" (`../src/app/(app)/plan/opening-balances/page.tsx:81`) — closed milestone, closed issue, shipped feature.
- **Hard-coded years in the page description** (`:44`).

### 2.8 Reports

**What the user sees.** Four report cards with a "live" badge, then an exports card (`../src/app/(app)/reports/page.tsx:44-67`). Each report shares `ReportShell`: h1, description, CSV / XLSX / Print buttons, tables (`../src/components/report-shell.tsx:6-37`).

**What works.** The export story is genuinely good: screen and export share one definition, XLSX writes raw Rupiah integers, and the print stylesheet hides chrome and sizes A4 landscape (`../src/app/globals.css:12-51`). Report descriptions are precise about what is included and excluded.

**Friction.**

- **No parameters.** Every report is bound to the current plan. There is no year filter, no SI filter, no project filter, no date range. "Give finance FY2027 only" is not possible without post-processing the export.
- **Stale copy directly under the report list.** "Commitments and actual spend arrive with the execution milestone (M3) … The audit-trail view arrives with M2.5" (`../src/app/(app)/reports/page.tsx:63-66`). Both have shipped.
- **No saved views or scheduled exports** — acceptable for v1, worth stating.

### 2.9 Year close

**What the user sees.** A close review card (4 counts), then one form containing two large per-row tables (program carry-over, allocation carry-over), an approval reference field, and a single "Close FY2027 and carry over" button (`../src/app/(app)/plan/annual/[id]/close/page.tsx:159-314`).

**What works.** The page is explicit that closing is irreversible, that open commitments are not carried, and that zero carry-over is allowed. The closed state renders the snapshot read-only with the carry-over table.

**Friction.**

- **Irreversible, one click, no review step.** The button lives at the bottom of a form whose inputs are all optional; submitting with everything blank closes the year with zero carry-over. There is no confirmation dialog, no typed confirmation, no "you are about to carry X into FY2028" summary, and no way back (`:287-313`).
- **No live totals.** The user types per-program and per-allocation carry amounts with no running sum, no "matches available" indicator and no warning when the entered carry exceeds the unallocated/remaining figure shown in the same row.
- **Target selection is optional.** "Select a target program" can be left empty (`:208-219`) even though carry-over needs somewhere to land; the consequence is only discoverable on submit.
- **UTC close timestamps.** `closedAt.toISOString().slice(0, 10)` (`:66`) and the dashboard equivalent (`../src/app/(app)/dashboard/page.tsx:281`) can show the previous day.

### 2.10 Administration, audit and help

**What the user sees.** `/admin` — four cards: members, audit, session, access model. `/admin/members` — create form plus a table where each row opens a "Manage" disclosure with four mini-forms. `/admin/audit` — a four-field GET filter and a 200-row table with before/after JSON. `/help` — 304 lines of quick start, checklist, hierarchy diagram, money rules and FAQ.

**What works.** The audit screen is a real tool: search across actor/entity/action/reason, entity/action/actor filters, CSV export, expandable before/after, and a stated screen/export limit. Member management is complete (create, reset, revoke, deactivate, reactivate, last-admin protection) and every action is audited. The help page is accurate and well-organised.

**Friction.**

- **Help is where the onboarding lives**, behind a top-level nav item, while the dashboard — the actual landing screen — does not know it exists. The checklist links in the right order (`../src/app/(app)/help/page.tsx:54-91`); nothing puts it in front of a first-time user.
- **The audit filter form has no "apply on change" and no result count** ("Showing the latest N" is in the card description, not the page header). Fine at 200 rows, awkward at scale.
- **Server-rendered page language is developer-facing.** Help tells the user to "Open the app at `/setup`" and points at `docs/USER-GUIDE.md in the repository` (`../src/app/(app)/help/page.tsx:36, 25, 280`). The portfolio owner cannot act on either.
- **No self-service password change.** Every account is an administrator, yet only another administrator can reset a password.

---

## 3. The problems that matter most

Ranked by damage to the journey, not by effort. IDs are referenced in §6 and §7.

| ID | Severity | Problem | Evidence |
|---|---|---|---|
| J1 | P0 | **No first-run path.** After setup the user lands on a health dashboard; the ordered checklist is in Help. Nothing tracks progress or tells the user what "done" looks like. | `dashboard/page.tsx:146-160`, `help/page.tsx:54-91` |
| J2 | P0 | **`/funding` is a dead end.** A top-level destination with no data, no actions and no route into the workflows it describes; every link sends the user to Plan or Reports. | `funding/page.tsx:9-84` |
| J3 | P0 | **Execution has no home.** Commitments and spend are only reachable through a project allocation or a recurring item, around four navigations and a long scroll from the dashboard. | `project-allocations.tsx:167-174`, allocation page, recurring item page |
| J4 | P0 | **Opening balances are fragmented and manual.** No import, no wizard, no control-total entry; three edit surfaces; the page itself is read-only. | `plan/opening-balances/page.tsx:40-84`, `docs/OPENING-BALANCE-LOAD.md` |
| J5 | P0 | **Irreversible close has no confirmation or review.** A single button, optional inputs, no totals preview, no way back. | `close/page.tsx:159-314` |
| C1 | P0 | **Stale milestone copy in five places.** "M1 complete / arrive with M2", "M3", "M2.5", "M5 next", "M2 (#12)". Contradicts the shipped product and reads as an unfinished build. | `layout.tsx:69`, `plan/page.tsx:109-112`, `reports/page.tsx:63-66`, `annual/page.tsx:95`, `opening-balances/page.tsx:81` |
| C3 | P0 | **Hard-coded fiscal years.** FY2027/FY2026 in labels, defaults and hints; any other horizon is mislabelled from day one. | `execution-sections.tsx:332,373`; `projects/page.tsx:95-96`; `opening-balances/page.tsx:44`; `strategic/page.tsx:191` |
| T3 | P0 | **UTC date defaults in a Jakarta-time product.** Commitment and spend defaults can be yesterday for the first seven hours of every local day. | allocation page `:36`, recurring page `:34` |
| F1 | P0 | **Failed submissions discard input.** Redirect-with-flash for every action; no `useActionState`, no field state, no preserved values. | `actions/common.ts:35-41`, `auth/actions.ts:9-11`; grep: no `useActionState` |
| F2 | P0 | **No pending state or double-submit guard.** Forms are plain `<form action>`; buttons never change; a slow save looks like a dead click. | grep: no `useFormStatus` / `useTransition` anywhere |
| J5b | P1 | **Status transitions are hidden in disclosures.** Activation — the gate on the entire journey — sits under a closed `<details>`. | `strategic/page.tsx:133-142`, `annual/[id]/page.tsx:94-103` |
| J6 | P1 | **Flags are counted, never actionable.** The dashboard "Flags" tile is not a link; there is no alert inbox or filtered view. | `dashboard/page.tsx:200-204` |
| J7 | P1 | **No fiscal-year context switch.** Dashboard and reports aggregate the whole horizon; multi-year is the headline feature. | `dashboard/page.tsx:29-141`, `report-shell` reports |
| J8 | P1 | **Registers do not scale.** No search, filter, sort or pagination on projects, annual plans or programs. | `projects/page.tsx:108-134` |
| C2 | P1 | **UI copy speaks in ADR/BR/charter numbers** and audit jargon to business users. | e.g. `dashboard/page.tsx:210,248`, `funding/page.tsx:40-49`, `close/page.tsx:128,153` |
| F6 | P1 | **A required reason on every edit.** Correct for audit, expensive for bulk entry; the same sentence is retyped dozens of times. | `form.tsx:149-159` |
| F7 | P1 | **Settlement inputs crowd the spend form** as open commitments grow. | `execution-sections.tsx:377-398` |
| V1 | P1 | **No responsive navigation.** A fixed 208 px sidebar with no breakpoint; at 390 px the content has ~126 px. | `layout.tsx:54-73`, `globals.css` (print-only media) |
| V2 | P1 | **12–14 px body and table type.** 181 `text-sm` and 75 `text-xs` occurrences; audit JSON and ids at 11 px. | grep counts |
| V6 | P1 | **No in-page navigation on long records.** Project and annual-plan pages are 3–5 screens tall. | project page, annual detail page |
| T1 | P1 | **No loading state.** No `loading.tsx`; every navigation waits on the server with an unchanged screen. | `find`: none |
| T2 | P1 | **No error or 404 boundary.** No `error.tsx` / `not-found.tsx`; a server failure is the framework default. | `find`: none |
| A4 | P1 | **Repeated control names.** Dozens of "Manage" and "Show values" buttons without context. | `members/page.tsx:96-97`, `execution-sections.tsx:234,462` |
| A7 | P1 | **No explicit focus styling on buttons and links**; inputs have a ring, controls rely on UA defaults. | `ui.tsx:9-16`, forms |
| T6 | P1 | **One end-to-end journey tested.** A single Playwright test covers the plan happy path; execution, close, reports and admin have no journey tests. | `e2e/plan-happy-path.spec.ts:19` |
| V3 | P2 | Flat table presentation: no sticky headers, row hover or sort affordances on 200-row tables. | audit page, registers |
| V4 | P2 | No at-a-glance visual: eight numbers and two tables, no trend or composition visual. | dashboard |
| V5 | P2 | No product mark or favicon; `public/` holds only `.gitkeep`. | `public/` |
| C4 | P2 | Help copy references routes and repository files. | `help/page.tsx:25,36` |
| C6 | P2 | Vague link labels: "Thread", "Manage", "CSV"/"XLSX" as bare nouns. | several |
| F4 | P2 | Success is always the word "Saved."; no link to what changed. | `common.ts:39` |
| F8 | P2 | Create actions do not open the created record. | project/plan forms |
| T4 | P2 | Mixed date formats: `dd/mm/yyyy` in most places, raw ISO in execution tables and some closed-at dates. | `execution-sections.tsx:213,426` |
| T5 | P2 | Expired sessions redirect to `/login` with no explanation. | `session.ts:81-85` |
| A1 | P2 | No skip link. | grep: none |
| A2 | P2 | No `aria-current` on nav; the current section is never shown. | `layout.tsx:55-71`, `plan-nav.tsx` |
| A3 | P2 | Table headers lack `scope="col"`. | all tables |
| A5 | P2 | Sub-44 px controls in table disclosures (members "Reset password" is 12 px text). | `members/page.tsx:118-123` |
| A6 | P2 | Field hints are visual only, not `aria-describedby`. | `form.tsx:38,70,102,144` |
| C5 | P2 | Rule paragraphs (30–50 words) precede the primary form on plan, annual and execution pages. | `annual/[id]:129-133`, `execution-sections.tsx:156-159` |

---

## 4. Cross-cutting review

### 4.1 Copy

**Strengths.** Plain declarative sentences, specific nouns, no marketing slop. Headings name things, buttons are verb + object ("Create plan", "Add program", "Record spend", "Close FY2027 and carry over"). No invented quotes, customers or numbers. The voice is consistent — an engineer explaining a financial rule carefully.

**The core problem is audience.** The UAT tester is the portfolio owner (`docs/UAT-PLAN.md:10`), not a developer. The UI prints:

- ADR and charter references: "per ADR-0003 §3", "charter §6.7", "ADR-0004", "BR-2", "BR-7/BR-17", "BR-11" (`dashboard/page.tsx:210,248`, `funding/page.tsx:40-49`, `annual/[id]:132,256-259`, `close/page.tsx:128,153`).
- Internal milestone names: "M1", "M2", "M3", "M2.5", "M4", "M5" (`plan/page.tsx:109-112`, `reports/page.tsx:63-66`, `annual/page.tsx:95`).
- Repository artifacts: `/setup`, `docs/USER-GUIDE.md` (`help/page.tsx:25,36,280`).

A rule reference is useful when a number is questioned. It is noise when printed under every form. The fix is not to delete the rationale but to move it behind a "Why this number?" disclosure or into Help, and to keep one plain sentence on the screen.

**Stale copy is the most damaging defect in the product.** Three surfaces say features have not shipped when they have. A reviewer or buyer who reads "Commitments and actual spend arrive with the execution milestone (M3)" on the Reports page will conclude the product is half-built, regardless of the truth. These are five-line fixes with disproportionate trust value.

**Hard-coded time.** FY2027/FY2026 appear as model facts in labels and defaults. The correct source is the current strategic/annual plan; a `fiscalYearLabel()` helper would remove all of them (`implementation note`).

### 4.2 Feedback and form behaviour

The app uses the simplest possible server-action pattern: `<form action={serverAction}>` → validate → `redirect(path?error=…|?message=…)` → render `Flash`. This gives atomic server behaviour and a clean audit trail, and it costs the user:

- **all typed values on any error** — `common.ts:35-41`, and the auth actions by hand (`auth/actions.ts:9-11`);
- **any signal that something is happening** — no pending state, no disabled button, no spinner;
- **field-level error placement** — one message at the top, never attached to the offending input;
- **a generic success** — "Saved." (`common.ts:39`), with the confirmation disappearing on the next navigation.

For a product whose value is data entry, this is the highest-leverage interaction fix in the list. The straightforward direction is `useActionState` + `useFormStatus`: return `{errors, values}` instead of redirecting on validation failure, keep the form populated, mark `aria-invalid` per field, disable the submit button while pending, and reserve redirects for success.

The confirm pattern for destructive actions is a `<details>` with a required reason. That is adequate friction for voiding a spend entry. It is not adequate for **archiving a plan** (final, `strategic/page.tsx:149`) or **closing a fiscal year** (final, `close/page.tsx:287-313`), where the user should see a summary and confirm explicitly.

### 4.3 Information architecture

Nav today: Dashboard, Plan, Funding, Reports, Administration, Help. Two of the six are informational. The operational core of the product — allocations, commitments, spend, settlement — has no nav entry, no global list and no cross-project view.

Consequences:

- a finance user cannot answer "what did we commit this quarter?" without opening allocations one by one;
- the `/funding` URL is the natural place to look for that answer and is the one place guaranteed not to have it;
- PlanNav (Overview, Strategic plan & SIs, Annual plans, Projects, Opening balances) is a second mental model, and Program threads and Recurring ops execution have no nav item at all.

A leaner IA is proposed in §6.1.

### 4.4 Layout, density and typography

- Container: `max-w-7xl` with a 208 px fixed sidebar; content columns align consistently. Equal left edges are respected; no one-sided blocks.
- Density is high by default: `text-sm` (14 px) for body and tables, `text-xs` (12 px) for labels/hints, `text-[11px]` for ids and JSON. There is one body size, no display scale, and no optical hierarchy beyond weight.
- Every screen is a stack of Cards with an identical header. This is consistent and it flattens importance: a danger zone (cancel project, close year) looks like the form above it.
- Long pages have no in-page navigation, sticky action bar or "back to top".
- Colour is used only in badges; everything else is slate on white. Badge grammar is coherent (success/info/warning/danger) and used consistently.

### 4.5 Responsive and touch

There is no responsive navigation. The shell is a flex row with a fixed `w-52` sidebar and no breakpoint (`layout.tsx:54`); the print stylesheet is the only media query in `globals.css`. At 390 px the main column is roughly 126 px wide. Tables are wrapped in `overflow-x-auto`, so they will scroll, but the page as a whole is not usable on a phone. Forms use `sm:grid-cols-2 lg:grid-cols-3` and do stack below `sm`, so form fields survive; the shell does not.

Touch targets: primary buttons are ~36 px tall (fine), but table-row disclosures and member actions are 24–28 px with 12 px text. The skill's 44 px rule is not met.

### 4.6 Accessibility

Positives: semantic `h1` per page, `nav` landmarks with `aria-label`, labelled inputs (wrapping `<label>`), `role="alert"` / `role="status"` on flash messages, required attributes, `lang="en"`, descriptive page titles, no `tabindex` abuse.

Gaps: no skip link; no `aria-current`; no `scope` on table headers; repeated "Manage"/"Show values" with no context; no explicit focus-visible styles on buttons/links; hints not programmatically associated; small tap targets; all-caps `text-xs` table headers at 12 px are hard to read; long JSON `<pre>` blocks in the audit table are visually dense.

None of this is expensive to fix, and several items are one-line changes.

### 4.7 Motion and affordance

Buttons change background on hover, links underline. There is no transition, no press state, no lift, no disclosure animation, no row hover. For an internal tool this is acceptable, but it makes the interface feel static and gives no feedback that a form is submitting (compounding F2).

The honest minimum: 120–160 ms background/colour transitions, a pressed state, a visible focus ring, a row hover tint on tables, and a spinner/label change on submit.

### 4.8 Resilience

- No `loading.tsx`: slow queries freeze the previous screen.
- No `error.tsx`: a thrown action or query renders the framework error page.
- No `not-found.tsx`: `notFound()` calls render the default.
- `force-dynamic` on 22 of 25 routes: correct for financial data, but there is no per-route caching or streaming strategy to soften it.
- Session expiry is silent (`session.ts:83`).

### 4.9 Reports and exports

This is the strongest complete workflow in the product: one table definition drives screen, CSV and XLSX; print is properly styled; report descriptions state inclusions and exclusions. Missing: any filtering, saved views, and an export-history trail. The `live` badge on every report is redundant — if it is there, it is live.

### 4.10 Trust features

Audit is the product's differentiator and it is well built: append-only, same-transaction, reason required, before/after values, search and CSV export, entity history on the record itself. "Nothing is deleted; void with a reason" is stated consistently. This is the part of the journey that would survive a design pass unchanged.

---

## 5. Adapted scorecard

Scale 1–5, where 5 is "would ship to a paying director without apology".

| Dimension | Score | Note |
|---|---|---|
| First screen clarity (what this is, what to do next) | 2.5 | Clear what it is; no next action |
| One job per screen | 2.5 | Forms, lists and rules share long pages |
| Navigation and wayfinding | 2.0 | No active state, dead-end Funding, buried execution, no year context |
| Copy correctness | 2.0 | Good voice, stale milestones, internal jargon, hard-coded years |
| Form UX and feedback | 1.5 | Loses input, no pending state, no inline errors |
| Empty states | 3.0 | Good forward links in Plan; bare elsewhere |
| Onboarding | 1.5 | Checklist exists but is hidden in Help |
| Accessibility | 2.0 | Semantic base; missing focus, names, skip link, scope |
| Responsive | 1.5 | Unusable below ~1024 px, broken at 390 px |
| Visual system consistency | 4.0 | One card, one button pair, coherent badges |
| Data display | 3.0 | Honest tables; no at-a-glance visual; mixed date formats |
| Performance and resilience | 2.5 | No loading/error boundaries; dynamic rendering |
| Reports and exports | 4.0 | Shared table definitions, good print, no filters |
| Audit and trust | 4.5 | Best part of the product |

---

## 6. The journey I would build

### 6.1 Information architecture

Six destinations, five of them places to work:

| Nav | Contains | Replaces |
|---|---|---|
| **Home** | Portfolio health, **alerts/flags inbox**, **getting-started progress**, recent activity, fiscal-year switcher | Dashboard; absorbs Quick links |
| **Plan** | Overview, strategic plan & SIs, annual plans, programs & threads, projects | Plan + Program threads |
| **Spending** | **Allocations**, **commitments**, **spend**, recurring ops execution — one filterable cross-portfolio register with a prominent "Record spend / commitment" action | New; absorbs the operational half of Funding |
| **Reports** | The four reports + exports | Reports (unchanged) |
| **Admin** | Members, audit trail | Admin (unchanged) |
| **Help** | Checklist, hierarchy, rules, FAQ | Help (unchanged content, moved out of the primary nav into the header/user menu) |

`/funding` either redirects to `/spending` or becomes a one-paragraph explainer inside Help. A nav item must never be a brochure.

### 6.2 First run

1. After setup, land on **Home** with a dismissible **"Build your plan" checklist** (the six steps from `help/page.tsx:54-91`) rendered as a progress card with the next step as a primary button.
2. Each completed step marks itself done from real state (plan active? annual plan active? programs exist? projects exist? allocations exist? opening reconciled?).
3. The empty dashboard for a plan-less tenant becomes that checklist, not a single sentence and a link.
4. Provide **"Load a starter plan"** only if the client supplies real data; never invent example rows.

### 6.3 Opening-balance load

The highest-value new screen in the product. A four-step wizard at `/plan/opening-balances/load`:

1. **Source** — choose the spreadsheet file (CSV) or manual entry; show the expected template and a column dictionary.
2. **Map and validate** — parse, show row counts and per-column errors before writing anything.
3. **Load** — one transaction, one audit entry per record with the convention already documented (`Opening balance — FY2026 close / <reference>`), progress and row-level results.
4. **Reconcile** — the existing tables, now with control-total input fields and a signed-off/locked state.

Without import, at minimum: a single page that links each control total to the form it belongs to, shows entered vs expected, and keeps a checklist state. The current page knows the totals; it should own the task.

### 6.4 Daily execution

- A **Spending** register at `/spending` with tabs: allocations, commitments, spend; filters by fiscal year, SI, program, project, component, status; one primary "Record spend" action.
- A **quick add** on Home: two buttons, "Record spend" and "Record commitment", opening the same form with the parent preselected via search.
- The spend form keeps settlements **collapsed behind "Settle commitments (N)"**, with the amount inputs inside; the primary fields stay above the fold.
- Each save echoes what changed and offers "View record" / "Record another".

### 6.5 Year close

Two-step close:

1. **Review** — read-only summary: carry totals per component, target programs, allocations without a target, entered vs available, and a warning list. No submit button on this step.
2. **Confirm** — approval reference plus a typed confirmation (`CLOSE FY2027`), then a single irreversible commit. After close: a read-only receipt page with links to the carry-over snapshot and the audit entry.

Also validate on submit: every carry input ≤ its available/remaining figure, every nonzero carry has a target program.

### 6.6 Forms and feedback standard

- `useActionState` for every form; validation returns errors and values, never a redirect.
- Per-field errors under the field, `aria-invalid` + `aria-describedby`.
- `useFormStatus`: submit disabled and relabelled while pending ("Saving…"), so double submit is impossible.
- Destructive actions: native `<dialog>` confirmation with the consequence in a sentence, reason field inside the dialog.
- Reason presets ("Opening balance load", "Correction", "UAT stress data") with a free-text override; remember the last reason for the session.
- Creating a record navigates to it; editing stays in place with a summary flash that names the record.

### 6.7 Copy rules

- Remove ADR/BR/charter numbers from body copy; keep them in one "Why this number?" disclosure per card and in Help.
- Remove every milestone reference. Milestones are project-management history, not product copy.
- Derive every fiscal year from data (`currentYearLabel`, `firstInAppYear`, target year). No literal 2026/2027 in the UI.
- Keep the plain first sentence; move rule paragraphs into Help or a disclosure.
- Name controls with their object: "Manage commitment", "Manage spend entry", "Show values for this change".

### 6.8 Visual and interaction pass

- Responsive shell: sidebar → top bar + hamburger below `lg`; content full width; card tables become stacked label/value rows below `sm`; 44 px minimum targets; base type 16 px, table type 14 px, hints 13 px.
- Loading skeletons per route (`loading.tsx`), an `error.tsx` with "Try again" and a support line, a styled `not-found.tsx`.
- Focus-visible ring on every interactive element; skip link to `main`; `aria-current="page"` in both navs; `scope="col"` on every table header.
- Motion: 150 ms colour/background transitions, pressed state, row hover, disclosure chevrons.
- One at-a-glance visual on Home: a small capex/opex composition bar or a remaining-budget bar per fiscal year. No effects, no charts that need a library.
- Sticky in-page section nav on the project page and annual-plan page.
- Favicon and a simple wordmark; `<meta name="theme-color">`.

---

## 7. Prioritised plan

Effort: S ≤ half a day, M ≤ two days, L > two days (one engineer).

### P0 — before go-live and UAT

| # | Item | Effort |
|---|---|---|
| 1 | Delete or correct the five stale milestone surfaces (C1) | S |
| 2 | Derive fiscal years; remove FY2027/2026 literals and defaults (C3) | S |
| 3 | Fix UTC date defaults and UTC closed-at/closedAt display (T3) | S |
| 4 | First-run checklist on Home, driven by real state (J1) | M |
| 5 | Preserve input + inline errors + pending state for all forms (F1/F2) | M |
| 6 | Close-year review step, totals preview, typed confirmation, row validation (J5) | M |
| 7 | Opening-balance wizard landing page with control totals and per-step links (J4, partial) | M |
| 8 | Make activation visible: status + primary action in the page header (J5b) | S |

### P1 — the first iteration after go-live

| # | Item | Effort |
|---|---|---|
| 9 | `/spending` register + quick add from Home (J3) | L |
| 10 | Retire `/funding` or redirect to `/spending` (J2) | S |
| 11 | Alerts inbox / linked flag counts (J6) | M |
| 12 | Fiscal-year switcher in the header, honoured by Home and reports (J7) | M |
| 13 | Search/filter/sort/pagination on project and annual registers (J8) | M |
| 14 | Responsive shell + mobile tables + 44 px targets (V1) | M |
| 15 | Loading, error and not-found boundaries (T1/T2) | S |
| 16 | Focus-visible, skip link, `aria-current`, `scope`, contextual control names (A1–A4, A7) | M |
| 17 | Report filters (year, SI, project) and export of the filtered view (J8) | M |
| 18 | Collapse settlement inputs in the spend form (F7) | S |
| 19 | Reason presets + remembered reason (F6) | S |
| 20 | Journey tests: spend → settle → report; close; members (T6) | M |
| 21 | Copy pass: remove ADR/BR from body copy, keep one plain sentence (C2, C4, C5) | M |

### P2 — polish

| # | Item | Effort |
|---|---|---|
| 22 | Sticky in-page navigation on long record pages (V6) | S |
| 23 | Audit table: sticky header, result count near the title, clearer before/after diff (V3) | M |
| 24 | Self-service password change (admin reset stays) | S |
| 25 | Session-expired message on the login redirect (T5) | S |
| 26 | Favicon, wordmark, theme-color (V5) | S |
| 27 | "View record" after create; "Saved" → "Saved <entity name>" (F4/F8) | S |
| 28 | One dashboard visual (capex/opex composition) (V4) | S |
| 29 | Label audit: "CSV"/"XLSX" → "Export CSV"/"Export XLSX" (C6) | S |
| 30 | Consistent date rendering everywhere (T4) | S |

---

## 8. Decisions I would take back to the client

1. **Who uses this on a phone?** If the answer is "the owner, occasionally", the responsive shell moves to P0. If nobody, remove mobile from the acceptance bar rather than pretending it works.
2. **Is importing the opening balances in scope for go-live?** It is the difference between a one-day load and a one-week load.
3. **Does the UAT tester read ADR/BR language?** If yes, keep references in a disclosure; if no, they leave the screen entirely.
4. **Can more than one fiscal year be active?** The dashboard currently aggregates the horizon; the year switcher and the "active" badges need one answer.
5. **Is a second role coming?** Every account is an administrator in v1; if editors or viewers arrive, the journey changes at every destructive control.

---

## 9. What I could not check

- Rendered appearance, contrast in situ, real spacing and line lengths — no browser run (no database, no installed dependencies on this host).
- Loading and error behaviour under a slow or failing database.
- The 390 / 768 / 1024 breakpoints in practice — the conclusion in §4.5 is from the shell's classes and the absence of any responsive rule, not from a screenshot.
- Screen-reader output — findings are from markup, not from an AT run.
- A real opening-balance load at volume.
- The e2e suite — one test exists; it was not run here.

---

## Appendix A — route inventory

| Route | Type | Purpose | Notable gap |
|---|---|---|---|
| `/` | redirect | Session-aware redirect | — |
| `/setup` | form | First administrator | Errors lose input |
| `/login` | form | Sign in | No support line, no password visibility |
| `/dashboard` | report | Portfolio health | No next action, no year context, flags not linked |
| `/plan` | overview | Plan summary + envelope | Stale M1 card |
| `/plan/strategic` | form + list | Plan and SIs | Activation hidden, hard-coded FY2027 hint |
| `/plan/annual` | list + form | Annual plans | Stale M4 copy, no filters |
| `/plan/annual/[id]` | form + list | Programs + recurring ops | Very long page, no program→project view |
| `/plan/annual/[id]/close` | form | Year close | No review/confirmation, no totals |
| `/plan/annual/[id]/recurring-ops/[itemId]` | execution | Recurring ops commitments/spend | No item edit link, UTC date default |
| `/plan/projects` | list + form | Project register | No search/filter/sort, stale M2 copy |
| `/plan/projects/[id]` | record | Project, pricing, ijin, allocations | No in-page nav, execution link buried |
| `/plan/projects/[id]/allocations/[allocationId]` | execution | Allocation commitments/spend | UTC date default, settlement crowding |
| `/plan/programs/[id]` | report | Program thread across years | No nav entry |
| `/plan/opening-balances` | report | Reconciliation | No entry workflow, no import |
| `/reports` | index | Report catalogue | Stale M3/M2.5 copy |
| `/reports/*` (4) | report | SI, annual plan, register, budget vs actual | No filters |
| `/admin` | overview | Members, audit, session | — |
| `/admin/members` | form + list | Account lifecycle | 12 px controls, repeated "Manage" |
| `/admin/audit` | report | Audit search + export | No result count in header |
| `/help` | content | Guide + checklist | Faces developers, holds onboarding |

## Appendix B — copy defects, page by page

| Where | Text | Problem | Fix |
|---|---|---|---|
| `layout.tsx:69` | "Multi-year live: … Dashboards, audit search and polish (M5) next." | Stale; permanently visible | Delete |
| `plan/page.tsx:109-112` | "M1 plan module complete … funding allocations arrive with M2" | Stale, contradicts product | Delete the card |
| `reports/page.tsx:63-66` | "…arrive with the execution milestone (M3) … audit-trail view arrives with M2.5" | Stale, under the report list | Delete |
| `annual/page.tsx:95` | "…year-close workflow (M4)" | Internal milestone name | "Close the year from the annual plan" |
| `opening-balances/page.tsx:81` | "…created in M2 (#12)" | Stale + issue number | Delete the clause |
| `execution-sections.tsx:332,373` | "pre-FY2027" | Hard-coded year | Derive from plan |
| `projects/page.tsx:95-96` | Default start/end "2027" | Hard-coded year | Derive from active year |
| `strategic/page.tsx:191` | "before the first in-app fiscal year (FY2027)" | Hard-coded year | Derive |
| `opening-balances/page.tsx:44` | "The signed-off bridge from the FY2026 spreadsheets…" | Hard-coded year | Derive |
| `help/page.tsx:36` | "Open the app at `/setup`" | Route in user copy | "Open the app's address; a fresh installation asks you to create the administrator" |
| `help/page.tsx:25,280` | "`docs/USER-GUIDE.md` in the repository" | Developer artifact | "the full guide (print this page for it)" or link the served page |
| `execution-sections.tsx:234,462` + `members/page.tsx:96` | "Manage" (× N) | Ambiguous, repeated | Name the object |

## Appendix C — design-taste rules, applied or not

| Rule | Applies? | Finding |
|---|---|---|
| 1. No caption under a visual | N/A | No marketing visuals |
| 2. Every visual renders at 1440/1024/768/390 | Partly | No empty visuals; layout breaks at 390 (§4.5) |
| 3. One section per screen | N/A | App pages are records, not landing sections; long pages need in-page nav instead |
| 4. Equal left and right edges | Yes | Held in the shell and grids |
| 5. Hover micro-animations, press states, focus | Yes | Missing focus, pressed, transition layer (§4.7) |
| 6. Real photographs, better type | N/A (photos) / Yes (type) | 12–14 px density needs a scale (§4.4) |
| 7. Real icons, real product UI | Yes | No product mark/favicon; real UI is the strength |
| 8. Effects/scenes only for tech | N/A | Internal tool |
| 9. Addresses, contacts | N/A | No public contact surface |
| Checklist: first screen, one action, copy rules, a11y, 390, perf | Yes | Covered in §3, §4, §5 |
| Gate / screenshots / deal commands | N/A | Nothing built; no runtime available |

## Appendix D — metrics to hold the next iteration to

| Metric | Target |
|---|---|
| Time from login to first recorded spend entry (cold dashboard) | ≤ 60 s |
| Time to first activated plan + first program (new tenant) | ≤ 45 min |
| Fields lost after a validation error | 0 |
| Opening-balance load (25 projects) | ≤ 1 day, reconciled |
| Journeys covered by e2e | plan happy path, spend→settle→report, close, member lifecycle |
| Screen-reader navigable name for every table-row action | 100% |
| Phone (390 px) usability | every screen operable, no horizontal page scroll |
