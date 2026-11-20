import {
  resolveReportColumnSelection,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldValues,
} from '@/domain/custom-fields';
import { getCurrentUser } from '@/server/auth/session';
import { listCustomFieldDefinitions, readAllCustomFieldValues } from '@/server/custom-fields/data';
import { readReportColumnPreference } from './report-preferences';
import type { ReportKey } from './report-tables';

/**
 * Custom-field columns for the four plan reports (issue #46).
 *
 * A report table is the join point between an entity's registered fields and
 * the record ids the report query already carries. The registry is the only
 * source of columns, so a field removed from the registry disappears from both
 * the screen and an export without touching a report. Values are read whole
 * per entity: the same map feeds the on-screen filter and the exported column,
 * while the money columns and totals are never part of this module (G1).
 */

/** One report table that shows the custom fields of one entity. */
export interface ReportCustomFieldEntity {
  entityType: CustomFieldEntityType;
  /** Must match the `ExportTable.name` of the report table. */
  tableName: string;
}

/** The entity behind each table of each report, in table order. */
export const REPORT_CUSTOM_FIELD_ENTITIES: Record<ReportKey, readonly ReportCustomFieldEntity[]> = {
  'si-five-year': [{ entityType: 'strategic_initiative', tableName: 'SI five-year view' }],
  'annual-plan': [
    { entityType: 'annual_program', tableName: 'Annual programs' },
    { entityType: 'recurring_ops_item', tableName: 'Recurring operations' },
  ],
  'project-register': [{ entityType: 'project', tableName: 'Project register' }],
  'budget-vs-actual': [{ entityType: 'annual_program', tableName: 'Budget versus actual' }],
};

export interface ReportCustomFieldGroup {
  entityType: CustomFieldEntityType;
  tableName: string;
  /** Every active field of the entity, in registry order. */
  fields: readonly CustomFieldDefinition[];
  /** The subset selected for the page/export columns, in registry order. */
  selectedFields: readonly CustomFieldDefinition[];
  /** Values for every record of the entity, keyed by record id. */
  values: Map<string, CustomFieldValues>;
}

/**
 * Loads the field registry and the recorded values for each table of a report.
 *
 * `rawColumns` is the request's explicit column selection: absent means "use
 * the remembered selection, else every active field", an explicit empty list
 * means none (see `resolveReportColumnSelection`). `rememberedColumns` is the
 * signed-in user's saved selection (#75), read by the caller through
 * `readRememberedReportColumns`; it is ignored whenever `rawColumns` is present
 * because an explicit parameter always wins for that view. An entity without
 * fields is returned as an empty group without reading the values table, and
 * raw ids that belong to another entity are simply ignored.
 */
export async function loadReportCustomFieldGroups(
  report: ReportKey,
  rawColumns: string | readonly string[] | undefined | null,
  rememberedColumns: readonly string[] | null = null,
): Promise<ReportCustomFieldGroup[]> {
  const groups: ReportCustomFieldGroup[] = [];

  for (const entity of REPORT_CUSTOM_FIELD_ENTITIES[report]) {
    const fields = await listCustomFieldDefinitions(entity.entityType);
    groups.push({
      entityType: entity.entityType,
      tableName: entity.tableName,
      fields,
      selectedFields: resolveReportColumnSelection(fields, rawColumns, rememberedColumns),
      values: fields.length === 0 ? new Map() : await readAllCustomFieldValues(entity.entityType),
    });
  }

  return groups;
}

/**
 * The user's saved custom-column selection for a report, for the report pages
 * (#75). It is read only when the request names no `columns` parameter: an
 * explicit selection wins for that view and must not be overridden by, or
 * written as, the saved one. A page GET never writes the preference; only the
 * "save selection" control does.
 */
export async function readRememberedReportColumns(
  report: ReportKey,
  rawColumns: string | readonly string[] | undefined | null,
): Promise<string[] | null> {
  if (rawColumns !== undefined && rawColumns !== null) return null;
  const user = await getCurrentUser();
  return user ? readReportColumnPreference(user.id, report) : null;
}
