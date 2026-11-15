# Proposal — customer experience enhancement

**Prepared:** 15 November 2026
**For:** the portfolio owner (product owner and UAT tester), the engineering lead
**Based on:** [USER-JOURNEY-REVIEW.md](USER-JOURNEY-REVIEW.md) — the full journey audit of the December release
**Decisions recorded:** 15 November 2026 (D1–D3 answered; D4–D7 defaulted — see §13)
**Release constraint:** M2.5 acceptance is **18 December 2026** ([CHARTER.md](CHARTER.md#L296)). Five working weeks remain.

---

## Executive summary

Strapla is functionally complete for the December release and unusually strong where it counts: the
money model, the audit trail and the no-delete rules are genuinely good. What is missing is the
experience around those records — the path that takes a portfolio owner from a fresh installation to
a reconciled FY2027 plan, and the daily loop that records a commitment or a payment without a hunt.

This proposal does not redesign the product. It closes the journey gaps the review found in three
phases, with the first phase delivering the highest-trust fixes in **five working days** and every
item in the December release measurable against the UAT plan already in the repository.

**The ask, in one line:** approve **17 engineer-days before 18 December** to fix correctness, add the
opening-balance import the owner requires, and build the first-run path; approve **22 engineer-days in
January** to finish the daily execution surface, the close review and the mobile/accessibility pass.

| | Current | Proposed | Where |
|---|---|---|---|
| Record a spend entry from login | 6 screens, 3 clicks + scroll | 2 screens (Home → form) | W2 |
| First-run guidance | A sentence and a link | Checklist with real progress | W1 |
| Opening-balance load | 3 unrelated forms, no import | One wizard, import, control totals | W3 |
| Failed form submit | Everything typed is lost | Values kept, errors on the field | W5 |
| Close the fiscal year | One irreversible click | Typed confirmation now; review wizard in January | W4 |
| Phone use (390 px) | ~126 px content column | Operable at every screen — January, per D1 | W6 |
| Copy tells the truth | 5 stale milestone surfaces, hard-coded FY2027 | Generated years, no milestone names | W0 |

---

## 1. Who the customer is

"Customer experience" here means the three people who actually touch the product, plus the one who
only reads its output. The design must serve the first two; the fourth never logs in.

| Persona | What they do | What they need from the product |
|---|---|---|
| **The portfolio owner** (also UAT tester and administrator) | Builds the plan, loads opening balances, records commitments and spend, closes the year | To be walked through the first session; to enter money quickly without losing work; to trust that every number is traceable |
| **The finance reviewer** | Reads and exports the four reports, checks budget vs actual, signs off | Filters that match how finance slices the year; exports that match the screen; figures that state their formulas |
| **The administrator** | Creates accounts, resets passwords, reads the audit trail | Account lifecycle without developer knowledge; an audit search that answers "who changed this?" |
| **The director** (export consumer) | Receives CSV/XLSX and print packs | Nothing in-app; the exports must be self-explanatory |

The v1 role model makes every account an administrator ([ADR-0004](adr/0004-audit-and-roles.md)), so the
owner and the administrator are often the same person. That raises the bar for destructive actions:
there is no second pair of eyes in the product, so the product itself has to be careful.

---

## 2. Why now

1. **The acceptance date is fixed.** M2.5 acceptance is 18 December; UAT-01…UAT-15 must pass against
   the release candidate, and UAT-08 requires the real opening balances to be loaded and signed off.
2. **The UAT tester is the buyer.** The person who signs off is the person who will use the app
   hardest on day one. A first-run experience with no guidance will show up as UAT friction even
   where the functionality is correct.
3. **The cheapest fixes have the highest trust return.** Five stale-copy surfaces, hard-coded fiscal
   years and UTC date defaults are small edits that currently make a shipped product read as
   unfinished. They should not survive to the release candidate.
4. **The import the owner requires changes the shape of the work.** D2 puts the opening-balance CSV
   import inside Phase B, so it has to start in the first week (the parser and template) and land by
   the release tag. The daily execution surface and the responsive pass move to January by consequence,
   not by preference.

**Cost of doing nothing:** the December release ships with a data-entry loop that punishes every
validation error, a year close that is one irreversible click away, a first run with no guidance, and
copy that tells reviewers the product is incomplete. UAT may still pass; adoption will be slower and
the first support conversations will be about the journey, not the finance model.

---

## 3. Design principles

These are the rules every workstream is judged against. They are deliberately few and testable.

1. **One obvious next step.** Every screen answers "what do I do here?" with one primary action, and
   the home screen answers it for the whole product.
2. **Never lose typed work.** A failed save keeps every value, marks the offending field and says
   what to change in the user's words.
3. **Money is one glance away.** The state of the portfolio — budget, committed, spent, remaining —
   is readable without opening a project, and every figure names the rule behind it.
4. **Nothing irreversible happens in one click.** Close, archive and cancel show a review step and
   require an explicit confirmation. Where the full review is deferred, a typed confirmation holds
   the line in the interim.
5. **Every screen survives a phone.** Operable at 390 px, 44 px targets, tables that become records,
   no horizontal page scroll. Delivered in January by decision D1; the desktop journey does not
   depend on it.
6. **Say it in the user's words.** No ADR/BR/charter numbers, no milestone names, no route paths in
   user copy. One plain sentence on the screen; the rule behind a disclosure.
7. **The product tells the truth about itself.** No stale copy, no hard-coded fiscal years, no date
   that disagrees with the user's clock.
8. **The audit is the trust story.** Every new flow keeps the reason, the actor and the before/after
   record. Convenience must not weaken it.

---

## 4. Proposal at a glance

| Phase | Dates | Working days | Scope | Outcome |
|---|---|---|---|---|
| **A. Trust, correctness and import foundation** | 16–20 Nov 2026 | 5 | Copy hygiene, derived fiscal years, time-zone dates, visible activation, typed close confirmation, loading/error/404 boundaries, session message, import template and parser (no UI) | The release candidate stops contradicting itself and the import is de-risked |
| **B. The go-live journey and the load** | 23 Nov–8 Dec 2026 | 12 | Form feedback (keep values, inline errors, pending), first-run checklist on Home, opening-balance import wizard and control totals, archive confirmation, funding nav hidden, import e2e | UAT-01…UAT-15 have a guided path, a safe close and a one-day opening load |
| **C. The daily product** | 5–29 Jan 2027 | 22 | `/spending` register + quick add, actionable flags, responsive/390 px pass, accessibility, close review wizard, fiscal-year switcher and filters, copy pass, journey tests | The product people use every week, not only at go-live |

**Release tag:** 8 December. **UAT:** 9–15 December. **Go/no-go:** 16 December. **Ship:** 18 December.
No delivery between 19 December and 4 January.

**No development freeze (D3).** Development continues on `main`. UAT runs against an immutable release
tag cut on 8 December; fixes that the release needs go on a short-lived `release/2026.12` branch and
are cherry-picked onto the tag, while other work keeps landing on `main` and ships after 18 December.
The trade-off is stated in §10: UAT must be pinned, or it drifts onto a moving target.

Phase A is additive and low-risk: no schema change, no new flow, no dependency on the host decision.
Phase B is the risk centre because it rewrites shared form behaviour and adds the import; it needs the
8 December tag respected. Phase C is a normal January iteration with its own demo and sign-off.

---

## 5. Workstreams

Each workstream names the review findings it closes (IDs from the review's §3 table), what changes,
how we know it is done, and the effort estimate (one full-time engineer; ±30%).

### W0 — Correctness and copy hygiene (Phase A, 2 days)

**Closes:** C1, C3, T3, T4.

**Changes**

- Remove or rewrite the five stale milestone surfaces: the sidebar footer, the "M1 plan module
  complete" card on `/plan`, the "M3 / M2.5" note under the report list, the "(M4)" reference in the
  annual-plans empty state, and "M2 (#12)" on opening balances.
- Replace every literal FY2026/FY2027 with values derived from the strategic/annual plan: form
  defaults, helper text, the "pre-FY2027" settlement label, the opening-balance description.
- Fix the UTC date bug: the spend/commitment form default and every `toISOString().slice(0,10)`
  display use the app's Asia/Jakarta clock (the `toDateInputValue` helper already exists in
  `../src/lib/format.ts:41`).
- Render dates consistently through `formatDate` in the execution tables.

**Done when**

- `grep -rn "M1\|M2\|M3\|M4\|M5\|FY2027\|FY2026" src/app src/components` returns only
  legitimate domain constants (the seeded reference data), not UI copy.
- At 01:00 Asia/Jakarta, a new commitment form defaults to today's date.
- A UI copy check script fails on milestone references and hard-coded fiscal years in page files
  (see W8).

### W1 — The first hour (Phase B, 2 days)

**Closes:** J1, J9, J5b.

**Changes**

- **Getting-started card on Home**, driven by real state — plan created, plan active, annual plan
  active, first program, first project, first allocation, opening balances reconciled. The next
  incomplete step is a primary button; completed steps collapse.
- **Surface the Help checklist** as the source for that card (one definition, not two).
- **Activation as a first-class action:** for a draft plan or annual plan, put the status and the
  activation button in the page header, not inside a closed disclosure.
- **Fiscal-year badges become links** to the close/plan pages they name.

**Done when**

- A fresh tenant's Home shows the checklist with step 1 active and a single "Create the strategic
  plan" button.
- Activating a plan is reachable in one click from its page header.

### W2 — The daily execution surface (Phase C, 8 days)

**Closes:** J2, J3, J8 (execution half), F7, V3, V4, V5.

**Changes**

- **New `/spending` register**: tabs for allocations, commitments and spend; filters by fiscal year,
  strategic initiative, program, project and component; one primary "Record spend" action. Rows link
  to the parent record, where the existing edit flow stays.
- **Quick add from Home**: "Record spend" and "Record commitment" buttons opening the normal form
  with the parent chosen by search.
- **Settlement inputs collapse** in the spend form behind "Settle commitments (N)"; the primary
  fields stay above the fold.
- **Actionable flags:** the Home flags tile links to a filtered view of over-allocated programs and
  flagged projects.
- **`/funding` retires**: the nav item is hidden in Phase B (the URL still resolves, pointing at
  Plan); once `/spending` ships it redirects there and the explainer moves to Help.
- **Small shell polish:** one at-a-glance capex/opex bar on Home, sticky table headers and row hover in
  the registers, and a favicon plus wordmark and `theme-color` meta.

**Done when**

- From a cold login, a spend entry can be recorded in two screens and under 60 seconds (timed in UAT,
  three runs).
- A commitment can be found by project code or reference without opening the project.
- The spend form's primary fields are visible without scrolling with 20 open commitments present.

### W3 — Opening-balance load (Phase A: 1 day; Phase B: 5.5 days)

**Closes:** J4.

**Changes**

- **Phase A — foundation:** CSV template (columns, example rows, the documented reason convention),
  a parser and validator that reads every opening data set, a dry-run harness, and unit tests. No UI
  yet. This is what removes the import from the critical path in Phase B.
- **Phase B — wizard and landing:** a four-step flow (template → upload/validate → load → reconcile)
  for the three opening data sets. Parse first, show row-level errors by line, write in one
  transaction, record one audit entry per record, never partially apply. `/plan/opening-balances`
  becomes the landing: a load checklist per data set, control-total entry, computed difference, and
  a "signed off" state set with a reason. The existing reconciliation tables stay as step four.

**Done when**

- The owner can compare every control total on one screen and see the difference without a
  spreadsheet.
- A 25-project opening load (import plus reconciliation) completes in under one day, and the import
  itself takes under 15 minutes.
- A malformed CSV writes nothing and reports every bad row by line number.
- Every imported record carries one audit entry with the load reason.

### W4 — Safe high-stakes actions (Phase A: 0.5 day; Phase C: 2 days)

**Closes:** J5, F5, J5b (archive half).

**Changes**

- **Phase A — interim close guard:** on the existing close form, require the approval reference and a
  typed confirmation (`CLOSE FY2027`) and show the computed carry totals above the button. Two hours
  of work that removes the one-click irreversible close until the full wizard lands.
- **Phase B — archive confirmation** (part of W5's dialog pattern): archiving states that it is final,
  with the reason field inside the dialog.
- **Phase C — full close wizard:** Review and Confirm as separate steps. Review is read-only:
  carry-over totals per component, target programs, allocations without a target, entered vs
  available. Confirm validates every carry line against its available/remaining figure and refuses to
  close on a target-less carry. After close: a receipt page with the carry-over snapshot and a link
  to the audit entry. Deferred to January because the **first in-app year close is January 2028**
  (charter §6.7, `CHARTER.md:207`), so it needs to be right long before it needs to be early.

**Done when**

- The interim guard blocks a close without the typed phrase and records exactly one audit entry.
- The full wizard blocks an over-carry or a missing target with a field-level message.
- The closed state is read-only as today and states that there is no reopen.

### W5 — Forms that do not punish (Phase A: 1 day; Phase B: 3 days)

**Closes:** F1, F2, F3, F4, plus T1, T2, T5 (resilience half).

**Changes**

- Adopt `useActionState` for the shared form pattern: validation returns errors and values instead
  of redirecting; success redirects as today.
- Adopt `useFormStatus`: submit disabled and relabelled ("Saving…") while pending, so a double click
  cannot create duplicates.
- Per-field errors under the field with `aria-invalid` and `aria-describedby`; the top-of-page flash
  stays for server errors only.
- Success messages name the record ("Project PRJ-2027-014 created").
- Destructive actions get a native `<dialog>` confirmation with the consequence in one sentence and
  the reason inside (archive, void, deactivate).
- **Resilience:** `loading.tsx` skeletons for the app routes, `error.tsx` with "Try again" and a
  support line, `not-found.tsx`, and a "Your session ended — sign in again" message on the login
  redirect.
- **Phase A slice:** the loading/error/404 boundaries and the session message ship in week 1, because
  they are additive.

**Done when**

- Submitting a project form with one invalid field returns the form with every value intact and the
  error under the offending input.
- A slow save visibly disables the button; a second click is impossible.
- Killing the database during a save produces the styled error page, not the framework default.

### W6 — Phone, touch, keyboard and long-page navigation (Phase C, 5 days)

**Closes:** V1, V2, A1–A7.

**Deferred by decision D1:** not needed for the December release. Revisit before Phase C starts; if
the owner begins using a tablet or phone in January, this is the first item of the phase.

**Changes**

- **Responsive shell:** sidebar becomes a top bar with a menu below `lg`; content full width; the
  nav is one component with a mobile presentation, not a second navigation.
- **Tables on small screens** become record rows (label/value stacks) below `sm`; no horizontal page
  scroll.
- **Type scale:** 16 px body, 14 px tables, 13 px hints, 24/20/16 headings; 44 px minimum targets.
- **Accessibility:** skip link to `main`, `aria-current="page"` in both navs, `scope="col"` on table
  headers, contextual names for repeated controls ("Manage commitment — PO-2027-018"), explicit
  `focus-visible` rings on every interactive element, hints wired with `aria-describedby`.
- **Sticky in-page section navigation** on the project page and the annual-plan page, so pricing, ijin
  prinsip, allocations and history are one tap apart.
- **Motion:** 150 ms colour/background transitions, pressed state, row hover; nothing else moves.

**Done when**

- Every UAT screen is operable at 390 px; axe-core reports zero serious violations on login, Home,
  project, allocation and close; keyboard-only walkthrough of the plan build completes without a
  mouse.

### W7 — Fiscal-year context and reporting (Phase C, 2 days)

**Closes:** J7, J8 (registers), report filters.

**Moved out of Phase B by D2:** the import took the capacity. Home keeps the active-year badges until
the switcher lands in January.

**Changes**

- A **fiscal-year switcher** in the header, defaulting to the active year; Home and the four reports
  respect it; the "whole horizon" view remains an option. Per D5, several years may be active; the
  switcher names the one on screen and the badge list shows every active year.
- **Register filters:** search by code/name, filter by status/owner, sortable columns, pagination on
  projects and annual plans.
- **Report filters** for the chosen year and strategic initiative; exports reflect the filtered view.

**Done when**

- Switching the header year changes the Home totals and the reports, with the choice surviving
  navigation.
- A project can be found by code in under five seconds in a 50-project register.

### W8 — Guardrails and measurement (Phase A: 0.5 day; Phase B: 1 day; ongoing)

**Closes:** T6, C6, and protects the others from regressing.

**Changes**

- **Copy guard script** in the repo (`scripts/copy-guard.mjs`): fails CI when page or component copy
  contains milestone identifiers, ADR/BR references outside an allowed list, or hard-coded fiscal
  years. Cheap to write, and it makes W0 permanent.
- **E2E journeys:** add the import (good file and malformed file), the form-feedback pattern and the
  first-run checklist to the existing Playwright suite (today only the plan happy path exists,
  `../e2e/plan-happy-path.spec.ts`). Spend → settle → report, year close and member lifecycle arrive
  with the January work.
- **axe-core in CI** on the five key routes (from Phase C, when W6 changes the markup).
- **UAT timing protocol:** the owner times four tasks (first plan step, spend entry, opening import,
  reconciliation) with a stopwatch; results go in the UAT sign-off table. No analytics, no tracking,
  no privacy question.

**Done when**

- CI fails if a milestone reference or `FY2027` is reintroduced into page copy.
- The import and checklist journeys run in CI on every pull request before the release tag.
- The four baseline timings are recorded before 8 December and again after Phase C.

---

## 6. Scope boundaries

**In scope:** the workstreams above, the documentation updates they require (user guide, UAT plan
scenarios, release notes, opening-load workplan, operations notes), and the tests that prove them.

**Out of scope for this proposal — deliberate, not forgotten:**

| Not doing | Why |
|---|---|
| Charts, dashboards beyond one at-a-glance bar | No charting dependency today; the four reports answer the financial questions |
| Dark mode | No requirement; colour-scheme is light-only by design |
| Role model beyond all-administrator | ADR-0004 decides this; revisiting it is a separate proposal |
| Hard deletes, reopen of a closed year, editable settlement links | Contradict the charter and ADRs |
| File uploads for documents | Links only, per the charter; opening-balance *CSV import* is data, not attachments |
| A design system or component library migration | The Tailwind primitives are consistent; the pass is targeted |
| Bulk multi-record editing beyond the opening import | No validated need yet; record it if UAT asks |
| Notification email | Explicitly excluded in the charter |

Any item above that becomes a requirement is a change request with its own estimate.

---

## 7. Timeline

| Week | Dates | Delivery | Gate |
|---|---|---|---|
| 0 | 16–20 Nov | Phase A: W0, W5 (resilience), W3 (import foundation), W4 (close guard), W8 (copy guard) | Host decision recorded (charter R9); re-cut confirmed 20 Nov |
| 1 | 23–27 Nov | W5 forms and dialogs, W1 checklist and activation, W3 wizard starts | Mid-phase demo to the owner |
| 2 | 30 Nov–4 Dec | W3 wizard end-to-end, landing and control totals, import e2e | Demo: a real spreadsheet loaded end to end |
| 3 | 7–8 Dec | Integration, dry run on the real opening data, UAT script update | **Release tag cut 8 Dec** |
| 4 | 9–15 Dec | UAT-01…UAT-15 against the tag; release fixes on `release/2026.12` | Defects triaged same day |
| 5 | 16 Dec | Opening balances signed off, go/no-go | **Go/no-go 16 Dec** |
| — | 18 Dec | Release | |
| 6–9 | 5–29 Jan | Phase C: `/spending`, responsive, accessibility, close wizard, year switcher, copy, tests | January demo and sign-off |

**Release discipline (no development freeze, per D3).** Development continues on `main`. UAT is pinned
to the 8 December tag; release fixes are cherry-picked onto `release/2026.12`; anything that is not a
release blocker lands after 18 December. The trade-off: UAT sees the tag, not the newest `main`, so a
fix only counts when it is on the tag. The release manager (engineering lead) re-cuts the tag when a
fix is approved.

**Capacity assumption:** one engineer full-time. Phase A and B are 17 engineer-days against 17
available (5 + 12). If capacity is lower, the cut line is, in order: the import wizard's reconciliation
step (load and control totals only), the first-run checklist, then the archive dialog. None of the
cuts blocks UAT, but cutting the import itself would reverse D2 and force manual entry.

---

## 8. Effort and cost

| Phase | Workstreams | Person-days |
|---|---|---|
| A | W0 2 · W5 1 · W3 1 · W4 0.5 · W8 0.5 | **5** |
| B | W5 3 · W1 2 · W3 5.5 · W8 1 · integration buffer 0.5 | **12** |
| C | W2 8 · W6 5 · W7 2 · W4 2 · W8 1 · copy pass 2 · polish/e2e 2 | **22** |
| | **Total** | **39 person-days** |

Estimates assume one full-time engineer, the existing stack (Next.js server actions, Tailwind, a CSV
parser as the only new runtime dependency, axe-core as a dev dependency). The import may add one
forward-only migration if load-batch tracing is wanted; that is included.

Commercial terms are not part of this document.

---

## 9. How we will know it worked

| Metric | Baseline (today) | Target | Measured by |
|---|---|---|---|
| Spend entry from login | 6 screens, ~8 fields, untimed | ≤ 60 s, 3 consecutive runs | UAT stopwatch |
| First plan built (fresh tenant, first program) | No guidance; unknown time | ≤ 45 min with checklist | UAT timing |
| Fields lost on a validation error | All of them | 0 | Manual test + e2e |
| Opening-balance load, 25 projects | Manual, multi-day | Import ≤ 15 min; reconcile ≤ 1 day | UAT-08 + stopwatch |
| Malformed import writes data | n/a (no import) | Nothing written; every bad row reported | Import e2e |
| UAT scenarios passing without workaround | Unknown | 15/15 | UAT sign-off |
| Closed year protected from accident | One click | Typed confirmation (Phase A), review wizard (January) | Manual test |
| Serious axe violations on key routes | Unknown | 0 | CI (from Phase C) |
| Milestone / hard-coded year references in UI copy | 5 + 9 | 0 | Copy guard in CI |
| Phone (390 px) usability | Unusable | Every screen operable in January | Mobile walkthrough |
| Journey tests in CI | 1 | 3 by the release tag; 6 by end of January | CI |

---

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Host decision slips (charter R9), compressing UAT | Medium | High | Decision requested 18 Nov; Phase A needs no host. Fallback tunnel documented in the charter |
| Phase B overruns the 12-day capacity | High | Medium | Import is the fixed commitment; cut line in §7; the release tag is the hard line, not a freeze |
| **No freeze lets UAT drift onto newer commits** | **Medium** | **High** | UAT pinned to the 8 Dec tag; fixes only via `release/2026.12`; the re-cut is explicit and recorded |
| Form refactor (W5) regresses existing flows | Medium | High | One shared pattern, form by form; the existing e2e happy path runs on every PR; UAT regression 9–10 Dec |
| Import writes bad data | Low | High | Validate-then-write in one transaction; dry-run report; malformed-file e2e; import locked after sign-off |
| Close wizard deferred, carry-over still guarded by a typed confirmation | Low | Medium | Phase A guard blocks one-click close; the full wizard lands in January, long before the January 2028 close |
| Responsive pass destabilises desktop layout | Medium | Medium | Shell-only changes first; visual check at five widths; no page-level re-layout without a screenshot review |
| Copy guard produces false positives | Low | Low | Allowed-list in the script; it fails with file:line, not a silent block |
| Key-person risk (one engineer) | Medium | Medium | Small PRs, CI gate, decisions and design captured in these docs |
| Scope creep from UAT feedback | High | Medium | Release-branch rule; triage labels already exist (`needs-triage` → `ready-for-agent` / `ready-for-human`) |

---

## 11. Compatibility with the decisions already taken

The proposal is deliberately constrained by what is already approved. Nothing here reopens a domain
decision.

| Existing decision | This proposal |
|---|---|
| ADR-0003 money rules and remaining semantics | Unchanged; the UI states the formulas more plainly and never recomputes them in the client |
| ADR-0004 audit and roles | Unchanged; every new flow writes actor, reason, before/after; no new roles |
| Charter §6.7 no reopen after close | Reinforced by the typed confirmation now and the review wizard in January |
| Charter BR-17 flags never block entry | Kept; the close wizard blocks only an invalid carry-over, not a flag |
| No hard deletes; void with a reason | Kept; confirmations add friction where it belongs |
| FY2027 as the first in-app year | Kept as data; the proposal removes it from copy and makes it derived |
| Documents as links, no uploads | Kept; CSV import is financial data, not attachments |
| Export definitions shared with the screen | Kept; filters applied before both |

**Schema impact:** none in Phase A. Phase B's import may add one forward-only migration (a load-batch
reference) if batch tracing is wanted; no other schema change. Migrations remain forward-only per
the go-live checklist.

---

## 12. Delivery governance

- **One issue per workstream item**, filed in the repository tracker with the review ID (J1, F1, …) in
  the title. Labels: `needs-triage` on creation, then `ready-for-agent` or `ready-for-human`.
- **One pull request per item**, small, with the acceptance criterion from this document quoted in the
  description. CI (typecheck, lint, unit, e2e, build) gates every merge.
- **No freeze, but a hard tag:** `main` keeps moving; the release tag is cut 8 December and only
  approved release fixes are cherry-picked onto it.
- **A demo every Friday** to the owner: the acceptance criterion demonstrated on the built app, not a
  screenshot.
- **Documentation is part of each item:** `USER-GUIDE.md` sections, the relevant UAT scenario, release
  notes for anything user-visible, and `OPENING-BALANCE-LOAD.md` for W3.
- **Definition of done:** criterion demonstrated, tests passing, docs updated, no stale copy
  introduced, copy guard green.

---

## 13. Decisions

**Answered on 15 November 2026 — recorded, not re-opened:**

| # | Decision | Answer and consequence |
|---|---|---|
| D1 | Phone / tablet use | **Not now.** Desktop-first; W6 stays in Phase C (January). Revisit before Phase C starts; if phone use begins, it becomes the first item of that phase. |
| D2 | Opening-balance CSV import before go-live | **Required.** The import moves into Phase B (1 day foundation in Phase A + 5.5 days wizard in Phase B). To make room, the full close wizard and the fiscal-year switcher move to Phase C; the close keeps a typed confirmation in Phase A. |
| D3 | Development freeze | **No freeze.** Development continues on `main`; UAT is pinned to the release tag cut 8 December; release fixes go through `release/2026.12`. The risk and the discipline are in §7 and §10. |

**Defaulted on 15 November 2026 — apply unless changed by 20 November:**

| # | Decision | Default applied |
|---|---|---|
| D4 | ADR/BR references in the UI | Out of body copy; kept in one "Why this number?" disclosure per card and in Help. |
| D5 | Several active fiscal years | Allowed. The dashboard and the year switcher name the year on screen; the "active" badge list shows every active year. No code constraint exists today (`../src/server/plan/annual-actions.ts:134-163`). |
| D6 | Engineering capacity | One full-time engineer to 18 December and through January; otherwise the §7 cut line applies. |
| D7 | Second administrator for UAT-12 | A temporary second account created for the test and deactivated afterwards. |

---

## 14. Deliverables

**At the release tag (8 Dec)**
- Phase A and B merged to `main`, CI green, release candidate image published and tagged.
- Updated `USER-GUIDE.md`, `UAT-PLAN.md` (new scenarios for the checklist and the import),
  `RELEASE-NOTES-2026-12.md`, `OPENING-BALANCE-LOAD.md` (import instructions).
- Copy guard, import e2e, checklist e2e in CI.
- Import dry run against the real FY2026 data, with the control totals reconciled.

**At go-live (18 Dec)**
- UAT-01…UAT-15 signed off, opening balances reconciled and signed, go/no-go recorded.
- A one-page "what changed for you" note for the owner and finance.

**End of January**
- `/spending`, responsive and accessibility pass, close review wizard, fiscal-year switcher, copy pass,
  demo and sign-off.
- An updated journey review delta: the same scorecard re-run against the built app.

---

## Appendix A — Traceability to the review

| Review finding | Workstream | Phase |
|---|---|---|
| J1 no first-run path | W1 | B |
| J2 `/funding` dead end | W2 (nav hidden in B) | B + C |
| J3 execution has no home | W2 | C |
| J4 opening balances fragmented | W3 | A + B |
| J5 close has no review | W4 | A (guard) + C (wizard) |
| J5b activation hidden | W1 | B |
| J6 flags not actionable | W2 (Home polish) | C |
| J7 no fiscal-year context | W7 | C |
| J8 registers do not scale | W7 (reports), W2 (spending) | C |
| C1 stale milestone copy | W0 | A |
| C2 ADR/BR jargon | W0 + copy pass | A + C |
| C3 hard-coded fiscal years | W0 | A |
| C4 developer-facing help | W0 | A |
| C5 rule paragraphs before forms | copy pass | C |
| C6 vague labels | W0 + W6 | A + C |
| F1 lost input | W5 | B |
| F2 no pending state | W5 | B |
| F3 no inline errors | W5 | B |
| F4 generic success | W5 | B |
| F5 destructive without confirm | W4 (close guard) + W5 (dialogs) | A + B |
| F6 required reason every edit | W5 (presets) | B |
| F7 settlement crowding | W2 | C |
| F8 create does not open record | W5 | B |
| T1/T2 no loading/error boundaries | W5 | A |
| T3 UTC dates | W0 | A |
| T4 mixed date formats | W0 | A |
| T5 silent session expiry | W5 | A |
| T6 one e2e journey | W8 | A + B + C |
| V1 no responsive shell | W6 | C |
| V2 small type | W6 | C |
| V6 no in-page nav | W6 | C |
| A1–A7 accessibility gaps | W6 | C |
| V3 flat tables | W2 (table polish) | C |
| V4 no at-a-glance visual | W2 (Home bar) | C |
| V5 no mark or favicon | W2 (shell polish) | C |

## Appendix B — Wireframe sketches

These are sketches for alignment, not visual designs. They use the existing Tailwind primitives.

**Home (first run)**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Strapla   FY2027 ▾            owner@example     [Sign out]          │
├────────────┬─────────────────────────────────────────────────────────┤
│ Home       │  Getting started                              3 of 7   │
│ Plan       │  ┌───────────────────────────────────────────────────┐  │
│ Spending   │  │ ✓ Strategic plan created                          │  │
│ Reports    │  │ ✓ Plan activated                                  │  │
│ Admin      │  │ ✓ FY2027 annual plan active                       │  │
│            │  │ → Add your first annual program                   │  │
│            │  │   [Open FY2027 annual plan]                       │  │
│            │  └───────────────────────────────────────────────────┘  │
│            │  ┌──────────┬──────────┬──────────┬──────────┐         │
│            │  │ Envelope │ Allocated│ Committed│ Remaining│         │
│            │  └──────────┴──────────┴──────────┴──────────┘         │
│            │  Flags 3 →   Recent activity                            │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Opening-balance landing (Phase B) and import steps**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Opening balances — FY2026 → FY2027                    Not signed off │
│ Checklist                                                           │
│  ✓ SI prior consumption        control: Rp 12.400.000.000  diff Rp 0│
│  ✓ Program carry-in            control: Rp  1.620.000.000  diff Rp 0│
│  → Project opening figures     control: Rp  8.900.000.000  diff —   │
│  → Allocation carry-in         control: Rp    760.000.000  diff —   │
│                                        [Continue the load] [Import] │
└──────────────────────────────────────────────────────────────────────┘

Import: 1 Template → 2 Upload & validate → 3 Load → 4 Reconcile
  Step 2 shows: 42 rows read · 41 valid · 1 error (line 17: capex is not a number)
  Step 3 writes nothing until every row is valid; one audit entry per record.
```

**Spending register (Phase C)**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Spending                                    [Record spend ▾] [Commit]│
│ Tabs: Allocations | Commitments | Spend                              │
│ Year FY2027 ▾   SI All ▾   Program All ▾   Component All ▾   Search… │
├──────┬──────────────┬────────────┬──────────┬──────────┬─────────────┤
│ Date │ Project      │ Component  │ Amount   │ Settled  │ Remaining   │
└──────┴──────────────┴────────────┴──────────┴──────────┴─────────────┘
```

**Close review → confirm (Phase C; typed confirmation ships in Phase A)**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Close FY2027                                     Step 1 of 2 Review  │
│ Carry-over to FY2028                                                │
│  Programs      capex  Rp 1.240.000.000   opex  Rp 380.000.000        │
│  Allocations   capex  Rp   640.000.000   opex  Rp 120.000.000        │
│  ⚠ 2 allocations have remaining but no target program                │
│  Open commitments are not carried: they stay commitments.            │
│                                            [Review problems] [Next] │
└──────────────────────────────────────────────────────────────────────┘

Step 2: approval reference + type CLOSE FY2027 → [Close the year]
```

## Appendix C — Assumptions

- One full-time engineer is available from 16 November to 18 December and for January.
- The stack stays as it is: Next.js App Router, server actions, Tailwind, Drizzle, PostgreSQL. No
  component library, no charting library.
- No new role or permission model is introduced in this period.
- The December release remains plan + funding + insight + execution (M1–M5), with the UAT plan as the
  acceptance gate.
- The UAT owner is available for the timing sessions and the Friday demos, and for 9–15 December.
- The host exists by 8 December so UAT runs on the release tag (charter R9).
- Development continues during UAT (no freeze); the tag is the reference, not the branch tip.
- Estimates are engineer-days, not calendar days, and exclude reviews, demos and UAT support beyond
  the 0.5 day already included in W8.
