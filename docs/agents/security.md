# Security gate

Every pull request runs `security-gate` beside `ci`. It is **closed by default**: a
missing scanner, a crashed install, unparseable output, a bad threshold, an expired waiver or no
scanners at all is red — the gate never goes green because nothing ran.

The repository is public and MIT-licensed. That makes GitHub's code-scanning features available
for free, so secret scanning with push protection, CodeQL, dependency review and SARIF uploads run
in addition to the gate below.

## What runs

| Scanner | Covers | Report |
|---|---|---|
| gitleaks | committed secrets | `findings/secrets.sarif` |
| osv-scanner | dependency CVEs (lockfile) | `findings/deps.sarif` |
| semgrep (`p/default`) | SAST | `findings/sast.sarif` |
| trivy (`misconfig`) | Dockerfile / Compose misconfiguration | `findings/misconfig.sarif` |

One decider, `ci/normalize.mjs`, reads the SARIF and prints exactly one line:

```
SECURITY: PASS
SECURITY: FAIL <n>
SECURITY: ERROR (<reason>)
SECURITY: SETUP (<reason>)
SECURITY: OFF
```

A quiet scanner (`semgrep` and `trivy` write to SARIF, not stdout) prints nothing
while it runs. To keep that from reading as "did not run", the runner logs one
line per scanner as it completes — `scanner <name>: <status>, SARIF <bytes> bytes`
— before the decider produces the verdict.

Only `PASS` is green. `ERROR` and `SETUP` mean the environment or the config is wrong, not that the
code is clean; `OFF` means nothing was scanned. Re-running the same commit does not fix `ERROR`/`SETUP`.

## Other security checks

The gate above is not the only check. Each workflow below has one job and one disposition:

| Workflow | Covers | Disposition |
|---|---|---|
| `security-gate` | gitleaks, osv-scanner, semgrep, Trivy config, one decider | **Blocking** at `medium` |
| `codeql` | CodeQL `javascript-typescript` on push, PR and a weekly schedule; SARIF to the Security tab | **Required check** (the analysis must succeed); findings appear as alerts and do not fail the job |
| `dependency-review` | the PR's own dependency and action changes (`fail-on-severity: high`) | **Blocking** (required check) |
| `image-scan` | Trivy CVEs in the published container, triggered by the `docker` workflow's completion and weekly; SARIF to the Security tab | **Report-only** for now (`exit-code: 0`); promote once the baseline is triaged |
| GitHub secret scanning | full repository history plus push protection | **Blocking** (push protection) |

`image-scan` scans the exact image the `docker` run published (`sha-<commit>`) rather than
`:latest`, so it can never analyse a stale image. On a scheduled or manual run it scans `:latest`.

GitHub's dependency alerts and automated security fixes are enabled as well; Dependabot PRs pass
through the same gate.

## Rules

- **Never merge a red `security-gate`.** Fix the finding, or waive it with a reason.
- **Waivers** live in `ci/security-baseline.json`, keyed `scanner:rule:path`, each with a non-empty
  `reason` and an `expires` date. An expired waiver counts the finding again and prints
  `expired-waiver`.
- **Never edit a scanner, the decider or the workflow to turn a check green.** A scanner that fails
  silently is the failure mode the gate exists to prevent.
- **A secret finding is an incident**: remove the value from the code *and* rotate it. History counts.
- **Do not add `continue-on-error`** to a scanner step.
- Dependency PRs (Dependabot included) pass through the same gate.

## Threshold

`FAIL_ON` comes from the `SECURITY_GATE_FAIL_ON` repository variable (dispatch input overrides it;
the workflow default is `none`).

It is **`medium`**: findings at medium, high or critical block a merge. The first triage fixed the
backlog rather than waiving it (Dependabot cooldown, SHA-pinned actions), so the gate is a real gate.
Waivers exist for findings that have been read and time-boxed, never as a way to silence a scanner.

## Run it locally

```bash
bash ci/run-security.sh                    # all scanners (needs python3 for semgrep)
SCANNERS=secrets bash ci/run-security.sh   # secrets only — works on the Android host
FAIL_ON=high bash ci/run-security.sh       # what CI will do after the threshold is raised
```

Rules for local runs: the tools install outside the repo, `findings/` is git-ignored, and the last
line of output is the verdict. On this Android host semgrep cannot run (no `python3`), so the local
subset is `SCANNERS=secrets`.

## Triage a red check

1. Read the **last line** of the job log; it is the verdict. Download the `security-findings` artifact from the run (14 days) for the SARIF and per-scanner logs.
2. `ERROR` / `SETUP` — fix what it names; the code is not on trial.
3. `FAIL` — read `findings/summary.json` (counts, scanner, severity), then the SARIF for detail.
4. For CodeQL, dependency review and image-scan findings, open the repository's **Security** tab; the
   alert carries the rule, path and severity. The image scan is report-only, so it never blocks a merge.
5. Waive only what has been read: add `scanner:rule:path`, a reason and an expiry to
   `ci/security-baseline.json`.

The job summary carries counts, not paths. Keep it that way: a path list in a status is a map of
where to look.

## Dependabot

`.github/dependabot.yml` keeps npm dependencies (weekly) and Docker base images (monthly) fresh.
**Vulnerability alerts** and **automated security fixes** are repository settings, not workflow
configuration; they are enabled for this repository. They open PRs; the gate decides whether they
merge.

## Required status checks

The repository is public, so branch protection on `main` is available on GitHub Free and is enabled
with these required checks: `verify` (ci), `build` (docker), `security-gate`, `Dependency review`
and `Analyze (javascript-typescript)` (CodeQL). A red or missing required check blocks the merge.
`image-scan` is not required while it is report-only.

## Current state (November 2026)

The repository is public and MIT-licensed; secret scanning and push protection are enabled. The
security gate runs four scanners and reports **0 findings at any severity**, with one open waiver.
The threshold is `medium`; the gate passes on its own merits rather than shadow mode. CodeQL and
dependency review are required on pull requests; the image scan is report-only while its baseline is
triaged.

The first CodeQL analysis (20 November 2026) flagged two `js/xss-through-dom` warnings on the import
wizard's template links. The links now take their `dataSet` from the declared option list instead of
the select's DOM value, so the next analysis closes them. The report-only image scan of
`sha-fadc98d` currently reports 30 CRITICAL/HIGH CVEs, mostly in npm's bundled tooling inside the
base image; that is a triage backlog, not a merge gate yet.

On 17 November 2026 a new upstream advisory (CVE-2026-112366, picomatch ReDoS) arrived with no patched
release published (GHSA-fc5q-39xc-vjpf: `first_patched_version` null). It is waived in
`ci/security-baseline.json` until 31 December 2026 for the transitive build tooling; remove the waiver
as soon as picomatch publishes a fix.
