import Link from 'next/link';
import {
  HiddenField,
  MoneyField,
  ReasonField,
  SelectField,
  SubmitButton,
  TextAreaField,
} from '@/components/form';
import { Badge, Card, EmptyState, Money } from '@/components/ui';
import type {
  AllocationProgramOptions,
  ProjectAllocationRow,
} from '@/server/plan/allocation-queries';
import {
  createAllocationAction,
  updateAllocationAction,
  voidAllocationAction,
} from '@/server/plan/allocation-actions';

const summaryClass = 'cursor-pointer text-sm font-medium text-slate-700';

export function ProjectAllocationsSection({
  projectId,
  rows,
  options,
  editable,
}: {
  projectId: string;
  rows: ProjectAllocationRow[];
  options: AllocationProgramOptions;
  editable: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Annual allocations</h2>
        <Badge>{rows.length}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        One allocation per active fiscal year, attached to that year&apos;s program for the same SI (BR-6).
        Remaining = allocation + carry-in − open commitments − current-year spend (ADR-0003), updated as
        commitments and spend are recorded on the allocation page.
      </p>

      {editable && options.options.length > 0 ? (
        <Card
          title="Add annual allocation"
          description="The program's available budget is budget + carry-in per component. Allocating above it is flagged, never blocked (BR-7/BR-17)."
        >
          <form action={createAllocationAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name="projectId" value={projectId} />
            <SelectField
              label="Fiscal year program"
              name="annualProgramId"
              required
              placeholder="Select a program"
              options={options.options}
            />
            <MoneyField label="Capex allocation" name="allocationCapex" defaultValue={0} required />
            <MoneyField label="Opex allocation" name="allocationOpex" defaultValue={0} required />
            <MoneyField
              label="Capex carry-in"
              name="carryInCapex"
              defaultValue={0}
              hint="Opening balance or prior-year carry-over."
            />
            <MoneyField
              label="Opex carry-in"
              name="carryInOpex"
              defaultValue={0}
              hint="Opening balance or prior-year carry-over."
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField label="Notes" name="notes" rows={2} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Add allocation</SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      {editable && options.options.length === 0 ? (
        <EmptyState>
          No eligible program left for this project: either every active fiscal year already has an
          allocation, or no annual program for this project&apos;s SI covers its years yet.
        </EmptyState>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState>No annual allocations yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <AllocationCard key={row.allocation.id} row={row} editable={editable} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  );
}

function AllocationCard({
  row,
  editable,
  projectId,
}: {
  row: ProjectAllocationRow;
  editable: boolean;
  projectId: string;
}) {
  const { allocation, annualPlan, program, position } = row;
  return (
    <Card
      title={`FY${annualPlan.fiscalYear} · ${program.code} · ${program.name}`}
      description={`Allocation status: ${annualPlan.status}`}
      actions={
        <div className="flex flex-wrap gap-1">
          <Badge tone="info">FY{annualPlan.fiscalYear}</Badge>
          {row.br11Capex ? <Badge tone="danger">capex spend above commitment</Badge> : null}
          {row.br11Opex ? <Badge tone="danger">opex spend above commitment</Badge> : null}
        </div>
      }
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <dt className="text-slate-500">Capex allocation</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocation.allocationCapex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Capex carry-in</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocation.carryInCapex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Capex remaining</dt>
          <dd className="mt-1 font-medium">
            <Money value={position.capex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex allocation</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocation.allocationOpex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex carry-in</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocation.carryInOpex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex remaining</dt>
          <dd className="mt-1 font-medium">
            <Money value={position.opex} />
          </dd>
        </div>
      </dl>

      {allocation.notes ? <p className="mt-3 text-sm text-slate-600">{allocation.notes}</p> : null}

      <p className="mt-3 text-sm">
        <Link
          href={`/plan/projects/${projectId}/allocations/${allocation.id}`}
          className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
        >
          Open commitments &amp; spend
        </Link>
      </p>

      {editable ? (
        <div className="mt-5 grid gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <details>
            <summary className={summaryClass}>Edit allocation</summary>
            <form action={updateAllocationAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <HiddenField name="id" value={allocation.id} />
              <MoneyField
                label="Capex allocation"
                name="allocationCapex"
                defaultValue={allocation.allocationCapex}
                required
              />
              <MoneyField
                label="Opex allocation"
                name="allocationOpex"
                defaultValue={allocation.allocationOpex}
                required
              />
              <MoneyField
                label="Capex carry-in"
                name="carryInCapex"
                defaultValue={allocation.carryInCapex}
              />
              <MoneyField
                label="Opex carry-in"
                name="carryInOpex"
                defaultValue={allocation.carryInOpex}
              />
              <div className="sm:col-span-2">
                <TextAreaField label="Notes" name="notes" defaultValue={allocation.notes} rows={2} />
              </div>
              <div className="sm:col-span-2">
                <ReasonField />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </form>
          </details>

          <details>
            <summary className="cursor-pointer text-sm font-medium text-red-700">Void allocation</summary>
            <form action={voidAllocationAction} className="mt-4 space-y-3">
              <HiddenField name="id" value={allocation.id} />
              <ReasonField hint="Voiding keeps the record and history; commitments and spend block voiding once recorded." />
              <SubmitButton variant="danger">Void allocation</SubmitButton>
            </form>
          </details>
        </div>
      ) : null}
    </Card>
  );
}
