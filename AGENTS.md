## Agent skills

### Issue tracker

Issues and specs live as GitHub issues — `gh` CLI, or `gh-api`/`gh-logs` on this Android device. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical names, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Security

Every pull request runs `security-gate` (secrets, dependencies, SAST, IaC misconfiguration) beside `ci`, CodeQL, `dependency-review` and a blocking Trivy image scan of the PR build; after a merge the published image is scanned again at CRITICAL/HIGH. Never merge with a red gate; only `SECURITY: PASS` is green, and `ERROR`/`SETUP`/`OFF` are red too. Waivers live in `ci/security-baseline.json` (security gate) or `ci/image-scan-waivers.yaml` (image scan), each with a reason and an expiry — never edit a scanner to go green. `FAIL_ON` is a repository variable, set to `medium`: findings at medium and above block a merge. The repository is public; GitHub secret scanning and push protection are enabled. Full contract: `docs/agents/security.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
