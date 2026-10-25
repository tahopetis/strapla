# M2.5 Insight — checkpoint evidence (members and audit trail)

Captured 2026-10-26 against the dev server with PostgreSQL 18.

| Screenshot | What it shows |
| --- | --- |
| `01-members.png` | Member management: create account, per-member actions (reset password, revoke sessions, deactivate/reactivate), statuses and active session counts |
| `02-audit-trail.png` | Audit trail filtered to `user`: member creation, password reset, session revocation and deactivation with actor, reason and before/after values |
| `03-record-history.png` | Per-record change history embedded on the project page (append-only audit entries for that project) |

## Browser verification (headless Chromium)

1. `/admin` hub links members and the audit trail and shows the signed-in administrator.
2. Create a second administrator with name, email and initial password; the account appears with an
   active badge and zero sessions.
3. Reset its password (audited, sessions revoked), revoke sessions (audited), then deactivate the
   account with a reason — the account shows `deactivated` and remains listed (accounts are never
   deleted).
4. `/admin/audit?entityType=user` shows `member_create`, `password_reset`, `session_revoke` and
   `member_deactivate` with actor, reason and before/after values.
5. The project page shows its own change history (create/update/void entries with reasons).

## Safety rules verified in code

- A user cannot deactivate their own account, and the last active account cannot be deactivated.
- Deactivation and password reset revoke every session for that account.
- Passwords are hashed with scrypt; audit entries never contain password material.
- Every member action writes an audit entry in the same transaction (ADR-0004).
