'use client';

import { Form, SubmitButton, TextField } from '@/components/form';
import { setupAction } from '@/server/auth/actions';

/** The first-run administrator form, split out so the setup page stays a server component. */
export function SetupForm() {
  return (
    <Form action={setupAction} className="space-y-4">
      <TextField label="Name" name="name" autoComplete="name" required />
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        hint="At least 12 characters."
      />
      <TextField
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
      />
      <SubmitButton
        className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        pendingLabel="Creating…"
      >
        Create administrator
      </SubmitButton>
    </Form>
  );
}
