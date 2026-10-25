# ADR-0002: Authentication, sessions, and deployment

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Portfolio owner (approval), engineering lead (proposal)
- **Related:** [Charter §5](../CHARTER.md), [ADR-0001](0001-stack.md), [ADR-0004](0004-audit-and-roles.md)

## Context

- Every account in v1 is an administrator ([charter §5](../CHARTER.md)), so there is no role model to integrate with an identity provider.
- The production host is undecided; go-live is December 2026. The app must not depend on a domain, an identity provider, or an email service that does not exist yet.
- Financial data is sensitive (charter R4). Sessions, password storage, and backups are the security-critical parts.
- Deployment must be boring: one app container, one PostgreSQL container, one nightly backup, upgradeable by pulling an image.

## Decision

### Accounts and passwords

- Accounts are created by an administrator (first-run setup creates the first one only when no users exist). **No self-service signup.**
- Identity is a unique, lower-cased email plus a display name. Accounts can be deactivated, never deleted (audit references must survive).
- Passwords are hashed with **Node's built-in `scrypt`** (`node:crypto`), avoiding native builds on arm64/musl: 16-byte random salt, `N = 2^15`, `r = 8`, `p = 1`, 64-byte key, `maxmem = 64 MiB`, stored as `scrypt$N$r$p$salt$key` (base64). Verification is timing-safe.
- Password minimum length is 12 characters. Administrators reset a forgotten password by setting a temporary one and communicating it out of band; **the app sends no email**.
- Login attempts are rate-limited in memory (single-node deployment).

### Sessions

- Opaque random token (32 bytes, base64url) in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie; `Secure` when the app is served over HTTPS.
- The database stores only the SHA-256 of the token in a `sessions` table with `user_id`, `created_at`, `expires_at`, `last_seen_at`, and `revoked_at`.
- Sessions expire 30 days after sign-in; signing in again issues a new session. A password change or administrator reset revokes all of the account's sessions (sessions are revocable from the database at any time).
- Authentication is enforced by a server-side helper used in the root layout and in every mutating server action; there is no client-side trust.

### Audit of security events

- Account creation, deactivation, password resets, and session revocations are recorded as audit entries.
- Login successes and failures are written to the application log, not the audit table (volume/noise), for v1.

### Deployment

- Multi-stage `Dockerfile`: pnpm install → `next build` (standalone output) → runtime image on `node:24-alpine`, non-root user, `HEALTHCHECK` against `/healthz`.
- `docker-compose.yml` at the repo root: `app`, `db` (`postgres:18-alpine`), and a backup service. PostgreSQL data lives in a named volume. Migrations run on app start (`drizzle-kit migrate` in the entrypoint) before the server starts — single-instance deployment, so this is safe.
- Configuration is environment only: `DATABASE_URL` and `APP_BASE_URL`. Nothing else is required to boot.
- Images are published to private GHCR as **multi-arch** (`linux/amd64`, `linux/arm64`) with `sha-<commit>` and `latest` tags, so the same image runs on the dev box and on a future VPS.
- TLS terminates at a reverse proxy (Caddy or the platform) once a host and domain exist. Until then the app runs on HTTP for local use; the secure-cookie flag follows `APP_BASE_URL`.
- **Nightly backup:** `pg_dump -Fc` to a mounted volume, retained 30 days; a documented restore procedure is part of M0 and is tested at least once. Off-site copies are deferred until the host is known.

### Host decision

Host, domain, TLS and SSH ownership are deferred (charter §11); images and compose deployment are prepared now so the decision is a deployment, not a build.

## Consequences

- No external dependency before go-live; SSO can be added later because email is the identity key and `users` has no provider coupling.
- The in-memory login limiter is per-process; the deployment is a single instance, so this is adequate.
- Migrating on container start is simple but means a bad migration delays boot; migrations are reviewed in PRs and tested in CI.
- Multi-arch images double CI build time but keep both the dev box (arm64) and a conventional VPS (amd64) deployable with the same tag.

## Alternatives considered

- **Google Workspace / Microsoft 365 SSO:** requires a domain, OAuth client registration, and a reachable callback URL, none of which exist before hosting is chosen. Deferred.
- **Magic-link email:** requires an email service and deliverability work; overkill for a handful of accounts.
- **`argon2` / `bcrypt` native modules:** strong algorithms but native build dependencies on arm64/musl; `scrypt` is a standard, memory-hard alternative in Node core.
- **JWT sessions:** no server-side revocation without a deny-list; a database session table is simpler and auditable.
