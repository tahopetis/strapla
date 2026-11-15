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

It is currently **`none` — shadow mode**: every scanner runs and reports, but findings do not block.
Raise it to `high` once the first report has been triaged. From then on the gate blocks at `high` and
`critical`.

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

1. Read the **last line** of the job log; it is the verdict.
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

First full run: `SECURITY: PASS (shadow: FAIL_ON=none)` with
`secrets=ok/0 deps=ok/3 sast=ok/11` — 0 critical, 1 high, 13 medium. The one high finding and the
mediums need triage before `FAIL_ON` moves to `high`.
