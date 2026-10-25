import type { Metadata } from 'next';
import Link from 'next/link';
import { HiddenField, ReasonField, SubmitButton, TextField } from '@/components/form';
import { Badge, Card, Flash, PageHeader } from '@/components/ui';
import {
  activateMemberAction,
  createMemberAction,
  deactivateMemberAction,
  resetMemberPasswordAction,
  revokeMemberSessionsAction,
} from '@/server/admin/actions';
import { listMembers } from '@/server/admin/queries';
import { requireUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Members' };

const summaryClass = 'cursor-pointer text-sm font-medium text-slate-700';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const currentUser = await requireUser();
  const members = await listMembers();

  return (
    <div>
      <PageHeader
        title="Members"
        description="Accounts are administrators; they are deactivated, never deleted, and every change is audited."
        actions={
          <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900">
            ← Administration
          </Link>
        }
      />
      <Flash error={error} message={message} />

      <div className="space-y-6">
        <Card
          title="Create member"
          description="The administrator sets an initial password and hands it over out of band; the member changes it by resetting it here."
        >
          <form action={createMemberAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Name" name="name" required maxLength={120} />
            <TextField label="Email" name="email" type="email" required maxLength={254} />
            <TextField label="Initial password" name="password" type="password" required autoComplete="new-password" />
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Create member</SubmitButton>
            </div>
          </form>
        </Card>

        <Card title="Accounts" description="Active sessions are revoked on deactivation and password reset.">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Name / email</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Active sessions</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => {
                  const isSelf = member.user.id === currentUser.id;
                  return (
                    <tr key={member.user.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{member.user.name}</p>
                        <p className="text-slate-600">{member.user.email}</p>
                        {isSelf ? <p className="text-xs text-slate-500">this is you</p> : null}
                      </td>
                      <td className="py-3 pr-4">
                        {member.user.isActive ? (
                          <Badge tone="success">active</Badge>
                        ) : (
                          <Badge tone="danger">deactivated</Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4">{member.activeSessions}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                        {new Intl.DateTimeFormat('en-GB', {
                          timeZone: 'Asia/Jakarta',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        }).format(member.user.createdAt)}
                      </td>
                      <td className="py-3">
                        <details>
                          <summary className={summaryClass}>Manage</summary>
                          <div className="mt-3 grid gap-4 lg:grid-cols-3">
                            <form action={resetMemberPasswordAction} className="space-y-2">
                              <p className="text-xs font-medium text-slate-600">Reset password</p>
                              <HiddenField name="userId" value={member.user.id} />
                              <input
                                name="password"
                                type="password"
                                required
                                minLength={12}
                                placeholder="New password (12+ characters)"
                                autoComplete="new-password"
                                className="block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                              />
                              <textarea
                                name="reason"
                                required
                                rows={2}
                                placeholder="Reason (audited)"
                                className="block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                              />
                              <button
                                type="submit"
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Reset password
                              </button>
                            </form>

                            <form action={revokeMemberSessionsAction} className="space-y-2">
                              <p className="text-xs font-medium text-slate-600">Revoke sessions</p>
                              <HiddenField name="userId" value={member.user.id} />
                              <ReasonField hint="Signs the member out everywhere." />
                              <button
                                type="submit"
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Revoke sessions
                              </button>
                            </form>

                            {member.user.isActive && !isSelf ? (
                              <form action={deactivateMemberAction} className="space-y-2">
                                <p className="text-xs font-medium text-red-700">Deactivate account</p>
                                <HiddenField name="userId" value={member.user.id} />
                                <ReasonField hint="The account and its history remain; it can be reactivated." />
                                <button
                                  type="submit"
                                  className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                                >
                                  Deactivate member
                                </button>
                              </form>
                            ) : null}

                            {!member.user.isActive ? (
                              <form action={activateMemberAction} className="space-y-2">
                                <p className="text-xs font-medium text-emerald-700">Reactivate account</p>
                                <HiddenField name="userId" value={member.user.id} />
                                <ReasonField hint="Sessions are not restored; the member signs in again." />
                                <button
                                  type="submit"
                                  className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  Activate member
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
