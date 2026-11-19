import {
  OPENING_DATA_SETS,
  type OpeningDataSetId,
  type OpeningField,
} from '@/lib/opening-import/field-list';
import type {
  CustomFieldDefinition,
  CustomFieldEntityType,
  CustomFieldType,
} from '@/domain/custom-fields';
import { listCustomFieldDefinitions } from '@/server/custom-fields/data';
import type { OpeningCustomField } from './opening-load';

/**
 * The opening-import custom-field columns at runtime (W9).
 *
 * The headless parser and template generator take their owner columns from
 * `src/lib/opening-import/owner-columns.ts` (a committed list, because they have
 * no database). On the server the **custom-field registry** is the source of
 * truth: every active field an administrator adds under Administration →
 * Custom fields becomes a column of the matching data set, so it is importable
 * instead of being rejected as an unknown column.
 *
 * The parsed row keeps the registry's stable `key` (the same identifier the
 * committed W9 field list uses; it is suffixed only if an app-owned field name
 * would collide), and the load pairs each column with its registry definition so
 * the definition id — the `custom_field_values` key — is always the one that
 * belongs to that column. The column header is the administrator's display name;
 * if that would repeat an app-owned header, the import appends " (custom field)"
 * so both columns can coexist instead of breaking the whole template.
 */

/** The plan-record entity each opening data set creates. */
const ENTITY_BY_DATA_SET: Record<OpeningDataSetId, CustomFieldEntityType> = {
  'strategic-initiatives': 'strategic_initiative',
  'annual-programs': 'annual_program',
  projects: 'project',
};

const CUSTOM_HEADER_SUFFIX = ' (custom field)';

export interface OpeningRegistryFields {
  /** The declared columns the template renders and the parser accepts. */
  columns: OpeningField[];
  /** The same entries with their registry definitions, for planning and storage. */
  fields: OpeningCustomField[];
}

/**
 * Projects the registry definitions onto the declared import field list, in
 * registry order. App-owned names and headers are reserved first; a registry key
 * or display name that repeats one is suffixed rather than rejected, so an
 * administrator field can never make the template or an import unrunnable.
 * `closingFiscalYear` only feeds the template example row, whose date follows the
 * year being closed instead of a hard-coded year.
 */
export function openingFieldsFromRegistry(
  dataSet: OpeningDataSetId,
  definitions: readonly CustomFieldDefinition[],
  closingFiscalYear: number,
): OpeningRegistryFields {
  const appOwned = OPENING_DATA_SETS[dataSet].fields;
  const takenNames = new Set(appOwned.map((field) => field.name));
  const takenLabels = new Set(appOwned.map((field) => field.label.toLowerCase()));

  const columns: OpeningField[] = [];
  const fields: OpeningCustomField[] = [];

  for (const definition of definitions) {
    const column = toOpeningColumn(definition, closingFiscalYear, takenNames, takenLabels);
    takenNames.add(column.name);
    takenLabels.add(column.label.toLowerCase());
    columns.push(column);
    fields.push({ column: column.name, label: column.label, definition });
  }

  return { columns, fields };
}

function toOpeningColumn(
  field: CustomFieldDefinition,
  closingFiscalYear: number,
  takenNames: ReadonlySet<string>,
  takenLabels: ReadonlySet<string>,
): OpeningField {
  return {
    name: uniqueName(field.key, takenNames),
    label: uniqueLabel(field.name, takenLabels),
    type: field.type,
    required: field.required,
    // A required registry field is enforced per row by the load planner: an
    // import file may have been prepared before the administrator added it.
    headerRequired: false,
    // Custom fields are metadata, never money (G1): their number columns use
    // the form's signed-integer rule, not the Rupiah rule.
    numberRule: field.type === 'number' ? 'integer' : undefined,
    // The template renders the description in a one-line CSV comment, so keep
    // the administrator's free text on one line.
    description: field.description.replace(/\s+/g, ' ').trim(),
    example: exampleFor(field.type, closingFiscalYear),
  };
}

function uniqueName(key: string, taken: ReadonlySet<string>): string {
  if (!taken.has(key)) return key;
  let candidate = `${key}Custom`;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${key}Custom${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniqueLabel(label: string, taken: ReadonlySet<string>): string {
  if (!taken.has(label.toLowerCase())) return label;
  let candidate = `${label}${CUSTOM_HEADER_SUFFIX}`;
  let suffix = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${label}${CUSTOM_HEADER_SUFFIX} ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function exampleFor(type: CustomFieldType, closingFiscalYear: number): string {
  if (type === 'number') return '0';
  if (type === 'date') return `${closingFiscalYear}-01-01`;
  return 'Example text';
}

/** Loads the active registry for one data set and projects it onto import columns. */
export async function listOpeningRegistryFields(
  dataSet: OpeningDataSetId,
  closingFiscalYear: number,
): Promise<OpeningRegistryFields> {
  const definitions = await listCustomFieldDefinitions(ENTITY_BY_DATA_SET[dataSet]);
  return openingFieldsFromRegistry(dataSet, definitions, closingFiscalYear);
}
