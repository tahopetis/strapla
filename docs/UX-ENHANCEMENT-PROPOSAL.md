# Proposal — customer experience enhancement

**Prepared:** 15 November 2026
**For:** the portfolio owner (product owner and UAT tester), the engineering lead
**Based on:** [USER-JOURNEY-REVIEW.md](USER-JOURNEY-REVIEW.md) — the full journey audit of the December release
**Decision needed by:** 18 November 2026 (scope and capacity for the pre-go-live phase)
**Release constraint:** M2.5 acceptance is **18 December 2026** ([CHARTER.md](CHARTER.md#L296)). Five working weeks remain.

---

## Executive summary

Strapla is functionally complete for the December release and unusually strong where it counts: the
money model, the audit trail and the no-delete rules are genuinely good. What is missing is the
experience around those records — the path that takes a portfolio owner from a fresh installation to
a reconciled FY2027 plan, and the daily loop that records a commitment or a payment without a hunt.

This proposal does not redesign the product. It closes the journey gaps the review found, in three
phases, with the first phase delivering the highest-trust fixes in **five working days** and every
item in the December release measurable against the UAT plan already in the repository.

**The ask, in one line:** approve **15 engineer-days before 18 December** to fix correctness, safety
and the first-run path; approve **4–5 weeks in January** to finish the daily execution surface,
opening-balance import and the mobile/accessibility pass.

| | Current | Proposed | Where |
|---|---|---|---|
| Record a spend entry from login | 6 screens, 3 clicks + scroll | 2 screens (Home → form) | W2 |
| First-run guidance | A sentence and a link | Checklist with real progress | W1 |
| Opening-balance load | 3 unrelated forms, no import | One wizard, import, control totals | W3 |
| Failed form submit | Everything typed is lost | Values kept, errors on the field | W5 |
| Close the fiscal year | One irreversible click | Review step, totals, typed confirmation | W4 |
| Phone use (390 px) | ~126 px content column | Operable at every screen | W6 |
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
4. **The expensive fixes need to start in January, not be discovered in January.** The execution
   surface, the opening-balance import and the responsive pass are multi-day items that will not fit
   before the freeze.

**Cost of doing nothing:** the December release ships with a broken phone layout, an irreversible
one-click year close, a data-entry loop that punishes every validation error, and copy that tells
reviewers the product is incomplete. UAT may still pass; adoption will be slower and the first
support conversations will be about the journey, not the finance model.

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
   require an explicit confirmation.
5. **Every screen survives a phone.** Operable at 390 px, 44 px targets, tables that become records,
   no horizontal page scroll.
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
| **A. Trust and correctness** | 16–20 Nov 2026 | 5 | Copy hygiene, derived fiscal years, time-zone dates, visible activation, archive confirmation, loading/error/404 boundaries, session message | The release candidate stops contradicting itself |
| **B. The go-live journey** | 23 Nov–4 Dec 2026 | 10 | Form feedback (keep values, inline errors, pending), first-run checklist on Home, close review wizard, opening-balance landing with control totals, fiscal-year switcher, funding nav hidden | UAT-01…UAT-15 have a guided path and safe high-stakes actions |
| **C. The daily product** | 5–29 Jan 2027 | 20–22 | `/spending` register + quick add, actionable flags inbox, opening-balance CSV import, responsive shell and 390 px pass, accessibility pass, copy pass, journey tests | The product people use every week, not only at go-live |

**Freeze:** 4 December. **UAT:** 7–11 December. **Go/no-go:** 16 December. **Ship:** 18 December.
No delivery between 19 December and 4 January.

Phase A is additive and low-risk: no schema change, no new flow, no dependency on the host decision.
Phase B touches shared form behaviour and the close flow, so it needs the freeze respected. Phase C
is a normal January iteration with its own demo and sign-off.

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

### W2 — The daily execution surface (Phase C, 6–8 days)

**Closes:** J2, J3, J8 (execution half), F7, V3, V4, V5.

**Changes**

- **New `/spending` register**: tabs for allocations, commitments and spend; filters by fiscal year,
  strategic initiative, program, project and component; one primary "Record spend" action. Rows link
  to the parent record, where the existing edit flow stays.
- **Quick add from Home**: "Record spend" and "Record commitment" buttons opening the normal form
  with the parent chosen by search.
- **Settlement inputs collapse** in the spend form behind "Settle commitments (N)"; the primary
  fields stay above the fold.
- **`/funding` retires**: from Phase B the nav item is hidden (the URL still resolves, pointing at
  Plan); once `/spending` ships it redirects there and the explainer moves to Help.
- **Small shell polish:** one at-a-glance capex/opex bar on Home, sticky table headers and row hover in
  the registers, and a favicon plus wordmark and `theme-color` meta.

**Done when**

- From a cold login, a spend entry can be recorded in two screens and under 60 seconds (timed in UAT,
  three runs).
- A commitment can be found by project code or reference without opening the project.
- The spend form's primary fields are visible without scrolling with 20 open commitments present.

### W3 — Opening-balance load (Phase B: 1.5 days; Phase C: 5 days)

**Closes:** J4.

**Changes**

- **Phase B — landing and control:** `/plan/opening-balances` gains a load checklist (SI prior
  consumption, program carry-in, project opening figures, allocations carry-in), a control-total
  entry row per line, a computed difference, and a "signed off" state the owner can set with a
  reason. It keeps its existing reconciliation tables.
- **Phase C — import:** a four-step wizard (template → upload/validate → load → reconcile) for the
  three opening data sets. Parse first, show row-level errors, write in one transaction, record one
  audit entry per record with the documented reason convention, never partially apply.

**Done when**

- The owner can compare every control total on one screen and see the difference without a
  spreadsheet.
- A 25-project opening load completes in under one day, including reconciliation.
- A malformed CSV writes nothing and reports every bad row by line number.

### W4 — Safe high-stakes actions (Phase A: 1 day; Phase B: 2 days)

**Closes:** J5, F5, J5b (archive half).

**Changes**

- **Archive plan:** confirmation dialog stating that archiving is final, with the reason field inside
  it.
- **Close fiscal year (Phase B):** split into Review and Confirm. Review is read-only: carry-over
  totals per component, target programs, allocations without a target, entered vs available. Confirm
  requires the approval reference and a typed confirmation (`CLOSE FY2027`). Submit validates every
  carry line against its available/remaining figure and refuses to close on a target-less carry.
- After close: a receipt page with the carry-over snapshot and a link to the audit entry.

**Done when**

- Closing with an over-carry or a missing target is blocked with a field-level message.
- The confirmation cannot be submitted without the typed phrase and produces exactly one audit entry
  plus the carry-over records.
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
  the reason inside.
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

### W6 — Phone, touch, keyboard and long-page navigation (Phase C, 5 days; subset in Phase B if D1 says phone matters)

**Closes:** V1, V2, A1–A7.

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

### W7 — Fiscal-year context and reporting (Phase B: 1 day; Phase C: 1 day)

**Closes:** J7, J8 (registers), report filters.

**Changes**

- A **fiscal-year switcher** in the header, defaulting to the active year; Home and the four reports
  respect it; the "whole horizon" view remains an option.
- **Register filters:** search by code/name, filter by status/owner, sortable columns, pagination on
  projects and annual plans.
- **Report filters** for the chosen year and strategic initiative; exports reflect the filtered view.

**Done when**

- Switching the header year changes the Home totals and the reports, with the choice surviving
  navigation.
- A project can be found by code in under five seconds in a 50-project register.

### W8 — Guardrails and measurement (Phase A: 1 day; ongoing)

**Closes:** T6, C6, and protects the others from regressing.

**Changes**

- **Copy guard script** in the repo (`scripts/copy-guard.mjs`): fails CI when page or component copy
  contains milestone identifiers, ADR/BR references outside an allowed list, or hard-coded fiscal
  years. Cheap to write, and it makes W0 permanent.
- **E2E journeys:** add spend → settle → report, year close, and member lifecycle to the existing
  Playwright suite (today only the plan happy path exists, `../e2e/plan-happy-path.spec.ts`).
- **axe-core in CI** on the five key routes.
- **UAT timing protocol:** the owner times three tasks (first plan step, spend entry, opening-load
  reconciliation) with a stopwatch; results go in the UAT sign-off table. No analytics, no tracking,
  no privacy question.

**Done when**

- CI fails if a milestone reference or `FY2027` is reintroduced into page copy.
- The four journey tests run in CI on every pull request.
- The three baseline timings are recorded before the freeze and again after Phase C.

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
| 0 | 16–20 Nov | Phase A: W0, W4 (archive), W5 (resilience), W8 (copy guard + timing baseline) | Host decision recorded (charter R9); freeze scope agreed 20 Nov |
| 1 | 23–27 Nov | W5 forms, W1 checklist and activation | Mid-phase demo to the owner |
| 2 | 30 Nov–4 Dec | W4 close wizard, W3 opening landing, W7 year switcher, UAT script update | **Freeze 4 Dec**; release candidate built |
| 3 | 7–11 Dec | UAT-01…UAT-15 with the owner; fixes inside the freeze rules | Defects triaged same day |
| 4 | 14–16 Dec | Remaining fixes, opening balances signed off, go/no-go | **Go/no-go 16 Dec** |
| — | 18 Dec | Release | |
| 5–8 | 5–29 Jan | Phase C: `/spending`, import, responsive, accessibility, copy, tests | January demo and sign-off |

**Freeze rule:** after 4 December only release-blocking defects and the W0 copy/time-zone class of fix
are accepted; everything else goes to Phase C. This protects UAT from a moving target.

**Capacity assumption:** one engineer full-time. Phase A and B are 15 engineer-days against 15
available (5 + 10). If capacity is lower, the cut line is, in order: the fiscal-year switcher (W7),
register filters (W7), then the opening-balance landing (W3, keeping the existing reconciliation
page). None of the cuts blocks UAT.

---

## 8. Effort and cost

| Phase | Workstreams | Person-days |
|---|---|---|
| A | W0 2 · W4 1 · W5 1 · W8 1 | **5** |
| B | W1 2 · W4 2 · W5 3 · W3 1.5 · W7 1 · W8 0.5 | **10** |
| C | W2 8 · W3 4 · W6 5 · W7 1 · W8 2 · copy pass 2 | **22** |
| | **Total** | **37 person-days** |

Estimates assume one full-time engineer, the existing stack (Next.js server actions, Tailwind, no new
dependencies except a CSV parser and axe-core as dev dependencies), and no schema change. Phase C's
import may need one forward-only migration if batch tracing is wanted; that is included.

Commercial terms are not part of this document.

---

## 9. How we will know it worked

| Metric | Baseline (today) | Target | Measured by |
|---|---|---|---|
| Spend entry from login | 6 screens, ~9 fields, untimed | ≤ 60 s, 3 consecutive runs | UAT stopwatch |
| First plan built (fresh tenant, first program) | No guidance; unknown time | ≤ 45 min with checklist | UAT timing |
| Fields lost on a validation error | All of them | 0 | Manual test + e2e |
| Opening-balance load, 25 projects | Manual, multi-day | ≤ 1 day including reconciliation | UAT-08 |
| UAT scenarios passing without workaround | Unknown | 15/15 | UAT sign-off |
| Closed year reopened by mistake | No protection | Impossible without a DB restore | Manual test |
| Serious axe violations on key routes | Unknown | 0 | CI |
| Milestone / hard-coded year references in UI copy | 5 + 9 | 0 | Copy guard in CI |
| Phone (390 px) usability | Unusable | Every screen operable | Mobile walkthrough |
| Journey tests in CI | 1 | 4 | CI |

---

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Host decision slips (charter R9), compressing UAT | Medium | High | Decision requested 18 Nov; Phase A needs no host. Fallback tunnel documented in the charter |
| Phase B overruns the 10-day capacity | High | Medium | Cut line defined in §7; freeze on 4 Dec protects UAT |
| Form refactor (W5) regresses existing flows | Medium | High | One shared pattern, applied form by form; e2e happy path runs on every PR; UAT regression days 7–8 |
| Close wizard changes break the carry-over logic | Low | High | Logic untouched; only the UI shell and validation change; unit tests already cover the domain (`../src/domain/close.test.ts`) |
| CSV import writes bad data | Low | High | Validate-then-write in one transaction; dry-run report; import disabled after sign-off |
| Responsive pass destabilises desktop layout | Medium | Medium | Shell-only changes first; visual check at five widths; no page-level re-layout without a screenshot review |
| Copy guard produces false positives | Low | Low | Allowed-list in the script; it fails with file:line, not a silent block |
| Key-person risk (one engineer) | Medium | Medium | Small PRs, CI gate, decisions and design captured in these docs |
| Scope creep from UAT feedback | High | Medium | Freeze rule; triage labels already exist (`needs-triage` → `ready-for-agent` / `ready-for-human`) |

---

## 11. Compatibility with the decisions already taken

The proposal is deliberately constrained by what is already approved. Nothing here reopens a domain
decision.

| Existing decision | This proposal |
|---|---|
| ADR-0003 money rules and remaining semantics | Unchanged; the UI states the formulas more plainly and never recomputes them in the client |
| ADR-0004 audit and roles | Unchanged; every new flow writes actor, reason, before/after; no new roles |
| Charter §6.7 no reopen after close | Reinforced by the review step and typed confirmation |
| Charter BR-17 flags never block entry | Kept; the close wizard blocks only an invalid carry-over, not a flag |
| No hard deletes; void with a reason | Kept; confirmations add friction where it belongs |
| FY2027 as the first in-app year | Kept as data; the proposal removes it from copy and makes it derived |
| Documents as links, no uploads | Kept; CSV import is financial data, not attachments |
| Export definitions shared with the screen | Kept; filters applied before both |

**Schema impact:** none for Phases A and B. Phase C's import uses the existing tables; an optional
forward-only migration adds a load batch reference. Migrations remain forward-only per the go-live
checklist.

---

## 12. Delivery governance

- **One issue per workstream item**, filed in the repository tracker with the review ID (J1, F1, …) in
  the title. Labels: `needs-triage` on creation, then `ready-for-agent` or `ready-for-human`.
- **One pull request per item**, small, with the acceptance criterion from this document quoted in the
  description. CI (typecheck, lint, unit, e2e, build) gates every merge.
- **A demo every Friday** to the owner: the acceptance criterion demonstrated on the built app, not a
  screenshot.
- **Documentation is part of each item:** `USER-GUIDE.md` sections, the relevant UAT scenario, release
  notes for anything user-visible, and `OPENING-BALANCE-LOAD.md` for W3.
- **Definition of done:** criterion demonstrated, tests passing, docs updated, no stale copy
  introduced, copy guard green.

---

## 13. Decisions required

| # | Decision | Why it blocks | Needed by |
|---|---|---|---|
| D1 | Is the app expected to be used on a phone (or a tablet in portrait)? | Sets whether W6 (5 days) is in Phase B or Phase C | 18 Nov |
| D2 | Is the opening-balance CSV import in scope before go-live, or is manual entry acceptable for UAT? | Sets whether W3 grows from 1.5 to 6.5 days in Phase B | 20 Nov |
| D3 | Confirm the freeze (4 Dec), UAT window (7–11 Dec) and go/no-go (16 Dec) | Everything is planned backwards from these | 18 Nov |
| D4 | May ADR/BR references stay in the UI behind a disclosure, or must they leave the screen entirely? | Determines W0's copy mapping and the copy guard allow-list | 18 Nov |
| D5 | Can two fiscal years be active at once? | Defines the year switcher default and the "active" badges | 20 Nov |
| D6 | Is one engineer available full-time to 18 December? | The plan assumes it; otherwise the cut line applies | Immediate |
| D7 | Is a second administrator available for the UAT-12 lifecycle test? | UAT sign-off item, not a build blocker | 1 Dec |

---

## 14. Deliverables

**At the freeze (4 Dec)**
- Phase A and B merged to `main`, CI green, release candidate image published.
- Updated `USER-GUIDE.md`, `UAT-PLAN.md` (new scenarios for the checklist and close), `RELEASE-NOTES-2026-12.md`.
- Copy guard and three new e2e journeys in CI.
- Baseline timings recorded.

**At go-live (18 Dec)**
- UAT-01…UAT-15 signed off, opening balances reconciled and signed, go/no-go recorded.
- A one-page "what changed for you" note for the owner and finance.

**End of January**
- `/spending`, opening import, responsive and accessibility pass, copy pass, demo and sign-off.
- An updated journey review delta: the same scorecard re-run against the built app.

---

## Appendix A — Traceability to the review

| Review finding | Workstream | Phase |
|---|---|---|
| J1 no first-run path | W1 | B |
| J2 `/funding` dead end | W2 (nav hidden in B) | B + C |
| J3 execution has no home | W2 | C |
| J4 opening balances fragmented | W3 | B + C |
| J5 close has no review | W4 | B |
| J5b activation hidden | W1 | B |
| J6 flags not actionable | W2 (Home polish) | C |
| J7 no fiscal-year context | W7 | B |
| J8 registers do not scale | W7 (reports), W2 (spending) | B + C |
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
| F5 destructive without confirm | W4 | A + B |
| F6 required reason every edit | W5 (presets) | B |
| F7 settlement crowding | W2 | C |
| F8 create does not open record | W5 | B |
| T1/T2 no loading/error boundaries | W5 | A |
| T3 UTC dates | W0 | A |
| T4 mixed date formats | W0 | A |
| T5 silent session expiry | W5 | A |
| T6 one e2e journey | W8 | A + C |
| V1 no responsive shell | W6 | C |
| V2 small type | W6 | C |
| V6 no in-page nav | W6 (light) | C |
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

**Spending register**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Spending                                    [Record spend ▾] [Commit]│
│ Tabs: Allocations | Commitments | Spend                              │
│ Year FY2027 ▾   SI All ▾   Program All ▾   Component All ▾   Search… │
├──────┬──────────────┬────────────┬──────────┬──────────┬─────────────┤
│ Date │ Project      │ Component  │ Amount   │ Settled  │ Remaining   │
└──────┴──────────────┴────────────┴──────────┴──────────┴─────────────┘
```

**Close review → confirm**

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

**Opening-balance landing**

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
```

## Appendix C — Assumptions

- One full-time engineer is available from 16 November to 18 December and for January.
- The stack stays as it is: Next.js App Router, server actions, Tailwind, Drizzle, PostgreSQL. No
  component library, no charting library.
- No new role or permission model is introduced in this period.
- The December release remains plan + funding + insight + execution (M1–M5), with the UAT plan as the
  acceptance gate.
- The UAT owner is available for the two timing sessions and the Friday demos.
- The host exists by 4 December so UAT runs on the release candidate (charter R9).
- Estimates are engineer-days, not calendar days, and exclude reviews, demos and UAT support beyond
  the 0.5 day/week already included in W8.
