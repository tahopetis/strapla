# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations — or, on the Android host this repo is developed on, the `gh-api` helper (see **On this device** below).

## On this device (Android / bionic)

This repo is developed on an Android host where the `gh` CLI is installed but **its network commands do not run**: Android has no `/etc/resolv.conf`, so a static Go binary cannot resolve DNS, and seccomp kills some subcommands with `SIGSYS`. `gh auth status` therefore reports "token invalid" while `gh auth token` still returns a working token — trust the token, not the status.

Two helpers on `PATH` read that token themselves and work:

- **`gh-api [-X METHOD] [-d BODY] <path|url>`** — one authenticated REST call. Prints the response body and exits 1 on HTTP >= 400 (the body is still printed, so an error is not swallowed).
- **`gh-logs <owner/repo> <run-id> [--tail]`** — the full plaintext log of a workflow run, one job after another (`--tail` keeps the last 200 lines of each). Run ids: `gh-api /repos/OWNER/REPO/actions/runs?per_page=5`.

The `dsh-github` plugin tools (`gh_issue`, `gh_repo`, `gh_search`, `gh_review`, `gh_file`, `gh_checks`) use their own HTTP stack and work as well.

With `R=tahopetis/strapla`, the operations under **Conventions** become:

- Create: `gh-api -X POST /repos/R/issues -d '{"title":"...","body":"...","labels":["needs-triage"]}'`
- Read: `gh-api /repos/R/issues/<n>`
- List open: `gh-api '/repos/R/issues?state=open&per_page=50'`
- Comment: `gh-api -X POST /repos/R/issues/<n>/comments -d '{"body":"..."}'`
- Add a label: `gh-api -X POST /repos/R/issues/<n>/labels -d '{"labels":["ready-for-agent"]}'`
- Remove a label: `gh-api -X DELETE /repos/R/issues/<n>/labels/<name>` (URL-encode spaces)
- Close: `gh-api -X PATCH /repos/R/issues/<n> -d '{"state":"closed"}'`
- List labels: `gh-api '/repos/R/labels?per_page=100'`

Every `gh api ...` fallback written out in **Conventions** (sub-issues, blocked-by edges, blocker counts) maps 1:1 — swap `gh api` for `gh-api`, and pass the method as `-X`.

`gh-api` sends no `Accept` header, so it cannot fetch a PR diff — use the `gh_review` tool with `fields: ["diff"]` for that.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Count open blockers**: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` (open blockers only; 0 means startable). `gh issue view <n> --json blockedBy` also lists closed blockers, so filter it: `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: post the explanation with `gh issue comment <number> --body "..."`, then `gh issue close <number>`. On an already-closed issue, `gh issue close --comment` drops the comment and still exits 0.

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

File issues only into the user's own repo. Never file into `mattpocock/skills` (the repo these skills come from) unless the user owns it. In a fork, `gh` can default to the upstream parent, so before the first `gh issue create` of a session, check the target with `gh repo view --json nameWithOwner` and confirm it with the user if it is not their repo.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number>`, then `gh pr view <number> --comments` (off a TTY, `--comments` prints only the comments, not the body), and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see **Blocking** under Conventions.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (see **Count open blockers**, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
