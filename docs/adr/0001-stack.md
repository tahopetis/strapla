# ADR-0001: Stack — TypeScript monolith on Next.js, PostgreSQL 18, and Drizzle

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Portfolio owner (approval), engineering lead (proposal)
- **Related:** [Charter §4](../CHARTER.md), [ADR-0002](0002-auth-and-deployment.md), [ADR-0003](0003-funding-and-settlement.md)

## Context

- Strapla is an internal web app for a small team of administrators (single digit). It must be deployed as one service, with no dedicated operations staff.
- The first usable release is the FY2027 plan in **December 2026** — about seven weeks from the decision — so iteration speed and convention matter more than novelty.
- Money correctness is the core risk: whole Rupiah, integer-safe arithmetic, auditable rules, and tests that prove the funding formulas.
- The production host is not chosen yet. It may be a small VPS (1–2 vCPU), the existing dev box (arm64 Alpine), or an internal server. The stack must run in Docker on both amd64 and arm64.
- The code is built and maintained with AI agents; mainstream conventions, strong typing, and explicit schemas matter more than minimal bundle size.
- The build environment is Linux arm64/Alpine (musl) with Node 24, pnpm 11, and a working Docker daemon.

## Decision

1. **Language:** TypeScript everywhere, `strict` mode, one deployable application.
2. **Framework:** Next.js 16 (App Router) on Node 24. Server components for reads, Server Actions for mutations, route handlers for CSV/XLSX downloads and health checks. Print-friendly report routes provide browser-generated PDFs.
3. **Database:** PostgreSQL 18 (`postgres:18-alpine`, pinned to the 18.x line) for concurrent editors, transactional reporting, and mature backup/restore tooling.
4. **Persistence:** Drizzle ORM with committed, versioned SQL migrations (`drizzle-kit`). Schema lives in TypeScript; no runtime-magic ORM.
5. **UI:** Tailwind CSS 4 with a small set of local components; no component library in v1.
6. **Validation:** Zod 4, shared by client forms and server actions.
7. **Domain rules:** pure functions in `src/domain`, operating on plain objects with integer Rupiah values. The UI and database layers call the domain; they never re-implement a formula.
8. **Testing:** Vitest 5 for domain unit and property tests (the funding math is exhaustively tested); Playwright 1.64 for critical end-to-end flows. No React component unit tests in v1.
9. **Tooling:** pnpm, GitHub Actions CI (typecheck, lint, unit tests, build, E2E once stable), private GHCR images, Docker Compose deployment (`app` + `db` + backup).
10. **Money:** whole Rupiah only. Postgres `bigint`; JavaScript `number` guarded by `Number.isSafeInteger`. No floating-point arithmetic on money, ever. No rounding in storage; display may round.

## Consequences

- One language and one runtime; forms are server-rendered, so the client keeps almost no state and the app is easy to agent-maintain.
- Next.js is a large framework and its upgrade cadence is a real cost. Keeping the money rules in `src/domain` (pure, framework-free) keeps the business logic portable if the framework is ever replaced.
- PostgreSQL adds one service compared with SQLite, but gives transaction isolation, SQL reporting and dependable dumps — the right trade for financial records.
- Server Actions couple mutations to the framework; route handlers are the escape hatch if we need a machine-facing API later (e.g. CSV import in a later phase).
- Native arm64/musl packages are verified to exist for the compiled parts of the stack (Next SWC, Tailwind oxide). `argon2` is not used; password hashing uses Node's built-in `scrypt` (see ADR-0002) to avoid native build dependencies.

## Alternatives considered

- **SvelteKit or React Router 7:** equivalent runtime shape and simpler in places, but less ecosystem/documentation for agent maintenance, and no operational difference.
- **Rails / Django:** neither runtime is available on the build box, and both add operational surface for an app this size.
- **SPA + separate API:** two moving parts and more glue for no benefit; the app is form-heavy.
- **SQLite:** simplest possible ops, but weaker concurrent-writer story for a shared team tool and no mature drop-in reporting/backup tooling comparable to `pg_dump`.
