import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isSessionEnded } from '@/server/auth/login-redirect';
import { getCurrentUser } from '@/server/auth/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  const { reason } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Strapla</h1>
          <p className="mt-1 text-sm text-slate-600">IT portfolio management</p>
        </div>

        {isSessionEnded(reason) ? (
          <p
            role="status"
            className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"
          >
            Your session ended. Sign in again to continue.
          </p>
        ) : null}

        <LoginForm />

        <p className="mt-6 text-xs text-slate-500">
          Accounts are created by an administrator. There is no self-service signup.
        </p>
      </div>
    </main>
  );
}
