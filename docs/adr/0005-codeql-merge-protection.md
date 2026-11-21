# ADR-0005: CodeQL alerts block merges at medium or higher

- **Status:** Accepted
- **Date:** 2026-11-21
- **Deciders:** Portfolio owner (decision on #84), engineering lead (proposal)
- **Related:** #80, #81, #82, #84, [docs/agents/security.md](../agents/security.md), [ADR-0002](0002-auth-and-deployment.md)

## Context

The public-repo CI adoption (#80) made `Analyze (javascript-typescript)` a required status check, but
that check only proves the CodeQL analysis completed: findings were Security-tab alerts that never
failed the job. The first analysis found two real `js/xss-through-dom` warnings, fixed in #81, which
showed the alerts are worth acting on, not decorative.

Every other security check is fail-closed: the `security-gate` blocks at `medium` (`FAIL_ON=medium`),
the image scan blocks at CRITICAL/HIGH, and dependency review blocks at high. CodeQL was the only
required check whose findings were advisory. Issue #84 asked whether a new CodeQL alert should block
a merge, with three options:

- **A** — keep the analysis-only contract and triage alerts in the Security tab.
- **B** — a repository ruleset requiring code scanning results, so new alerts above a threshold block.
- **C** — a custom per-PR workflow that queries alerts through the API and fails on a threshold.

## Decision

Take **option B** with the same severity threshold as the security gate: **medium or higher**.

The ruleset `CodeQL merge protection (medium or higher)` (id `27775718`) targets `refs/heads/main`,
has no bypass actors, and requires the `CodeQL` tool with:

- **Security alerts: `medium_or_higher`** — a new medium, high or critical security alert blocks.
- **Alerts: `errors`** — an error-level analysis result also blocks; warnings and notes stay
  triageable.

The `Analyze (javascript-typescript)` required check stays exactly as before: it proves the analysis
ran, and the ruleset adds that its findings are blocking. The ruleset evaluates alerts located in the
pull request's changed lines, so existing alert debt elsewhere does not block unrelated work. It also
blocks while a required tool's analysis is in progress or when the tool is not configured, so a
workflow regression cannot silently remove the protection.

### Dismissals are the waiver

There is no ruleset bypass, by design. The only way to merge past a blocking CodeQL alert is to
**dismiss the alert in the Security tab with a reason** — read by a human, recorded by GitHub, and
visible in the audit trail. That is the CodeQL analogue of the dated entries in
`ci/security-baseline.json` and `ci/image-scan-waivers.yaml`: a waiver silences the gate, never the
record. Editing a query, the workflow or the ruleset to go green is forbidden for the same reason as
editing a scanner.

### Limitations

- **Fork pull requests** are not analysed by `.github/workflows/codeql.yml` (a fork's token cannot
  upload SARIF), so their `Analyze` check is missing and they cannot merge anyway. A maintainer can
  run the workflow from the Actions tab after review, which returns the normal protection.
- This repository uses **advanced setup**, not CodeQL default setup, so the documented exemption for
  Dependabot pull requests analysed by default setup does not apply. Dependabot PRs run the same
  workflow (verified by #88) and are evaluated like any other PR.
- The repository does not use a merge queue, where ruleset merge protection does not apply.

## Consequences

- **Consistent posture:** a medium-or-higher CodeQL finding is as blocking as a medium semgrep
  finding; there is no longer a security check whose result merely decorates a merge.
- **More friction on medium findings:** CodeQL's medium band is broader than the gate's hand-written
  scanner set, so a new medium alert needs a fix or a justified dismissal before the PR merges. The
  backlog is empty today (0 open alerts), so this starts from a clean slate.
- **One more required review action:** closing a red PR can now mean dismissing a false positive with
  a written reason. The reason is the evidence of intent, exactly as ADR-0004 treats a correction
  reason.
- **No custom gate code:** the ruleset is platform configuration; there is no new workflow, failure
  mode or secret to maintain.

## Alternatives considered

- **A — advisory findings (rejected).** Inconsistent with the fail-closed gate and image scan: the
  deepest data-flow analysis in the pipeline would have the weakest consequence. The two real XSS
  warnings from the first run were a sample of what can be missed.
- **C — custom per-PR API gate (rejected).** Duplicates what the ruleset does natively, needs
  `security-events` access in the workflow, must hand-roll "new alert vs existing alert" comparison,
  and adds another decider that can fail open or silently stop running. The ruleset is the same
  contract with less code and no new failure mode.
