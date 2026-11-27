import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlanNav } from '@/components/plan-nav';
import { OpeningReconciliationForms } from '@/components/plan/opening-reconciliation-forms';
import { Badge, Card, EmptyState, Flash, Money, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { isRecordId } from '@/lib/record-id';
import {
  getOpeningBalancesOverview,
  getOpeningLoadScene,
  getOpeningReconciliation,
} from '@/server/plan/opening-queries';
import {
  getCurrentStrategicPlan,
  getStrategicPlan,
  isFirstStrategicPlan,
} from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Opening balances' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

/**
 * The pinned opening-balance notices (#109, ADR-0008 §7). Opening balances are
 * recorded once, for the first plan; a successor starts without them, and an
 * archived plan keeps its signed-off figures readable but read-only.
 */
const READ_ONLY_NOTICE = 'Read-only opening balances of an archived plan.';
const SUCCESSOR_NOTICE =
  "Opening balances are recorded once, for the first plan. A successor plan starts without them; the first plan's signed-off figures remain readable from its archived plan page.";

export default async function OpeningBalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; plan?: string }>;
}) {
  const { error, message, plan: planParam } = await searchParams;

  // ?plan=<id> opens one plan's signed-off figures read-only: the archived plan
  // pages link here so the first plan's balances stay reachable after archival.
  const requestedPlanId = planParam ? planParam : null;
  if (requestedPlanId !== null && !isRecordId(requestedPlanId)) notFound();
  const requestedPlan = requestedPlanId ? await getStrategicPlan(requestedPlanId) : null;
  // ?plan=<id> exists for the archived plans list, which links one archived
  // plan's signed-off figures read-only; it is not a way to view an editable
  // plan without its write controls.
  if (requestedPlanId !== null && requestedPlan?.status !== 'archived') notFound();

  const plan = requestedPlan ?? (await getCurrentStrategicPlan());

  if (!plan) {
    return (
      <div>
        <PageHeader
          title="Opening balances"
          description="The signed-off bridge from the spreadsheets into Strapla."
        />
        <PlanNav />
        <Flash error={error} message={message} />
        <EmptyState>
          No strategic plan yet. Opening balances are recorded against the plan, its initiatives, annual
          programs and projects.
        </EmptyState>
        <p className="mt-4">
          <Link href="/plan/strategic" className={linkClass}>
            Go to the strategic plan
          </Link>
        </p>
      </div>
    );
  }

  const readOnly = plan.status === 'archived';
  const firstPlan = await isFirstStrategicPlan(plan);
  // A successor plan starts without opening balances: it gets the explanation,
  // not the import or the sign-off forms (#109).
  const successor = !readOnly && !firstPlan;
  const firstPlanSurfaces = !readOnly && firstPlan;

  const [overview, reconciliation, scene] = await Promise.all([
    getOpeningBalancesOverview(plan.id),
    getOpeningReconciliation(plan.id),
    firstPlanSurfaces ? getOpeningLoadScene(plan) : Promise.resolve(null),
  ]);
  const { totals } = overview;
  const priorYear = plan.startFiscalYear;
  const firstInAppYear = priorYear + 1;
  const signedOffAt = reconciliation?.signedOffAt ?? null;
  const notice = readOnly ? READ_ONLY_NOTICE : successor ? SUCCESSOR_NOTICE : null;

  const controlFields = [
    { name: 'controlEnvelopeCapex', label: 'Total envelope (capex)', app: totals.envelopeCapex },
    { name: 'controlEnvelopeOpex', label: 'Total envelope (opex)', app: totals.envelopeOpex },
    {
      name: 'controlPriorProgramBudgetUsedCapex',
      label: 'Prior program budget consumed (capex)',
      app: totals.priorProgramBudgetUsedCapex,
    },
    {
      name: 'controlPriorProgramBudgetUsedOpex',
      label: 'Prior program budget consumed (opex)',
      app: totals.priorProgramBudgetUsedOpex,
    },
    {
      name: 'controlProgramBudgets',
      label: `FY${firstInAppYear} program budgets (capex + opex)`,
      app: totals.inAppProgramBudgets,
    },
    {
      name: 'controlProgramCarryIn',
      label: 'Program carry-in (capex + opex)',
      app: totals.programCarryInCapex + totals.programCarryInOpex,
    },
    {
      name: 'controlProjectOpeningAllocated',
      label: 'Project opening allocated',
      app: totals.projectOpeningAllocated,
    },
    {
      name: 'controlProjectOpeningCommitted',
      label: 'Project opening open commitments',
      app: totals.projectOpeningCommitted,
    },
    { name: 'controlProjectOpeningSpent', label: 'Project opening spent', app: totals.projectOpeningSpent },
    {
      name: 'controlProjectFullLifeAllocated',
      label: 'Project full-life allocated',
      app: totals.projectFullLifeAllocated,
    },
  ] as const;

  const initialValues = reconciliation
    ? Object.fromEntries(controlFields.map((field) => [field.name, reconciliation[field.name]]))
    : null;

  return (
    <div>
      <PageHeader
        title="Opening balances"
        description={`The signed-off bridge from the FY${priorYear} spreadsheets into the app. FY${firstInAppYear} is the first in-app fiscal year; FY${priorYear} is closed manually outside Strapla (charter §6.9).`}
        actions={
          readOnly && plan.status === 'archived' ? (
            <Link
              href={`/plan/strategic/${plan.id}`}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Archived plan
            </Link>
          ) : (
            <Link href="/plan/strategic" className="text-sm text-slate-600 hover:text-slate-900">
              Manage strategic plan
            </Link>
          )
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      {notice ? (
        <div className="mb-5 space-y-2">
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {notice}
          </p>
          {successor ? (
            <p className="text-sm">
              <Link href="/plan/strategic/archived" className={linkClass}>
                Archived plans
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-6">
        {scene ? (
          <Card
            title="Opening import"
            description={`Load the FY${priorYear} close figures from the generated CSV/XLSX templates. The wizard validates first and writes in one transaction.`}
          >
            {!scene.annualPlan ? (
              <p className="text-sm text-slate-700">
                Create the FY{firstInAppYear} annual plan before importing.{' '}
                <Link href="/plan/annual" className={linkClass}>
                  Go to the annual plans
                </Link>
                .
              </p>
            ) : scene.annualPlan.status === 'closed' ? (
              <p className="text-sm text-slate-700">
                FY{scene.annualPlan.fiscalYear} is closed and cannot receive an import.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-4">Data set</th>
                        <th className="py-2 pr-4">Records in app</th>
                        <th className="py-2">Template</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        { dataSet: 'strategic-initiatives', label: 'Strategic initiatives', count: scene.counts.initiatives },
                        { dataSet: 'annual-programs', label: 'Annual programs', count: scene.counts.programs },
                        { dataSet: 'projects', label: 'Projects', count: scene.counts.projects },
                      ].map((row) => (
                        <tr key={row.dataSet}>
                          <td className="py-2 pr-4">{row.label}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.count}</td>
                          <td className="py-2">
                            <a
                              className={linkClass}
                              href={`/plan/opening-balances/import/template?dataSet=${row.dataSet}&format=csv`}
                            >
                              CSV
                            </a>{' '}
                            ·{' '}
                            <a
                              className={linkClass}
                              href={`/plan/opening-balances/import/template?dataSet=${row.dataSet}&format=xlsx`}
                            >
                              XLSX
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-sm">
                  <Link href="/plan/opening-balances/import" className={linkClass}>
                    Open the import wizard
                  </Link>{' '}
                  — template, upload/validate, load. A validation writes nothing.
                </p>
              </>
            )}
          </Card>
        ) : null}

        {firstPlanSurfaces ? (
          <Card title="Where opening figures are entered" description="One-time data, audited like any other financial change.">
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>
                <strong>Per strategic initiative</strong>: capex and opex envelopes plus prior program budget
                consumed (capex and opex) — edit the initiative on{' '}
                <Link href="/plan/strategic" className={linkClass}>
                  the strategic plan page
                </Link>
                .
              </li>
              <li>
                <strong>Per annual program</strong>: capex and opex carry-in from the manual prior-year close — edit the
                program on{' '}
                <Link href="/plan/annual" className={linkClass}>
                  the annual plan page
                </Link>
                .
              </li>
              <li>
                <strong>Per project</strong>: opening allocated budget, opening open commitments and opening actual
                spend — edit the project on{' '}
                <Link href="/plan/projects" className={linkClass}>
                  the project page
                </Link>
                .
              </li>
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              Project year allocation carry-in is entered when the annual allocations are created.
              Reconciliation below shows the totals you can compare with the spreadsheets before go-live.
            </p>
          </Card>
        ) : null}

        <Card
          title="Initiatives — envelope reconciliation"
          description="Envelope versus prior program budget consumed plus in-app program budgets, per component (BR-2). Capex and opex never share headroom."
        >
          {overview.initiatives.length === 0 ? (
            <EmptyState>No strategic initiatives yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Initiative</th>
                    <th className="py-2 pr-4">Capex envelope</th>
                    <th className="py-2 pr-4">Capex prior</th>
                    <th className="py-2 pr-4">Capex programs</th>
                    <th className="py-2 pr-4">Capex headroom</th>
                    <th className="py-2 pr-4">Opex envelope</th>
                    <th className="py-2 pr-4">Opex prior</th>
                    <th className="py-2 pr-4">Opex programs</th>
                    <th className="py-2 pr-4">Opex headroom</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.initiatives.map((row) => (
                    <tr key={row.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.code}</p>
                        <p className="text-slate-600">{row.name}</p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.envelopeCapex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.priorProgramBudgetUsedCapex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.programCapex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.check.capex.remaining} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.envelopeOpex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.priorProgramBudgetUsedOpex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.programOpex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.check.opex.remaining} />
                      </td>
                      <td className="space-x-1 py-3">
                        <Badge tone={row.check.capex.over ? 'danger' : 'success'}>
                          capex {row.check.capex.over ? 'over' : 'within'}
                        </Badge>
                        <Badge tone={row.check.opex.over ? 'danger' : 'success'}>
                          opex {row.check.opex.over ? 'over' : 'within'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Annual programs — carry-in"
          description="Budget plus carry-in per component. Project allocations against these budgets are made on the project page."
        >
          {overview.programs.length === 0 ? (
            <EmptyState>No annual programs yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Program</th>
                    <th className="py-2 pr-4">SI</th>
                    <th className="py-2 pr-4">Capex budget</th>
                    <th className="py-2 pr-4">Capex carry-in</th>
                    <th className="py-2 pr-4">Capex available</th>
                    <th className="py-2 pr-4">Opex budget</th>
                    <th className="py-2 pr-4">Opex carry-in</th>
                    <th className="py-2">Opex available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.programs.map((row) => (
                    <tr key={row.program.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.program.code}</p>
                        <p className="text-slate-600">
                          {row.program.name} · FY{row.fiscalYear}
                        </p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">{row.siCode}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.program.capexBudget} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.program.carryInCapex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.capexAvailable} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.program.opexBudget} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.program.carryInOpex} />
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <Money value={row.opexAvailable} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Projects — opening position"
          description="Opening allocated / open commitments / actual spend before the app, plus the full-life allocated budget."
        >
          {overview.projects.length === 0 ? (
            <EmptyState>No projects yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Project</th>
                    <th className="py-2 pr-4">Program / SI</th>
                    <th className="py-2 pr-4">Opening allocated</th>
                    <th className="py-2 pr-4">Opening committed</th>
                    <th className="py-2 pr-4">Opening spent</th>
                    <th className="py-2">Full-life allocated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.projects.map((row) => (
                    <tr key={row.project.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.project.code}</p>
                        <p className="text-slate-600">{row.project.name}</p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {row.programCode} · {row.siCode}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.project.openingAllocated} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.project.openingCommitted} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.project.openingSpent} />
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <Money value={row.project.allocatedBudgetFullLife} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Control totals and sign-off"
          description={
            firstPlanSurfaces
              ? "Enter the spreadsheets' control totals; the difference is against the in-app records shown below. All ten totals are compared before sign-off."
              : 'The control totals recorded at sign-off, compared with the in-app records.'
          }
          actions={signedOffAt ? <Badge tone="success">signed off</Badge> : undefined}
        >
          {signedOffAt ? (
            <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Signed off {formatDate(signedOffAt)}
              {reconciliation?.signOffReason ? ` — ${reconciliation.signOffReason}` : ''}. The control
              totals are read-only.
            </div>
          ) : null}

          {reconciliation ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Control total</th>
                    <th className="py-2 pr-4">Spreadsheet</th>
                    <th className="py-2 pr-4">Strapla</th>
                    <th className="py-2 pr-4">Difference</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {controlFields.map((field) => {
                    const control = reconciliation[field.name];
                    const difference = control - field.app;
                    return (
                      <tr key={field.name}>
                        <td className="py-2 pr-4">{field.label}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <Money value={control} />
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <Money value={field.app} />
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <Money value={difference} />
                        </td>
                        <td className="py-2">
                          {difference === 0 ? (
                            <Badge tone="success">match</Badge>
                          ) : (
                            <Badge tone="danger">difference</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {firstPlanSurfaces
                ? 'No control totals saved yet. Enter the spreadsheet figures below and save.'
                : 'No control totals were recorded for this plan.'}
            </p>
          )}

          {firstPlanSurfaces && !signedOffAt ? (
            <OpeningReconciliationForms
              planId={plan.id}
              fields={controlFields}
              initialValues={initialValues}
              priorYear={priorYear}
            />
          ) : null}

          <p className="mt-4 text-xs text-slate-500">
            Opening figures are audited edits. The spreadsheets remain the source for the prior year and
            earlier; this comparison is the sign-off aid.
          </p>
        </Card>
      </div>
    </div>
  );
}
