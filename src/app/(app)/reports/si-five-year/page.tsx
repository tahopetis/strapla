import type { Metadata } from 'next';
import { Fragment } from 'react';
import {
  CustomFieldCells,
  CustomFieldFilterForm,
  CustomFieldHeaderCells,
} from '@/components/custom-fields';
import { ReportNote, ReportShell } from '@/components/report-shell';
import { Badge, Card, Money } from '@/components/ui';
import { matchesAllCustomFieldFilters, resolveCustomFieldFilters } from '@/domain/custom-fields';
import { getCurrentStrategicPlan } from '@/server/plan/queries';
import {
  loadReportCustomFieldGroups,
  readRememberedReportColumns,
} from '@/server/plan/report-custom-fields';
import { getSiFiveYearReport } from '@/server/plan/report-queries';
import { CorrectionBadge, CorrectionNote } from '../correction-marker';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'SI five-year view' };

const th = 'py-2 pr-3 text-left text-xs uppercase tracking-wide text-slate-500';

/**
 * The component group of the view (ADR-0006 §5). Every figure is repeated for
 * capex and opex so the two envelopes never share headroom.
 */
const COMPONENT_COLUMNS = [
  'Envelope',
  'Prior consumed',
  'Program budgets',
  'Allocated',
  'Committed',
  'Spent',
  'Consumed',
  'Headroom',
  'Status',
] as const;

function componentHeader(component: 'Capex' | 'Opex'): string[] {
  return COMPONENT_COLUMNS.map((column) => `${component} ${column.toLowerCase()}`);
}

export default async function SiFiveYearPage({
  searchParams,
}: {
  searchParams: Promise<{
    cf?: string | string[];
    cv?: string | string[];
    columns?: string | string[];
  }>;
}) {
  const { cf: cfParam, cv: cvParam, columns } = await searchParams;
  const plan = await getCurrentStrategicPlan();
  if (!plan) {
    return <p className="text-sm text-slate-600">Create the strategic plan to see this report.</p>;
  }
  const report = await getSiFiveYearReport(plan.id);
  const remembered = await readRememberedReportColumns('si-five-year', columns);
  const groups = await loadReportCustomFieldGroups('si-five-year', columns, remembered);
  const [group] = groups;
  const fields = group?.fields ?? [];
  const selectedIds = groups.flatMap((candidate) =>
    candidate.selectedFields.map((field) => field.id),
  );
  const visibleFields = group?.selectedFields ?? [];
  // Repeated cf/cv pairs narrow the rows together (AND, #74); totals and the
  // export above stay whole-report because they never see these filters.
  const filters = resolveCustomFieldFilters(fields, cfParam, cvParam);
  const rows =
    filters.length > 0
      ? report.rows.filter((row) =>
          matchesAllCustomFieldFilters(group?.values.get(row.initiative.id), filters),
        )
      : report.rows;
  const components = [
    ['capex', report.totals.capex],
    ['opex', report.totals.opex],
  ] as const;

  return (
    <ReportShell
      title="SI five-year view"
      description={`${plan.name} · fiscal years ${plan.startFiscalYear}–${plan.endFiscalYear}`}
      reportKey="si-five-year"
      exportFields={groups.flatMap((candidate) => candidate.fields)}
      selectedExportFieldIds={groups.flatMap((candidate) =>
        candidate.selectedFields.map((field) => field.id),
      )}
    >
      <ReportNote>
        Committed and spent are the in-app execution figures: fiscal-year commitments and actual spend
        entries (including cross-year settlements of earlier-year commitments). Program budgets are
        effective: the initial budget plus every posted budget revision. Consumed = prior program budget
        consumed + effective program budgets; headroom is the envelope remaining for that component
        (BR-2). Capex and opex never share headroom.
      </ReportNote>

      {fields.length > 0 ? (
        <div className="screen-only">
          <CustomFieldFilterForm
            fields={fields}
            action="/reports/si-five-year"
            filters={filters}
            columnSelection={columns === undefined ? undefined : selectedIds}
          />
        </div>
      ) : null}

      <Card
        title="Strategic initiatives"
        description="Envelope, consumption and headroom per component across the five-year horizon."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead>
              <tr>
                <th className={th}>Initiative</th>
                {componentHeader('Capex').map((header) => (
                  <th key={header} className={th}>
                    {header}
                  </th>
                ))}
                {componentHeader('Opex').map((header) => (
                  <th key={header} className={th}>
                    {header}
                  </th>
                ))}
                <CustomFieldHeaderCells fields={visibleFields} className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.initiative.id}>
                  <td className="py-3 pr-3">
                    <p className="font-medium">{row.initiative.code}</p>
                    <p className="text-slate-600">{row.initiative.name}</p>
                    {row.corrected ? (
                      <div className="mt-1">
                        <CorrectionBadge />
                      </div>
                    ) : null}
                  </td>
                  {(
                    [
                      ['capex', row.capex],
                      ['opex', row.opex],
                    ] as const
                  ).map(([key, value]) => (
                    <Fragment key={key}>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={value.envelope} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={value.priorConsumed} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={value.programBudget} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={value.allocation} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={value.commitment} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={value.spend} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={value.consumed} />
                      </td>
                      <td
                        className={`py-3 pr-3 whitespace-nowrap ${value.over ? 'text-red-700' : ''}`}
                      >
                        <Money value={value.headroom} />
                      </td>
                      <td className="py-3 pr-3">
                        {value.over ? (
                          <Badge tone="danger">over {key} envelope</Badge>
                        ) : (
                          <Badge tone="success">within {key} envelope</Badge>
                        )}
                      </td>
                    </Fragment>
                  ))}
                  <CustomFieldCells
                    fields={visibleFields}
                    values={group?.values.get(row.initiative.id)}
                    className="py-3 pr-3"
                  />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 font-medium">
              <tr>
                <td className="py-3 pr-4">Portfolio total</td>
                {components.map(([key, value]) => (
                  <Fragment key={key}>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={value.envelope} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={value.priorConsumed} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={value.programBudget} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={value.allocation} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={value.commitment} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={value.spend} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={value.consumed} />
                    </td>
                    <td
                      className={`py-3 pr-3 whitespace-nowrap ${value.over ? 'text-red-700' : ''}`}
                    >
                      <Money value={value.headroom} />
                    </td>
                    <td className="py-3 pr-3">
                      {value.over ? (
                        <Badge tone="danger">over {key} envelope</Badge>
                      ) : (
                        <Badge tone="success">within {key} envelope</Badge>
                      )}
                    </td>
                  </Fragment>
                ))}
                {visibleFields.map((field) => (
                  <td key={field.id} className="py-3 pr-3" />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        {filters.length > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Totals cover the whole report, not only the filtered rows.
          </p>
        ) : null}
        {rows.some((row) => row.corrected) ? <CorrectionNote /> : null}
      </Card>
    </ReportShell>
  );
}
