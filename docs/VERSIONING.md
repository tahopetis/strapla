# Versioning and releases

Strapla uses [Semantic Versioning 2.0.0](https://semver.org/): **MAJOR.MINOR.PATCH**.
This page is the policy and the release checklist. The release history is [CHANGELOG.md](../CHANGELOG.md);
the current release is [v0.5.0](RELEASE-NOTES-0.5.0.md).

## The version line

| Version | Meaning |
| --- | --- |
| `0.y.z` | Public beta. Minor releases may add, change or remove behaviour; `/setup`, data entry and reports are usable, but the API and database schema can still change between minors. |
| `1.0.0` | General availability. Reached when the owner UAT and the host go-live checklist are complete and no open defect blocks the annual cycle. |
| `x.Y.z` (patch) | Backwards-compatible fix. No schema change that requires action beyond the automatic migration, no user-visible workflow change. |
| `x.y.Z` (minor) | Backwards-compatible feature work. New fields, screens or reports; migrations are additive. |
| `X.y.z` (major) | Breaking change. Upgrade notes call it out and a backup is required; at `1.x` this would mean a deliberate compatibility break. |

The 0.x line is the beta by definition: it is not a claim that any particular build is unstable, but it
does mean a minor release may require you to re-check a workflow. Patch releases are the safe update.

## Tags and images

- A release is an **annotated** Git tag `vMAJOR.MINOR.PATCH` on the merge commit of the release PR,
  for example `v0.5.0`.
- The tag push builds the multi-arch image and publishes the SemVer image tags:
  `v0.5.0` → `0.5.0` and `0.5` (image tags carry no `v`).
- `latest` follows the `main` branch, not the newest release; `sha-<shortsha>` is immutable per commit.
- Deployments pin `STRAPLA_TAG` to a release (`0.5.0`) or a `sha-` tag; see
  [operations.md](operations.md).

The legacy calendar-versioned tag `v2026.12.0` (2026-10-26) remains published as `2026.12.0` / `2026.12`
for reproducibility. It is superseded by `v0.5.0` and is not part of the SemVer sequence.

## Release procedure

Do this from a clean `main` checkout, with the [release PR](#the-release-pr) merged and every required
check green. Never tag a red or untested commit.

1. **Prepare** — the release PR has: `package.json` version, the `CHANGELOG.md` entry, the release
   notes (`docs/RELEASE-NOTES-<version>.md`), and any documentation updates. The version in
   `package.json` and the tag must match.
2. **Gate** — `ci`, `security-gate`, `codeql`, `docker`, `image-scan` and dependency review are green
   on the release commit. Dispatch the on-demand regression (`regression.yml`, tier `all`) before a
   release; it must pass. The security contract is [agents/security.md](agents/security.md).
3. **Merge** — merge the release PR to `main` (squash, matching the repository convention). The merge
   commit is the release commit.
4. **Tag** — create the annotated tag on that merge commit and push it:

   ```bash
   git switch main
   git pull --ff-only
   git tag -a v0.5.0 -m "Strapla v0.5.0 (beta)"
   git push origin v0.5.0
   ```

5. **Publish** — the tag push runs the `docker` workflow. Wait for it to finish and confirm the image
   tags exist (`0.5.0`, `0.5`). Then create the GitHub release for the tag from
   `docs/RELEASE-NOTES-<version>.md`:

   ```bash
   gh release create v0.5.0 \
     --title "Strapla v0.5.0 (beta)" \
     --notes-file docs/RELEASE-NOTES-0.5.0.md \
     --prerelease
   ```

   Use `--prerelease` for a beta, release-candidate or other build that should not be presented as
   the stable latest release.
6. **Verify** — pull the published image on a host (or run it locally) and check `/healthz`, sign-in,
   the header version (`v0.5.0 · <commit>`) and the migrations line in the container logs.
7. **Announce** — share the release notes with the owner/directors, and note the pinned image tag.

## The release PR

A release PR contains only release preparation — no feature work — so the tag points at a commit
whose diff is exactly what the release notes describe:

- `package.json` → the new `version`.
- `CHANGELOG.md` → the new version section, dated, with every user-visible change and its PR.
- `docs/RELEASE-NOTES-<version>.md` → the release body (scope, upgrades, limitations, evidence).
- documentation updates that would otherwise be stale on release day (user guide, README, operations).

The pull request body links the regression run, the security-gate result and the changelog section.

## Patch and hotfix releases

1. Branch from the release tag (`fix/<short-name>`), make the smallest fix and add a test.
2. Update `CHANGELOG.md` under a new patch version (for example `0.5.1`) and `package.json`.
3. Run the same PR gate as a normal change; merge to `main`.
4. Tag `v0.5.1` on the merge commit and publish it as a normal release (not a pre-release).
5. Deployments that pin `0.5.0` must change `STRAPLA_TAG`; say so in the release notes.

## Database changes

Migrations are forward-only and run automatically when the container starts. A release that adds a
migration must:

- mention it in the release notes and call out any behaviour change it enables;
- take a backup before upgrading production ([operations.md](operations.md));
- not require a manual SQL step — if one is ever required, it is a release blocker, not a note.

v0.5.0 adds five migrations (`0005`–`0009`) over the legacy `v2026.12.0`:
`0005_opening_balance_reconciliation`, `0006_chief_smasher`, `0007_cold_ghost_rider`,
`0008_foamy_ken_ellis` and `0009_gigantic_dark_phoenix`.

## Version history

| Version | Date | Status | Notes |
| --- | --- | --- | --- |
| `v0.5.0` | 2026-11-22 | Beta | First SemVer release: execution and settlement (including post-close treatment), year close and multi-year, dashboard/insight, opening-balance import wizard, custom fields, regression suite and security hardening. |
| `v2026.12.0` | 2026-10-26 | Legacy | First release, calendar versioning. Plan, funding, administration and platform. Superseded by v0.5.0. |
