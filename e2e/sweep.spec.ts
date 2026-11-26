import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Read-only render sweep (@t3): every authenticated route renders its heading
 * and real portfolio data from the foundation, and the unauthenticated
 * boundaries redirect or answer JSON. No route here writes; detail pages are
 * reached through the links that lead to them so the foundation's own records
 * decide the ids. The report pages assert only that the CSV/XLSX controls exist
 * — reports.spec.ts already covers the downloads themselves.
 *
 * The signed-in tests reuse the foundation's storageState; the boundary tests
 * describe starts from a blank one.
 */

/** The project baseURL, for APIRequestContext calls. */
function baseURL(): string {
  return test.info().project.use.baseURL ?? 'http://127.0.0.1:3000';
}

/** The CSV/XLSX control is a link on plain reports and a button when the report carries custom-field columns. */
function exportControl(page: Page, label: string): Locator {
  return page
    .getByRole('link', { name: label, exact: true })
    .or(page.getByRole('button', { name: label, exact: true }));
}

test('sweeps the planning routes with real portfolio data @t3', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByText(/Portfolio health for IT Strategic Plan 2026–2030/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan versus execution' })).toBeVisible();

  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'IT Strategic Plan 2026–2030', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five-year envelope' })).toBeVisible();

  await page.goto('/plan/strategic');
  await expect(page.getByRole('heading', { name: 'Strategic plan & initiatives' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^SI-01 · / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan details' })).toBeVisible();

  await page.goto('/plan/annual');
  await expect(
    page.getByRole('heading', { name: 'Annual plans', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'FY2027' }).getByText('closed')).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'FY2028' })).toBeVisible();

  // Annual detail → the program thread it links to.
  await page.locator('tbody tr', { hasText: 'FY2028' }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'FY2028 annual plan', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^PRG-2028-001 · / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Annual programs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recurring operations' })).toBeVisible();

  await page.goto('/plan/annual');
  await page.getByRole('link', { name: 'FY2028 PRG-2028-001' }).click();
  await expect(page.getByRole('heading', { name: /^PRG-2028-001 · / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Program thread' })).toBeVisible();
  await expect(page.getByText(/program thread FY/)).toBeVisible();

  // The closed FY2027 close page keeps its signed snapshot.
  await page.goto('/plan/annual');
  await Promise.all([
    page.waitForURL(/\/plan\/annual\/[0-9a-f-]+$/),
    page.locator('tbody tr', { hasText: 'FY2027' }).getByRole('link', { name: 'Open' }).click(),
  ]);
  const fy2027Url = page.url();
  await expect(page.getByRole('heading', { name: 'FY2027 annual plan', exact: true })).toBeVisible();
  await page.goto(`${fy2027Url}/close`);
  await expect(page.getByRole('heading', { name: 'Close FY2027', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fiscal year closed' })).toBeVisible();
  await expect(page.getByText('E2E-CLOSE-FY2027').first()).toBeVisible();

  // Recurring-ops execution detail for the FY2027 item.
  await page.goto(fy2027Url);
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(page.getByRole('heading', { name: /^FY2027 · / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Budget and execution' })).toBeVisible();

  // Project register → project detail → allocation detail.
  await page.goto('/plan/projects');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'PRJ-2027-001' })).toBeVisible();
  await page
    .locator('tbody tr', { hasText: 'PRJ-2027-001' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: /^PRJ-2027-001 · / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Change history' })).toBeVisible();

  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(page.getByRole('heading', { name: /allocation · / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Allocation and execution' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Commitment entries' })).toBeVisible();

  // Opening balances and the import wizard.
  await page.goto('/plan/opening-balances');
  await expect(page.getByRole('heading', { name: 'Opening balances', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Control totals and sign-off' })).toBeVisible();
  await expect(page.getByText(/E2E opening balances sign-off/)).toBeVisible();

  await page.goto('/plan/opening-balances/import');
  await expect(page.getByRole('heading', { name: 'Opening-balance import', exact: true })).toBeVisible();
  await expect(
    page.getByText(/Load the FY2026 close figures into IT Strategic Plan 2026–2030/),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import wizard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Load order' })).toBeVisible();
});

test('sweeps reports, administration and help routes @t3', async ({ page }) => {
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Exports and print views' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open report' }).first()).toBeVisible();

  await page.goto('/reports/si-five-year');
  await expect(page.getByRole('heading', { name: 'SI five-year view', exact: true })).toBeVisible();
  await expect(page.getByText('SI-01', { exact: true }).first()).toBeVisible();
  await expect(exportControl(page, 'CSV').first()).toBeVisible();
  await expect(exportControl(page, 'XLSX').first()).toBeVisible();

  await page.goto('/reports/annual-plan');
  await expect(page.getByRole('heading', { name: 'Annual plan by SI and program' })).toBeVisible();
  await expect(page.getByText('SI-01 · PRG-2027-001')).toBeVisible();
  await expect(exportControl(page, 'CSV').first()).toBeVisible();
  await expect(exportControl(page, 'XLSX').first()).toBeVisible();

  await page.goto('/reports/project-register');
  await expect(page.getByRole('heading', { name: 'Project register', exact: true })).toBeVisible();
  await expect(page.getByText('PRJ-2027-001')).toBeVisible();
  await expect(exportControl(page, 'CSV').first()).toBeVisible();
  await expect(exportControl(page, 'XLSX').first()).toBeVisible();

  await page.goto('/reports/budget-vs-actual');
  await expect(page.getByRole('heading', { name: 'Budget versus actual' })).toBeVisible();
  await expect(page.getByText('SI-01 · PRG-2027-001')).toBeVisible();
  await expect(exportControl(page, 'CSV').first()).toBeVisible();
  await expect(exportControl(page, 'XLSX').first()).toBeVisible();

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Signed in as' })).toBeVisible();
  await expect(page.getByText('e2e-owner@strapla.test', { exact: true })).toBeVisible();

  await page.goto('/admin/members');
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  await expect(page.getByText('e2e-owner@strapla.test', { exact: true })).toBeVisible();
  await expect(page.getByText('this is you')).toBeVisible();

  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Audit trail', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Search and filter' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export CSV' })).toBeVisible();

  await page.goto('/admin/custom-fields');
  await expect(page.getByRole('heading', { name: 'Custom fields', exact: true })).toBeVisible();
  await expect(page.getByText('Procurement method').first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Active fields' }).first()).toBeVisible();

  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Help & user guide', exact: true })).toBeVisible();
  await expect(page.getByText('Is there a default username or password?')).toBeVisible();

  await page.goto('/funding');
  await expect(page.getByRole('heading', { name: 'Funding', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project year allocations' })).toBeVisible();
});

test.describe('unauthenticated boundaries', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects an unauthenticated dashboard visit to sign-in @t3', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('serves a healthy JSON payload from /healthz @t3', async ({ page }) => {
    const response = await page.request.get(`${baseURL()}/healthz`);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    const payload = (await response.json()) as {
      status?: string;
      database?: string;
      latencyMs?: number;
    };
    expect(payload).toMatchObject({ status: 'ok', database: 'ok' });
    expect(typeof payload.latencyMs).toBe('number');
  });
});

// #103 (https://github.com/tahopetis/strapla/issues/103): a dynamic segment that
// is not a UUID used to reach Postgres, which threw (22P02), so the error
// boundary rendered instead of the styled 404. Every dynamic record route now
// validates its ids at the boundary with `isRecordId` and takes the not-found
// path before any query.
//
// The HTTP status is deliberately not asserted: `app/loading.tsx` streams the
// signed-in shell while `requireUser()` runs, so Next.js has committed to 200
// before a page-level `notFound()` can fire (the documented "soft 404", see
// https://github.com/vercel/next.js/discussions/76501). The contract this test
// proves is the app's own page: the styled 404, never the error boundary.
test('renders the styled 404 for a malformed record id (#103) @t3', async ({ page }) => {
  const malformedRoutes = [
    '/plan/annual/close',
    '/plan/annual/not-a-uuid/close',
    '/plan/annual/not-a-uuid/recurring-ops/not-a-uuid',
    '/plan/programs/not-a-uuid',
    '/plan/projects/not-a-uuid',
    '/plan/projects/not-a-uuid/allocations/not-a-uuid',
  ];
  for (const route of malformedRoutes) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Page not found' }), route).toBeVisible();
  }

  // A well-formed id for a record that does not exist is indistinguishable from
  // a malformed one: the same styled 404 rather than a database error.
  await page.goto('/plan/projects/00000000-0000-0000-0000-000000000000');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
