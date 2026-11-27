# Changelog

All notable changes to Strapla are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

**Versioning switch.** Release 0.5.0 is the first Semantic Versioning release. Earlier releases used
calendar versions — `2026.12.0` identified the release month — and from 0.5.0 the version is
MAJOR.MINOR.PATCH. The 0.x line is the public beta; 1.0.0 marks general availability. The legacy tag
`v2026.12.0` remains published and pullable, but it is superseded and will not receive further
releases. `2026.12.0` is the baseline for this file; no 0.1.0 was ever released, so no section is
kept for it.

## [Unreleased]

### Added

**Closed-year audited corrections** (#108)

- A closed fiscal year accepts reasoned, audited in-place corrections of existing plan records: annual
  programs, project year allocations, projects (including their ijin prinsip and opening figures),
  recurring ops items and commitment entries. Each save is recorded in the audit trail under the
  `correction` action rather than `update`, and the record, its history, the closed annual plan's
  **Corrections after close** card and the close receipt's corrections notice all show it.
- The **Correct record** affordance reveals the existing edit form under a banner on a closed page;
  before the click the form is not rendered. Draft and active years keep the plain edit form, and the
  save rules are unchanged.
- The four reports and their CSV/XLSX exports read the live corrected figures and mark a row resting
  on a corrected record with a **Corrected after close** badge and export column, plus a footnote
  saying the close snapshot remains the historical record. A marker never changes a total.
- A correction never writes the close snapshot, the carry-over ledger or the ledger-backed
  `carry_in_*` caches on programs and allocations; there is no reopen, rollback or version restore, no
  create, void or status change in a closed year, and no budget revision (revisions stay active-only).
  A program's or allocation's carry-in is not correctable: it is derived from the ledger, and a wrong
  receipt is fixed in the receiving year (ADR-0007). A recurring ops item is outside the ledger and
  outside the year close, so its single carry-in is an ordinary in-place field and is corrected with
  its budget.
- No schema change and no migration: whether a record was corrected after close is derived from
  `audit_entries.action = 'correction'` for that entity.

**Strategic plan succession** (#109)

- One strategic plan is active or draft at a time; a plan is archived only when every annual plan
  under it is closed (a draft plan, which has none, may be archived directly), and archived plans are
  final and read-only. A new plan is refused while one is active or draft.
- The annual plan in the strategic plan's end year closes as a **final close**: no next-year annual
  plan is required, every available amount is recorded as not carried with a reason and no carry-over
  entries are written, while the snapshot invariants (available = carried + not carried, carried =
  ledger sum) still hold. Every other year keeps the ordinary close and its next-year target.
- A successor plan can be created once no plan is active or draft; its start year must be after every
  archived plan's end year and defaults to the year after the most recent archived plan. It starts
  empty and as a draft. Nothing carries across the boundary — no budget, carry-in, initiative, program
  or project — and opening balances stay first-plan-only.
- Horizon edits are refused when the new range would exclude an existing annual plan or a project's
  full-life years, and the message names the record. Ending a plan early is: shrink the horizon,
  final-close it, archive it.
- A read-only **Archived plans** list and per-plan read-only pages show each plan's name, horizon,
  archived date and reason from the status-change audit entry, its initiatives with envelope figures
  and its annual plans, linking into the existing read-only annual plan, program, project and
  allocation pages. With a successor present every surface uses the non-archived plan; until then the
  archived plan stays visible with a prompt to create the successor.

### Documentation

- `docs/USER-GUIDE.md` §6.3 and §8.4 describe the correction workflow and what is still not
  correctable; `GLOSSARY.md`, `docs/data-model.md` and `docs/REGRESSION.md` are updated to match
  (ADR-0007, #108).
- `docs/adr/0008-plan-succession-and-final-close.md` records the decision; `docs/USER-GUIDE.md` §3.1,
  §3.2, §3.4, §3.6 and §6.5–6.6 describe the final close, the successor workflow, the archived plans
  list, first-plan-only opening balances and the project boundary; `GLOSSARY.md`, `docs/CHARTER.md`
  (BR-1, A1 and §6.7), `docs/data-model.md` and `docs/REGRESSION.md` (T4 `succession` tier) are
  updated (#109).

## [0.5.0] - 2026-11-22

First Semantic Versioning release and first public beta. The declared scope now covers the complete
plan → fund → execute → close → report loop: the 2026.12.0 release notes had listed execution, year
close and the dashboard as post-release scope, although that code had landed on `main` ahead of that
tag (PRs #33–#37).

### Added

**Execution and settlement** (#33, #34)

- Commitment entries attached to a project year allocation or a recurring ops item, with component,
  commitment date, reference and the open → partially settled → settled lifecycle; voiding requires a
  reason and is audited.
- Spend entries with category, vendor, date and reference, plus settlement links to one or more open
  commitments. Partial settlement is allowed, over-settlement beyond a commitment or beyond the spend
  amount is refused, and a spend amount cannot be reduced below what is already settled. Settlement
  links and the post-close treatment freeze once settlements exist, and the component is fixed once
  the spend is settled; a correction voids the spend and re-enters it (audited, never a hard delete).
- Cross-year settlement: a spend in a later year paying an earlier-year commitment is marked as
  cross-year, reported on its own line and excluded from the current year's remaining.
- Prior-year opening payments for commitments made before Strapla (`prior_year_opening`), excluded
  from current-year remaining and counted in cash actuals.
- Execution figures across all four reports and their CSV/XLSX exports: committed, open commitments,
  current-year spend, prior-year settlements, prior-year openings, lifetime commitments and spent to
  date; execution detail on the project allocation, recurring ops and project pages.
- Post-close settlement with a per-transaction treatment (#105): a payment recorded in an open year
  can settle a commitment whose annual plan is closed. The closed-year portion is either charged to
  the current year (the default: counts in current-year spend and reduces current-year remaining) or
  kept as a closed-year reserve (`post_close_treatment`). The reserve is reported as a prior-year
  settlement in the current-year report and as a separate "Post-close adjustments (reserve)" table in
  Budget vs actual, and never enters the locked close snapshot or the carry-over figures. The choice
  appears only when the target commitment's plan is closed, is recorded in the audit entry and
  freezes once the spend has settlements; voiding the spend removes both reporting effects. Migration
  `0009_gigantic_dark_phoenix` adds the nullable enum on `spend_entries`.

**Year close and multi-year** (#35, #36)

- Manual fiscal-year close requiring an active annual plan and an existing, not-closed next-year
  plan. Every carry-over amount is validated against the year's remaining or unallocated candidate,
  needs an approval reference and is stored in a locked close snapshot.
- Deliberate close confirmation (#63): a typed `CLOSE FY<year>` phrase, live carry-over totals and an
  explicit zero in each carry field; a blank carry field is refused instead of silently meaning zero.
- Closed-year locks: creating, editing and voiding plan records is blocked after the close;
  settlement lifecycle events (editing or voiding an existing spend) can still be recorded, and a
  payment in the open year can settle a closed-year commitment (see post-close settlement below).
- Carry-over into the next year's program and project allocation, a read-only closed state on the
  close page, and carry-in reconciliation.
- Program continuation threads linking an annual program to its next-year continuation, with the
  close-recorded carry-over and the target's carry-in shown side by side.
- Multi-year project allocations across fiscal years, including later-year allocations opened with
  carry-over.

**Portfolio insight** (#37)

- Portfolio dashboard with envelope, program budget plus carry-in, allocated, open commitments,
  in-app spend, remaining, fiscal-year commitments and flags; plan-versus-execution per component;
  fiscal-year status with its approval reference; program threads; recent audited activity and quick
  links.
- Audit search across actor, entity, action and reason with filters and CSV export.
- Reports hub and report catalogue descriptions updated for execution, prior-year settlement and
  prior-year opening lines.

**Opening-balance import** (#62, #67, #78)

- Import foundation: a declared field list for the three data sets (strategic initiatives, annual
  programs, projects), CSV and XLSX templates carrying type rules, an example row and the load reason
  convention, a typed parser with line-level errors, a dry run, and the `pnpm opening:template` and
  `pnpm opening:validate` commands. The parser never writes.
- Import wizard at Plan → Opening balances → Opening import: choose the data set, approval reference
  and file, validate, then load. A load is create-only, runs in one transaction, fails the whole file
  by line on duplicate records or unknown references, requires the first in-app annual plan to exist
  and be open, and writes one audit entry per created record with its reason; a project row with
  ijin prinsip data creates the ijin prinsip record too.
- Reconciliation landing page: a per-data-set checklist with template links, eight control totals
  comparing the spreadsheets with in-app totals, and a one-time, reasoned, audited sign-off that then
  becomes read-only. Migration `0005_opening_balance_reconciliation` adds the sign-off store.
- Administrator-defined custom fields are importable columns (#78): the live registry's active fields
  for the data set are appended to the app-owned columns, validated with the record form's rules,
  stored against the new record in the same transaction and included in the audit snapshot. A display
  name that repeats an app-owned header is suffixed `(custom field)`; custom-field number columns
  follow the signed-integer rule and never enter money rules.

**Custom fields** (#77, #91, #92, #93)

- A field registry per plan-record entity: name, stable machine key, text/number/date type, optional
  required flag and description, plus one JSON value row per record keyed by field id, so renaming a
  field never rewrites recorded values. Values are shown on forms, record panels, reports and exports
  and never enter money rules, remaining, flags, allocations or report totals.
- Entity coverage grew from four (strategic initiative, annual program, project, recurring ops item)
  to eight, adding ijin prinsip records, project year allocations, commitment entries and spend
  entries (#93). The registry arrived in `0006_chief_smasher`; `0008_foamy_ken_ellis` extended it to
  eight entities and added `report_preferences`.
- Administration: create, edit, archive (values kept, no hard delete), an administrator-ordered list
  with Move up/Move down (#93), usage count and stable key per field, and an optional example value
  used as the opening-import template example (#92; migration `0007_cold_ghost_rider`).
- Archived-field review and restore with a required reason, an audit entry and a name/key conflict
  guard against active fields on the same entity (#91).
- Reports show the entity's fields as extra columns, filter by one or more typed custom fields with
  AND composition (#93), and the export selects which custom columns to include. Per-user report
  column selections are remembered (#93; `report_preferences` in migration 0008).
- Readable audit labels for `custom_field_*` actions and the custom-field entity in the audit table
  and filter options (#92).

**UX and resilience** (#48, #85, #86)

- Shared form pattern for every server-action form: a refused submission keeps every entered value,
  marks the offending input `aria-invalid` and shows the message inline; the submit button disables
  and relabels while pending; success messages name the record created or changed; passwords are
  never echoed.
- Destructive actions (archive, void, deactivate, remove, cancel) open a native confirmation dialog
  that states the consequence and carries the audited reason.
- Activation of a draft strategic or annual plan moved from a closed disclosure into the page header,
  with the status badge beside it and the typed reason kept on refusal (#86).
- Fiscal-year badges on the dashboard, program thread page and annual-allocation cards link to the
  annual plan they name (#86).
- Loading skeletons for signed-in routes, a route error boundary with a support digest, styled 404
  pages inside and outside the app shell, and an explanation on the sign-in page when a browser still
  carries a cookie for a session the database no longer has (#48).

**Help**

- New in-app Help page (`/help`) with a condensed quick start, setup checklist, money rules, daily
  commitment/spend/settlement workflow, year close, reports/dashboard/audit and FAQ; linked from the
  main navigation and printable with the existing print/PDF button (#40).

### Changed

- **Year close** now requires the typed confirmation phrase and explicit carry amounts, replacing the
  one-click close and the silent blank-to-zero behaviour (#63).
- **Plan activation** lives in the plan page header instead of a closed disclosure (#86).
- **Opening import** takes its extra columns from the live custom-field registry instead of only the
  committed owner-column list, and validates imported values with the record form's rules (#78).
- **Custom fields** are ordered, their report filters compose, report columns are remembered per
  user, the entity list grew to eight (#93), archived fields can be restored (#91), and the
  administration row shows usage and the stable key (#92).
- **Forms** no longer redirect to `?error=...` on a recognized refusal: values and field errors are
  returned beside the form, while unexpected failures go to the styled error boundary (#85).
- **Repository and licence**: the repository is public under MIT (#80) and the GHCR package is public, so
  hosts no longer need a pull credential (#90); `latest` follows `main` while releases use SemVer image
  tags.

**Build, CI and dependencies**

- Copy guard (`pnpm copy:guard`) fails page and component copy that contains milestone IDs,
  hard-coded fiscal years or ADR/BR references outside a reasoned allowlist; CI runs it on pull
  requests and `main` (#64).
- The security gate logs one line per scanner as it finishes, so the SAST and IaC passes are visible
  in the job log (#79).
- Docker and CI: pull-request image builds cover both architectures (#80), the verify job has a
  30-minute timeout (#80) and the image build a 45-minute timeout (#61); the runtime image dropped
  npm and pnpm and pins the base image digest (#87).
- On-demand three-tier Playwright regression (#102): T1 foundation journey, T2 rule specs and T3
  read-only route sweep, with tier and grep inputs, serial execution, failure artifacts (HTML report,
  JUnit XML, traces/video) and a per-test job summary; `ci.yml` keeps the foundation and sweep on pull
  requests. `docs/REGRESSION.md` records the coverage map and known gaps.
- Node 26 LTS for CI and the container (with `engines >= 24`), TypeScript 6.0.3 and postgres 4.1.1
  (#61); Next.js 16.4.6 (#54); development dependency updates for Playwright, Tailwind, ESLint,
  PostCSS and Vitest (#53, #88).

### Fixed

- Stale milestone surfaces removed, fiscal years derived from the plan data instead of literals, and
  the UTC date bug fixed for commitment/spend defaults, execution-table dates and closed-at dates
  using the Asia/Jakarta clock; the help diagram and documentation references no longer hard-code the
  horizon (#47).
- Import template links built from the declared data-set list instead of the select's DOM value,
  closing a CodeQL `js/xss-through-dom` finding (#81).
- Editing a custom field no longer fails: the edit form carries the entity type its update schema
  requires, a gap left since the field registry was introduced (#91).
- Six triaged defects fixed together (#104): server-side closed-year guards for allocation updates and
  recurring-ops voids; settlement violations refuse inline instead of reaching the error boundary; the
  spend edit keeps the Component field while unsettled and shows the freeze after settlement; the
  project page and project register agree on lifetime commitments and BR-8; malformed record ids
  render the styled 404 instead of a database error.
- The header build badge normalises `STRAPLA_VERSION`: a tag build shows `v0.5.0` (never `vv0.5.0`)
  and a branch build shows `main` or `dev` as it is. Covered by unit tests.
- Security policy contradictions and the unwired image-scan waiver path corrected (#89).
- Documentation corrected from "private GHCR" to the public package, and the host-side pull
  credential removed from the deployment docs (#90).

### Security

- Fail-closed security gate (#50): gitleaks, osv-scanner and semgrep feed one SARIF decider with
  `PASS`, `FAIL`, `ERROR`, `SETUP` and `OFF` verdicts; a missing scanner, crash, bad configuration or
  expired waiver is red. Waivers need a reason and an expiry. Dependabot version updates added, with
  vulnerability alerts and automated security fixes enabled on the repository.
- Security contract persisted in `AGENTS.md` and `docs/agents/security.md`; Trivy misconfiguration
  scanner added and findings published as a 14-day artifact for triage (#51).
- Three Dependabot alerts cleared with scoped pnpm overrides for the affected uuid, minimatch and
  esbuild paths, rather than blanket upgrades (#58).
- Gate raised to `FAIL_ON=medium` with the backlog fixed instead of waived: every workflow action
  pinned to a full commit SHA, Dependabot cooldown added, zero findings across the four scanners
  (#59).
- Repository made public and MIT-licensed (#80): CodeQL (`javascript-typescript`), dependency review,
  secret scanning with push protection, private vulnerability reporting and branch protection; the
  image scan started report-only.
- CodeQL `js/xss-through-dom` finding fixed rather than waived (#81).
- Container image scan triaged and made blocking (#87): 30 findings (6 HIGH, 23 MEDIUM, 1 LOW) fixed
  by removing npm and pnpm from the runtime image, upgrading the flagged Alpine packages and pinning
  the base image digest. A CRITICAL/HIGH pass fails the build, a separate SARIF pass keeps every
  severity visible, and pull-request images are built and scanned locally.
- Dated image-scan waivers wired to the blocking pass only, so a waiver silences the gate but not the
  Security tab; one waiver store per check documented and ADR-0002 amended for the runtime-image
  change (#89).
- CodeQL merge protection at medium or higher (#95): a repository ruleset on `main` with no bypass
  actors requires the CodeQL tool and blocks alerts at medium and above plus analysis errors;
  dismissal with a reason is the waiver. ADR-0005 records the decision.

### Documentation

- `docs/USER-GUIDE.md` rewritten as the complete guide: first-run setup, concepts and vocabulary,
  hierarchy and statuses, portfolio setup, allocations, commitments/spend/settlement including
  cross-year and prior-year opening, reports and exports, year close and program threads, dashboard,
  administration, annual-cycle checklist, field reference, status transitions, common messages, FAQ
  and limitations; README and the in-app Help page point at it (#40).
- User journey review (`docs/USER-JOURNEY-REVIEW.md`) and the December CX enhancement proposal
  (`docs/UX-ENHANCEMENT-PROPOSAL.md`), re-cut for in-scope import and no development freeze, then
  finalised with configurable import attributes and the 41-day plan (no PR; commits 03b7ed8,
  9e2ca8b, 22fab06, f9bd831).
- GitHub issue-tracker configuration for agents, including the `gh-api` notes for this device
  (`docs/agents/`; no PR; commit 3856263).
- Feature documentation kept current across the user guide, data model, glossary, opening-balance
  workplan, UAT plan and regression guide (#62, #63, #67, #77, #78, #85, #86, #91, #92, #93, #95,
  #102); ADR-0005 added for CodeQL merge protection (#95) and ADR-0002 amended (#87, #89).
- Public GHCR corrected across README, operations, both affected ADRs, the go-live and UAT
  checkpoints and the release notes, so no deployment doc asks a host for a read:packages token
  (#90).

## [2026.12.0] - 2026-10-26

The first release, published under calendar versioning; superseded by [0.5.0]. It shipped the
planning and funding foundation and the deployment path:

- **Plan** (#24, #25, #26, #27, #28): skeleton and first-run setup; strategic plan and strategic
  initiatives with five-year envelopes; annual plans (draft → active → closed) and annual programs
  with capex/opex budgets and continuation links; projects with ijin prinsip, recurring ops items, and
  opening balances with a reconciliation view.
- **Funding** (#29, #30): project year allocations and program budget availability; the funding flag
  engine (BR-2, BR-7, BR-8, BR-9, BR-18 and related flags); four reports — SI five-year, annual plan,
  project register, budget versus actual — with CSV/XLSX exports and print views.
- **Administration** (#31, #32): local administrator accounts and database-backed sessions; member
  management with audit; append-only audit trail with filters and per-record change history; the
  December release readiness package.
- **Platform** (#24, #38, #39): Next.js 16, PostgreSQL 18 and Drizzle with forward-only migrations;
  multi-arch image, Compose deployment with nightly backups and `/healthz`; CI with unit tests and a
  Playwright end-to-end journey; the go-live deployment dry run and release image versioning.

The 2026.12.0 release notes scoped the release to planning, funding, administration and platform, and
declared execution, year close and insight as post-release work. That code had already landed on
`main` before the tag (PRs #33–#37) and is declared in scope for 0.5.0.

[Unreleased]: https://github.com/tahopetis/strapla/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/tahopetis/strapla/compare/v2026.12.0...v0.5.0
[2026.12.0]: https://github.com/tahopetis/strapla/releases/tag/v2026.12.0
