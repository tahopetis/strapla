import { NotFoundPanel } from '@/components/not-found-panel';

/**
 * Unmatched URL outside the signed-in shell. The link goes to the dashboard:
 * an unauthenticated visitor is redirected to sign-in from there, and a
 * signed-in visitor lands where they meant to go.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <NotFoundPanel
        message="The page you followed does not exist. Check the address, or continue into the app."
        href="/dashboard"
        label="Go to the app"
      />
    </main>
  );
}
