import { NotFoundPanel } from '@/components/not-found-panel';

export default function AppNotFound() {
  return (
    <NotFoundPanel
      message="The page does not exist, or the record it pointed at was voided or is no longer in this view."
      href="/dashboard"
      label="Back to dashboard"
    />
  );
}
