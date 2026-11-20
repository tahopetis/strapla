'use client';

import { Form, SubmitButton, TextField } from '@/components/form';
import { loginAction } from '@/server/auth/actions';

/** The sign-in form, split out so the login page itself stays a server component. */
export function LoginForm() {
  return (
    <Form action={loginAction} className="space-y-4">
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <SubmitButton
        className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        pendingLabel="Signing in…"
      >
        Sign in
      </SubmitButton>
    </Form>
  );
}
