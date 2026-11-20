# Strapla

IT portfolio management: plan it, fund it, execute it, spend it, and report it in one place.

Built from the project charter ([`docs/CHARTER.md`](docs/CHARTER.md)) and the architecture decisions in [`docs/adr/`](docs/adr/). The domain vocabulary is [`GLOSSARY.md`](GLOSSARY.md); the target schema is [`docs/data-model.md`](docs/data-model.md).

## Status

| Milestone | State |
| --- | --- |
| **M0 Skeleton** | Done: Next.js 16 + PostgreSQL 18 + Drizzle, sessions and local auth, audit plumbing, CI, Docker images, deployment and restore drill |
| **M1 Plan** | Done: strategic plan and SIs, annual plans, programs with continuation, projects with ijin prinsip, recurring ops, opening balances, E2E happy path |
| **M2 Funding** | Done: project year allocations, balances and flag engine, pricing chain/contract value, reports with CSV/XLSX exports and print views |
| **M2.5 Insight** | Release-ready: administrator accounts, audit trail, UAT plan, opening-balance load workplan and go-live checklist done — awaiting host + owner UAT |
| **M3 Execution** | Spend entries, commitments, settlement |
| **M4 Multi-year** | Done: year close + carry-over, closed-year locks, program threads |
| **M5 Insight** | Done: portfolio dashboard, audit search + CSV export, reporting polish |

The issue tracker holds the work breakdown; milestones mirror the charter. The app has an in-app **Help** page with the quick guide; the full guide is [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

Readiness documents for the December release: [UAT plan](docs/UAT-PLAN.md), [opening-balance load](docs/OPENING-BALANCE-LOAD.md), [go-live checklist](docs/GO-LIVE-CHECKLIST.md), [user guide](docs/USER-GUIDE.md), [release notes](docs/RELEASE-NOTES-2026-12.md).

## Images, versions and updates

GitHub Actions builds and publishes the multi-arch image on every push to `main`:

- `latest` — the current `main` build
- `sha-<commit>` — one immutable tag per commit
- `v<year>.<month>.<patch>` / `<year>.<month>` — release tags (for example `v2026.12.0` → `2026.12.0`, `2026.12`)

The running build is shown in the app header (version · commit), so you can always see which image is live.

Update a deployment to the newest published image (this matters when a host has an older image
cached — Docker Compose reuses a local image and will not pull by itself):

```bash
docker compose pull app
docker compose up -d --force-recreate app
```

To pin a release, set `STRAPLA_TAG=v2026.12.0` in `.env`. The image is published publicly, so
pulling needs no registry login.

## Local development

Requires Node 24 or later (CI and the container use Node 26 LTS), pnpm 11 and Docker.

```bash
pnpm install
cp .env.example .env          # adjust DATABASE_URL if needed
docker compose up -d db       # PostgreSQL 18 on localhost:5432
pnpm db:migrate               # apply the committed migrations
pnpm dev                      # http://localhost:3000
```

When the Drizzle schema changes: `pnpm db:generate` creates a new migration in `drizzle/` (commit it), then `pnpm db:migrate` applies it.

First visit: `/setup` creates the first administrator (only when no users exist), then sign in.

### Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Start the production build |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm lint` | ESLint |
| `pnpm copy:guard` | Copy guard: fails on milestone IDs, hard-coded fiscal years and unlisted ADR/BR references in page/component copy |
| `pnpm test` | Vitest unit tests (domain and helpers) |
| `pnpm opening:template <data-set> --closing-fiscal-year <year> [--format csv\|xlsx]` | Generate an opening-balance import template |
| `pnpm opening:validate <data-set> <file>` | Dry-run an opening-balance import file (no writes) |
| `pnpm db:generate` | Generate a migration from the Drizzle schema |
| `pnpm db:migrate` | Apply pending migrations (`scripts/migrate.mjs`) |
| `pnpm e2e` | Playwright end-to-end tests (needs a fresh database; see below) |

### End-to-end tests

Playwright drives the full plan happy path against a fresh database:

```bash
docker compose exec -T db psql -U strapla -d postgres -c 'CREATE DATABASE strapla_e2e'
DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm db:migrate
DATABASE_URL=postgres://strapla:strapla@localhost:5432/strapla_e2e pnpm e2e
```

CI runs the same suite with a PostgreSQL service and the Playwright-managed Chromium.

### Docker

```bash
docker compose up -d db        # database only, for local development
docker compose up -d           # full stack (pulls the published GHCR image)
docker compose build app       # build the app image locally
```

Images are multi-arch (`linux/amd64`, `linux/arm64`) published to public GHCR on `main`; see [`docs/operations.md`](docs/operations.md).

## Layout

```
src/
├── app/              Next.js App Router routes (auth pages, protected shell, /healthz)
├── db/               Drizzle schema and client
├── domain/           Pure money and funding rules (framework-free, unit tested)
├── lib/              Display formatting and CSV/XLSX import/export adapters
└── server/           Auth, sessions, audit trail, server actions
docs/                 Charter, ADRs, data model, operations
drizzle/              Generated SQL migrations (committed)
scripts/migrate.mjs   Migration runner used at container start
scripts/opening-import.ts  Opening-balance import CLI (template, dry run, field list)
```

## Conventions

- Money is whole Rupiah integers; all money arithmetic lives in `src/domain` (ADR-0003).
- File I/O and Excel/CSV adapters live in `src/lib`; `src/domain` stays framework-free.
- Every mutation writes an audit entry in the same transaction (ADR-0004).
- No hard deletes: cancellation is a void status with a reason.
- Planning artifacts and issues are the source of truth; code follows them.

## Security

Every pull request and push runs a closed-by-default `security-gate` (secrets,
dependencies, SAST, container/IaC configuration) plus CodeQL, dependency
review and a blocking Trivy CVE scan of the container image. GitHub secret
scanning and push protection are enabled on the repository. The contract is
[`docs/agents/security.md`](docs/agents/security.md).

To report a vulnerability, use GitHub's private vulnerability reporting — see
[`SECURITY.md`](SECURITY.md).

## License

MIT. See [`LICENSE`](LICENSE).
