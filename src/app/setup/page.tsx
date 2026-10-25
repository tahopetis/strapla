import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setupAction } from '@/server/auth/actions';
import { countUsers } from '@/server/auth/users';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'First-run setup' };

const inputClass =
  'mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if ((await countUsers()) > 0) redirect('/login');

  const { error } = await searchParams;

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

        {error ? (
          <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <form action={setupAction} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input name="name" autoComplete="name" required className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-slate-500">At least 12 characters.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirm password
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create administrator
          </button>
        </form>
      </div>
    </main>
  );
}
