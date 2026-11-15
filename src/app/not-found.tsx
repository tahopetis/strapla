import { NotFoundPanel } from '@/components/not-found-panel';

/**
 * Unmatched URL outside the signed-in shell. The link goes to sign-in because
 * an unauthenticated visitor cannot reach the dashboard anyway; a signed-in
 * visitor is redirected onwards from there.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <NotFoundPanel
        message="The page you followed does not exist. Check the address, or sign in and use the navigation."
        href="/login"
        label="Go to sign in"
      />
    </main>
  );
}
