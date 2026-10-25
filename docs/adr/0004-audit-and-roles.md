# ADR-0004: Audit trail and the administrator role

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Portfolio owner (approval), engineering lead (proposal)
- **Related:** [Charter §5, §6.7, §6.8](../CHARTER.md), [ADR-0002](0002-auth-and-deployment.md)

## Context

The owner's stated need is *full traceback without rollback*: every change must be attributable and reconstructable, but there is no undo, no version restore, and no reopening of closed years. Financial records must never be hard-deleted (BR-14). In practice the user base is the portfolio owner plus a handful of team members who all need the same power to manage members, correct mistakes, and work across the whole plan — including closed-year corrections.

## Decision

### Roles

- v1 has exactly one role: **administrator**. Every authenticated account is an administrator. There is no editor, viewer, or read-only role in v1 (this is a deliberate change from charter v0.1 §5).
- Administrators manage members: create accounts, set temporary passwords, deactivate accounts. Accounts are never deleted because audit entries reference them.
- Directors and finance do not get accounts in v1; they receive CSV/XLSX exports and print views.

### Audit trail

- An append-only `audit_entries` table records every mutation of an auditable entity: actor user, action, entity type and id, `before` and `after` JSONB snapshots, optional reason, and server timestamp.
- Auditable entities: strategic plans, SIs, annual plans (including status changes and close), annual programs, projects, project year allocations, recurring ops items, ijin prinsip records, commitment entries, settlements, spend entries, spend categories, opening balances, users/membership, and session revocations.
- The audit entry is written **in the same database transaction** as the mutation, through the shared mutation helper. A mutation that cannot write its audit entry fails.
- Reads and logins are not audited in the database (logins go to the application log).
- Audit rows cannot be updated or deleted by application code; there is no endpoint that exposes either operation.

### Editing rules

- While a fiscal year is **open** (annual plan draft or active), administrators edit records in place. Every update and void requires a **reason**; creates do not.
- `before`/`after` snapshots make each change reconstructable without a version-restore feature.
- Cancellation uses a **void status with a reason**; records are never hard-deleted.
- While a fiscal year is **closed**, ordinary mutations are blocked. Administrators may perform audited corrections with a reason. Settlement lifecycle events (ADR-0003) are allowed after close and are audited.
- There is no reopen of a closed year, no rollback, no undo, and no version restore.

### Visibility

- Audit history is visible to administrators only — which, in v1, is every user. The per-record history panel and the searchable audit view ship in M5; until then, history is available via the audit table and the admin data view.

## Consequences

- Full traceability with minimal machinery: no event sourcing, no version tables, no soft-delete maze — just immutable audit rows plus void status.
- Because every user is an administrator, "closed-year corrections are administrator-only" is a guardrail of *logged intent*, not a privilege boundary. The audit trail, not a permission difference, is what protects the data. If read-only or editor roles are ever wanted, the `users` table gains a role column and the policy functions change; no schema rewrite is needed.
- Mandatory reasons on every edit add friction; accepted because the owner explicitly prioritised traceback.
- Audit volume grows with every edit; retention is permanent (charter §11 Q10), and the table is the largest in the system. Indexed by entity and time from day one.

## Alternatives considered

- **Editor/admin split (charter v0.1):** rejected by the owner — the team is small, trusted, and everyone needs administrative capability.
- **Database triggers capturing every change:** stronger against bypass, but harder to test, reason-about, and agent-maintain; the single mutation helper gives equivalent coverage because all writes go through it.
- **Event sourcing:** overkill for this application and inconsistent with "no rollback".
- **Soft-delete flags on every table instead of void status:** equivalent outcome, more scattered logic; a uniform void status plus audit snapshots is simpler.
