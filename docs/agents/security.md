# Security gate

Every pull request runs `security-gate` beside `ci`. It is **closed by default**: a
missing scanner, a crashed install, unparseable output, a bad threshold, an expired waiver or no
scanners at all is red — the gate never goes green because nothing ran.

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

Only `PASS` is green. `ERROR` and `SETUP` mean the environment or the config is wrong, not that the
code is clean; `OFF` means nothing was scanned. Re-running the same commit does not fix `ERROR`/`SETUP`.

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
4. Waive only what has been read: add `scanner:rule:path`, a reason and an expiry to
   `ci/security-baseline.json`.

The job summary carries counts, not paths. Keep it that way: a path list in a status is a map of
where to look.

## Dependabot

`.github/dependabot.yml` keeps npm dependencies (weekly) and Docker base images (monthly) fresh.
**Vulnerability alerts** and **automated security fixes** are repository settings, not workflow
configuration; they are enabled for this repository. They open PRs; the gate decides whether they
merge.

## Required status check

Branch protection is not available on this private repository on the current GitHub plan
(`403: Upgrade to GitHub Pro or make this repository public`). Until the plan changes, the gate is
enforced **by process**: every change lands through a pull request whose `ci` and `security-gate`
checks are green. Treat a red or missing check as a stop.

## Current state (November 2026)

After the first triage: four scanners, **0 findings at any severity**, no waivers. The threshold is
`medium`; the gate now passes on its own merits rather than shadow mode.

On 17 November 2026 a new upstream advisory (CVE-2026-112366, picomatch ReDoS) arrived with no patched
release published (GHSA-fc5q-39xc-vjpf: `first_patched_version` null). It is waived in
`ci/security-baseline.json` until 31 December 2026 for the transitive build tooling; remove the waiver
as soon as picomatch publishes a fix.
