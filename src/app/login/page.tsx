import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loginAction } from '@/server/auth/actions';
import { SESSION_ENDED_REASON } from '@/server/auth/login-redirect';
import { getCurrentUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

const inputClass =
  'mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  const { error, reason } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Strapla</h1>
          <p className="mt-1 text-sm text-slate-600">IT portfolio management</p>
        </div>

        {reason === SESSION_ENDED_REASON ? (
          <p
            role="status"
            className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"
          >
            Your session ended. Sign in again to continue.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <form action={loginAction} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500">
          Accounts are created by an administrator. There is no self-service signup.
        </p>
      </div>
    </main>
  );
}
