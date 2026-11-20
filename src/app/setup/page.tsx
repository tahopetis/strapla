import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { countUsers } from '@/server/auth/users';
import { SetupForm } from './setup-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'First-run setup' };

export default async function SetupPage() {
  if ((await countUsers()) > 0) redirect('/login');

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Strapla — first-run setup</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create the first administrator account. Every account in v1 is an administrator; you can
            create the rest from the Administration page once signed in.
          </p>
        </div>

        <SetupForm />
      </div>
    </main>
  );
}
