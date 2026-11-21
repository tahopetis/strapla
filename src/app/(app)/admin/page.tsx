import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requireUser } from '@/server/auth/session';
import { countActiveMembers, countAuditEntries } from '@/server/admin/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administration' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function AdminPage() {
  const user = await requireUser();
  const [memberCount, auditCount] = await Promise.all([countActiveMembers(), countAuditEntries()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration"
        description="Every account is an administrator in v1 (ADR-0004): member management and the full audit trail."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Members"
          description="Create accounts, reset passwords, revoke sessions, deactivate or reactivate."
          actions={<Badge>{memberCount} active</Badge>}
        >
          <p className="text-sm text-slate-700">
            Accounts are never deleted: deactivation keeps the audit references intact. The last active
            account cannot be deactivated.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/admin/members" className={linkClass}>
              Manage members
            </Link>
          </p>
        </Card>

        <Card
          title="Audit trail"
          description="Every change with actor, action, before/after values and reason, filterable by entity and actor."
          actions={<Badge>{auditCount} entries</Badge>}
        >
          <p className="text-sm text-slate-700">
            The audit trail is append-only and is written in the same transaction as every mutation
            (ADR-0004).
          </p>
          <p className="mt-4 text-sm">
            <Link href="/admin/audit" className={linkClass}>
              Open the audit trail
            </Link>
          </p>
        </Card>

        <Card
          title="Custom fields"
          description="Define extra typed fields on plan records: shown on forms, record pages, reports and exports, and never used in money rules."
          actions={<Badge>metadata</Badge>}
        >
          <p className="text-sm text-slate-700">
            An administrator adds, edits, removes and restores the fields here; every change is
            audited. Values are metadata and never change budgets, remaining amounts or flags.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/admin/custom-fields" className={linkClass}>
              Manage custom fields
            </Link>
          </p>
        </Card>

        <Card title="Signed in as" description="Your session details.">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Access model (v1)" description="Recorded in the charter and ADR-0004.">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Every authenticated user is an administrator; there are no editor or viewer roles.</li>
            <li>There is no self-service signup; accounts are created here.</li>
            <li>Closed years are read-only; settlement lifecycle events are the only exception.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
