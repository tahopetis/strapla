import { expect, type Page } from '@playwright/test';

/**
 * The genuine empty state of a fresh database: the first administrator exists,
 * but there is no strategic plan, annual plan, program, project, report data and
 * no audit history beyond first-run setup. The foundation journey calls this
 * immediately after creating the administrator and before any portfolio record
 * exists; it only navigates and asserts, never creating, editing or submitting.
 *
 * Each route is asserted on its own heading plus the exact empty-state copy from
 * the page source (or, where the page has no empty state, a stable card or the
 * seeded registry entry), so ordering never matters. The reports hub is static;
 * the four report pages share one "create the plan first" paragraph.
 */
export async function assertEmptyStates(page: Page): Promise<void> {
  const pages: ReadonlyArray<readonly [path: string, heading: string, proof: string]> = [
    ['/dashboard', 'Dashboard', 'Create the strategic plan to see portfolio health.'],
    ['/plan', 'Plan', 'No strategic plan yet. Start with the five-year horizon, then add strategic initiatives and their envelopes.'],
    ['/plan/strategic', 'Strategic plan & initiatives', 'Create the strategic plan'],
    ['/plan/annual', 'Annual plans', 'No strategic plan yet. Create the strategic plan first — annual plans live inside its horizon.'],
    ['/plan/projects', 'Projects', 'No strategic plan yet. Create the strategic plan and its annual programs first.'],
    ['/plan/opening-balances', 'Opening balances', 'No strategic plan yet. Opening balances are recorded against the plan, its initiatives, annual programs and projects.'],
    ['/reports', 'Reports', 'Exports and print views'],
    ['/admin', 'Administration', 'Signed in as'],
    ['/admin/members', 'Members', 'this is you'],
    ['/admin/audit', 'Audit trail', 'Search and filter'],
    // The migration seeds the Procurement method field, so the registry is not
    // empty on a fresh database; its presence is the page's genuine content.
    ['/admin/custom-fields', 'Custom fields', 'Procurement method'],
    ['/help', 'Help & user guide', 'First time here?'],
    ['/funding', 'Funding', 'Balances and flags'],
  ];

  for (const [path, heading, proof] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText(proof).first()).toBeVisible();
  }

  for (const path of [
    '/reports/si-five-year',
    '/reports/annual-plan',
    '/reports/project-register',
    '/reports/budget-vs-actual',
  ]) {
    await page.goto(path);
    await expect(page.getByText('Create the strategic plan to see this report.')).toBeVisible();
  }
}
