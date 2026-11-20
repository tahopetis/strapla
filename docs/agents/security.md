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
| `image-scan` | Trivy CVEs in the container image: the PR build (linux/amd64, local) before merge, the `docker` run's published `sha-<commit>` image after it, and `:latest` weekly; SARIF to the Security tab at every severity (a fork/Dependabot PR or an ad-hoc `image_ref` run still blocks, but its token cannot publish) | **Blocking** on CRITICAL/HIGH (required check) |
| GitHub secret scanning | full repository history plus push protection | **Blocking** (push protection) |

`image-scan` runs on **pull requests** as well. There it builds the image locally (`linux/amd64`,
never pushed) because the `docker` workflow deliberately does not publish PR images — a check that
only ran after a merge could not be required on a pull request. For a `docker` run it scans the exact
image that run published (`sha-<commit>`) rather than `:latest`, so it can never analyse a stale image.
A scheduled run scans `:latest`; a manual run scans `:latest` unless it passes the `image_ref` input.

### Image scan policy

The scan blocks on **CRITICAL and HIGH**. Two passes produce that:

- **Record** — Trivy runs with `exit-code: 0` and no severity filter, so every severity reaches the
  Security tab. An alert that is no longer reported by a later analysis closes as fixed.
- **Decide** — Trivy runs scoped to `CRITICAL,HIGH` with `exit-code: 1`. That step is the verdict,
  and on a red job its table in the log carries the detail (package, CVE, fixed version).

The split exists because `trivy-action` ties `--severity` to both the report and the exit code: for
SARIF output it unsets `--severity` unless `limit-severities-for-sarif` is set, so one pass cannot
keep MEDIUM findings visible *and* fail only on HIGH ones. Do not collapse the two passes without
accepting the loss of medium/low tracking — the first iteration of this workflow declared
`severity: CRITICAL,HIGH` and still uploaded 23 MEDIUM and 1 LOW alert because of that coupling.

`ignore-unfixed: false` in both passes: an unfixable CRITICAL/HIGH is still a CRITICAL/HIGH, and the
gate must see it. Accepting one is an explicit, dated decision recorded in
`ci/image-scan-waivers.yaml` (Trivy YAML: `id`, `statement`, `expired_at`). The workflow passes that
file to the **decide pass only**, so the finding leaves the gate but stays in the Security tab until
it is fixed — a waiver silences the gate, never the record. (The file is deliberately not named
`.trivyignore.yaml`: Trivy plans to auto-load that name, which would silence the record pass too.)
Trivy stops honouring an entry after `expired_at`, so the gate returns by itself. No wildcard ids, no
broad ignore files, and never `ignore-unfixed: true` as a way to go green.

The gate is proven, not assumed: a manual run with
`image_ref=ghcr.io/tahopetis/strapla:sha-fadc98d` (a deliberately pre-fix image) fails on its 6 HIGH
findings, while the current image passes.

GitHub's dependency alerts and automated security fixes are enabled as well; Dependabot PRs pass
through the same gate.

## Rules

- **Never merge a red `security-gate`.** Fix the finding, or waive it with a reason.
- **Waivers** for the security gate live in `ci/security-baseline.json`, keyed `scanner:rule:path`,
  each with a non-empty `reason` and an `expires` date. An expired waiver counts the finding again and
  prints `expired-waiver`. The image scan has its own store, `ci/image-scan-waivers.yaml` (see
  [Image scan policy](#image-scan-policy)); the two are not interchangeable.
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
4. For CodeQL and dependency review findings, open the repository's **Security** tab; the alert
   carries the rule, path and severity. For the image scan, the failing check is authoritative — its
   `Fail on CRITICAL/HIGH` step prints the table (package, CVE, fixed version) — while the Security
   tab holds the complete record at every severity.
5. Waive only what has been read: `scanner:rule:path` plus a reason and an expiry in
   `ci/security-baseline.json` for the gate, or a dated entry in `ci/image-scan-waivers.yaml` for the
   image scan.

The job summary carries counts, not paths. Keep it that way: a path list in a status is a map of
where to look.

## Dependabot

`.github/dependabot.yml` keeps npm dependencies (weekly) and Docker base images (monthly) fresh.
**Vulnerability alerts** and **automated security fixes** are repository settings, not workflow
configuration; they are enabled for this repository. They open PRs; the gate decides whether they
merge.

## Required status checks

The repository is public, so branch protection on `main` is available on GitHub Free and is enabled
with these required checks: `verify` (ci), `build` (docker), `security-gate`, `Dependency review`,
`Analyze (javascript-typescript)` (CodeQL) and `Trivy image scan` (image-scan). A red or missing
required check blocks the merge. Each of them runs on pull requests — that is the test for requiring
a check at all; a check that only runs after the merge holds every PR open forever.

## Current state (November 2026)

The repository is public and MIT-licensed; secret scanning and push protection are enabled. The
container package `ghcr.io/tahopetis/strapla` is public as well: anyone can pull a published image,
and pushing requires repository write access (normally only the `docker` workflow's
`GITHUB_TOKEN`). The security gate runs four scanners and reports **0 findings at any severity**,
with one open waiver.
The threshold is `medium`; the gate passes on its own merits rather than shadow mode. CodeQL,
dependency review and the image scan are required on pull requests.

The first CodeQL analysis (20 November 2026) flagged two `js/xss-through-dom` warnings on the import
wizard's template links. The links now take their `dataSet` from the declared option list instead of
the select's DOM value, so the next analysis closes them.

The image scan's first report (`sha-fadc98d`, 20 November 2026) opened **30 alerts: 6 HIGH, 23
MEDIUM and 1 LOW**. All 30 were fixed rather than waived, and the image now reports **0 findings at
any severity**:

| Where | Findings | Fix |
|---|---|---|
| npm's bundled toolchain inside the image (undici, brace-expansion, glob, minimatch, ip-address, postcss-selector-parser) | 6 HIGH, 12 MEDIUM, 1 LOW | npm and pnpm are build-stage tools; the runtime stage removes them, and nothing in the container runs them |
| Alpine packages in `node:26-alpine` (libcrypto3, libssl3 3.5.9-r0; zlib 1.3.2-r1) | 11 MEDIUM | `apk upgrade` for those three packages — the base tag was already at its newest digest (2026-11-11), so a digest bump could not have fixed them |

Base-image changes now arrive as a reviewable diff (the `FROM` line is pinned by digest and
Dependabot's docker ecosystem moves it), and a new CRITICAL/HIGH finding fails the check with its own
table. No image-scan waiver has been needed: `ci/image-scan-waivers.yaml` is empty.

On 17 November 2026 a new upstream advisory (CVE-2026-112366, picomatch ReDoS) arrived with no patched
release published (GHSA-fc5q-39xc-vjpf: `first_patched_version` null). It is waived in
`ci/security-baseline.json` until 31 December 2026 for the transitive build tooling; remove the waiver
as soon as picomatch publishes a fix.
