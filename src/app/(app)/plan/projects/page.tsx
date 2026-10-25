import type { Metadata } from 'next';
import Link from 'next/link';
import { MoneyField, SelectField, SubmitButton, TextField } from '@/components/form';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Flash, Money, PageHeader } from '@/components/ui';
import type { ProjectListRow } from '@/server/plan/project-queries';
import { listProgramOptions, listProjects } from '@/server/plan/project-queries';
import { createProjectAction } from '@/server/plan/project-actions';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Projects' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const plan = await getCurrentStrategicPlan();

  if (!plan) {
    return (
      <div>
        <PageHeader title="Projects" description="Multi-year projects with their full-life funding and procurement record." />
        <PlanNav />
        <EmptyState>No strategic plan yet. Create the strategic plan and its annual programs first.</EmptyState>
        <p className="mt-4">
          <Link href="/plan/strategic" className={linkClass}>
            Go to the strategic plan
          </Link>
        </p>
      </div>
    );
  }

  const [rows, programOptions] = await Promise.all([listProjects(plan.id), listProgramOptions(plan.id)]);
  const canCreate = plan.status === 'active' && programOptions.length > 0;

  return (
    <div>
      <PageHeader
        title="Projects"
        description={`Multi-year projects under the annual programs of ${plan.name}. A project is created once and appears in every active fiscal year (BR-5/BR-6).`}
      />
      <PlanNav />
      <Flash error={error} message={message} />

      {plan.status !== 'active' ? (
        <Card title="The strategic plan is not active yet" className="mb-6">
          <p className="text-sm text-slate-700">
            Projects can only be created once the strategic plan is active.{' '}
            <Link href="/plan/strategic" className={linkClass}>
              Open the strategic plan
            </Link>{' '}
            to activate it.
          </p>
        </Card>
      ) : programOptions.length === 0 ? (
        <Card title="No annual programs yet" className="mb-6">
          <p className="text-sm text-slate-700">
            A project is derived from an annual program. Create the first program in an annual plan.{' '}
            <Link href="/plan/annual" className={linkClass}>
              Open annual plans
            </Link>
          </p>
        </Card>
      ) : canCreate ? (
        <Card
          title="Create project"
          description="The full-life figures are recorded now; the annual allocations to each active fiscal year land in M2."
          className="mb-6"
        >
          <form action={createProjectAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label="Originating program"
              name="originatingProgramId"
              required
              placeholder="Select an annual program"
              options={programOptions}
            />
            <TextField label="Name" name="name" required maxLength={160} />
            <TextField
              label="Project code"
              name="code"
              placeholder="Auto: PRJ-<FY>-<nnn>"
              hint="Leave empty to generate the next code for the start fiscal year."
              maxLength={40}
            />
            <TextField label="Owner" name="owner" maxLength={160} />
            <TextField label="External reference" name="externalReference" maxLength={120} />
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Start fiscal year" name="startFiscalYear" required defaultValue="2027" maxLength={4} />
              <TextField label="End fiscal year" name="endFiscalYear" required defaultValue="2027" maxLength={4} />
            </div>
            <MoneyField label="Full-life allocated budget" name="allocatedBudgetFullLife" defaultValue={0} required />
            <MoneyField label="Submitted price" name="submittedPrice" hint="Highest vendor quote." />
            <MoneyField label="Final deal price" name="finalDealPrice" hint="Contract value when known." />
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Create project</SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Project register" description="Open a project to record its ijin prinsip and full-life figures.">
        {rows.length === 0 ? (
          <EmptyState>No projects yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Project</th>
                  <th className="py-2 pr-4">Program / SI</th>
                  <th className="py-2 pr-4">Years</th>
                  <th className="py-2 pr-4">Allocated</th>
                  <th className="py-2 pr-4">Approved</th>
                  <th className="py-2 pr-4">Final deal</th>
                  <th className="py-2 pr-4">Flags</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <ProjectRow key={row.project.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProjectRow({ row }: { row: ProjectListRow }) {
  const { project, flags } = row;
  return (
    <tr>
      <td className="py-3 pr-4">
        <p className="font-medium">{project.code}</p>
        <p className="text-slate-600">{project.name}</p>
      </td>
      <td className="py-3 pr-4">
        <p>{row.programCode}</p>
        <p className="text-slate-600">
          {row.siCode} · {row.siName}
        </p>
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        {project.startFiscalYear}–{project.endFiscalYear}
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <Money value={project.allocatedBudgetFullLife} />
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <Money value={row.ijin?.approvedAmount ?? null} />
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <Money value={project.finalDealPrice} />
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1">
          {project.status === 'cancelled' ? <Badge tone="danger">cancelled</Badge> : null}
          {flags.overApprovedBudget ? <Badge tone="danger">over approved</Badge> : null}
          {flags.overSubmittedPrice ? <Badge tone="warning">above submitted</Badge> : null}
          {project.status === 'active' && !flags.overApprovedBudget && !flags.overSubmittedPrice ? (
            <Badge tone="success">ok</Badge>
          ) : null}
        </div>
      </td>
      <td className="py-3 text-right">
        <Link href={`/plan/projects/${project.id}`} className={linkClass}>
          Open
        </Link>
      </td>
    </tr>
  );
}
