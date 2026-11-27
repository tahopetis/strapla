'use server';

import { getDb } from '@/db/client';
import {
  annualPrograms,
  ijinPrinsipRecords,
  projects,
  strategicInitiatives,
  type IjinPrinsipRecord,
  type AnnualProgram,
  type Project,
  type StrategicInitiative,
} from '@/db/schema';
import {
  isOpeningDataSetId,
  openingLoadReason,
  type OpeningDataSetId,
} from '@/lib/opening-import/field-list';
import { parseOpeningImport, type ParsedRow } from '@/lib/opening-import/parse';
import { withCustomFields, type CustomFieldDefinition, type CustomFieldEntityType, type CustomFieldValues } from '@/domain/custom-fields';
import { actionUser, describeError, finishWith } from '@/server/actions/common';
import { recordAudit } from '@/server/audit';
import { receiveCarry } from './carry-ledger';
import {
  saveCustomFieldValues,
  type CustomFieldExecutor,
} from '@/server/custom-fields/data';
import { listOpeningRegistryFields } from './opening-import-fields';
import { getOpeningLoadScene } from './opening-queries';
import { getCurrentStrategicPlan } from './queries';
import {
  planOpeningLoad,
  type OpeningCustomField,
  type OpeningLoadPlan,
} from './opening-load';
import type { OpeningImportState } from './opening-import-types';

const LANDING = '/plan/opening-balances';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const DATA_SET_LABELS: Record<OpeningDataSetId, string> = {
  'strategic-initiatives': 'strategic initiative',
  'annual-programs': 'annual program',
  projects: 'project',
};

function errorState(message: string): OpeningImportState {
  return { status: 'error', message };
}

function previewRows(dataSet: OpeningDataSetId, rows: readonly ParsedRow[]): string[] {
  const nameField = dataSet === 'projects' ? 'name' : 'code';
  return rows
    .slice(0, 10)
    .map((row) => `${row.line}: ${String(row.values[nameField] ?? '—')}`);
}

function initiativeAfter(row: StrategicInitiative): Record<string, unknown> {
  return {
    code: row.code,
    name: row.name,
    owner: row.owner,
    objective: row.objective,
    envelopeCapex: row.envelopeCapex,
    envelopeOpex: row.envelopeOpex,
    priorProgramBudgetUsedCapex: row.priorProgramBudgetUsedCapex,
    priorProgramBudgetUsedOpex: row.priorProgramBudgetUsedOpex,
    notes: row.notes,
  };
}

function programAfter(row: AnnualProgram, carryIn?: { capex: number; opex: number }): Record<string, unknown> {
  return {
    code: row.code,
    name: row.name,
    capexBudget: row.capexBudget,
    opexBudget: row.opexBudget,
    carryInCapex: carryIn?.capex ?? row.carryInCapex,
    carryInOpex: carryIn?.opex ?? row.carryInOpex,
    prevProgramId: row.prevProgramId,
    notes: row.notes,
  };
}

function projectAfter(row: Project): Record<string, unknown> {
  return {
    code: row.code,
    name: row.name,
    externalReference: row.externalReference,
    owner: row.owner,
    startFiscalYear: row.startFiscalYear,
    endFiscalYear: row.endFiscalYear,
    allocatedBudgetFullLife: row.allocatedBudgetFullLife,
    submittedPrice: row.submittedPrice,
    finalDealPrice: row.finalDealPrice,
    openingAllocated: row.openingAllocated,
    openingCommitted: row.openingCommitted,
    openingSpent: row.openingSpent,
  };
}

function ijinAfter(row: IjinPrinsipRecord): Record<string, unknown> {
  return {
    documentNumber: row.documentNumber,
    documentDate: row.documentDate,
    approvedAmount: row.approvedAmount,
    approver: row.approver,
    documentUrl: row.documentUrl,
    notes: row.notes,
  };
}

/**
 * Stores one imported record's registry values in the load's transaction. The
 * planner already validated them and keyed them by field id; nothing is written
 * when the entity has no active field.
 */
async function storeCustomFieldValues(
  executor: CustomFieldExecutor,
  entityType: CustomFieldEntityType,
  entityId: string,
  fields: readonly CustomFieldDefinition[],
  values: CustomFieldValues,
  userId: string,
): Promise<void> {
  if (fields.length === 0) return;
  await saveCustomFieldValues(executor, { entityType, entityId, fields, values, userId });
}

/**
 * Writes the planned load in one transaction. Every created record gets exactly
 * one audit entry carrying the load reason and, when the registry declares extra
 * fields, its imported values in the snapshot; the values themselves are stored
 * in the same transaction, so a record can never exist without them. Any
 * failure rolls the whole load back.
 */
async function writeOpeningLoad(
  plan: OpeningLoadPlan,
  userId: string,
  reason: string,
  customFields: readonly OpeningCustomField[],
): Promise<number> {
  const definitions = customFields.map((entry) => entry.definition);

  return getDb().transaction(async (tx) => {
    let created = 0;

    if (plan.dataSet === 'strategic-initiatives') {
      for (const planned of plan.initiatives) {
        const [row] = await tx
          .insert(strategicInitiatives)
          .values({ ...planned.values, createdBy: userId, updatedBy: userId })
          .returning();
        if (!row) throw new Error('failed to create the strategic initiative');
        await storeCustomFieldValues(
          tx,
          'strategic_initiative',
          row.id,
          definitions,
          planned.customFieldValues,
          userId,
        );
        await recordAudit(tx, {
          actorUserId: userId,
          action: 'create',
          entityType: 'strategic_initiative',
          entityId: row.id,
          after: withCustomFields(initiativeAfter(row), definitions, planned.customFieldValues),
          reason,
        });
        created += 1;
      }
      return created;
    }

    if (plan.dataSet === 'annual-programs') {
      for (const planned of plan.programs) {
        const [row] = await tx
          .insert(annualPrograms)
          .values({ ...planned.values, createdBy: userId, updatedBy: userId })
          .returning();
        if (!row) throw new Error('failed to create the annual program');
        await storeCustomFieldValues(
          tx,
          'annual_program',
          row.id,
          definitions,
          planned.customFieldValues,
          userId,
        );

        // Opening carry-in is a ledger receipt, not a program column
        // (ADR-0006 §2): the receipt carries the load reason, and the guarded
        // contract case is recomputed from the ledger sum.
        let carryIn: { capex: number; opex: number } | undefined;
        for (const component of ['capex', 'opex'] as const) {
          const amount = planned.openingCarry?.[component] ?? 0;
          if (amount <= 0) continue;
          const receipt = await receiveCarry(tx, {
            origin: 'opening',
            targetAnnualPlanId: row.annualPlanId,
            entityType: 'program',
            targetEntityId: row.id,
            component,
            amount,
            reason,
            actorUserId: userId,
          });
          carryIn = receipt.cache;
          await recordAudit(tx, {
            actorUserId: userId,
            action: 'carry_over',
            entityType: 'annual_program',
            entityId: row.id,
            after: {
              origin: 'opening',
              component,
              amount,
              targetAnnualPlanId: row.annualPlanId,
              carryOverEntryId: receipt.entry.id,
            },
            reason,
          });
        }

        await recordAudit(tx, {
          actorUserId: userId,
          action: 'create',
          entityType: 'annual_program',
          entityId: row.id,
          after: withCustomFields(
            programAfter(row, carryIn),
            definitions,
            planned.customFieldValues,
          ),
          reason,
        });
        created += 1;
      }
      return created;
    }

    const ijinByProjectCode = new Map(plan.ijins.map((entry) => [entry.projectCode, entry.ijin]));
    for (const planned of plan.projects) {
      const [row] = await tx
        .insert(projects)
        .values({ ...planned.values, createdBy: userId, updatedBy: userId })
        .returning();
      if (!row) throw new Error('failed to create the project');
      await storeCustomFieldValues(
        tx,
        'project',
        row.id,
        definitions,
        planned.customFieldValues,
        userId,
      );
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'create',
        entityType: 'project',
        entityId: row.id,
        after: withCustomFields(projectAfter(row), definitions, planned.customFieldValues),
        reason,
      });

      const ijin = ijinByProjectCode.get(planned.values.code);
      if (ijin) {
        const [ijinRow] = await tx
          .insert(ijinPrinsipRecords)
          .values({ ...ijin, projectId: row.id, createdBy: userId })
          .returning();
        if (!ijinRow) throw new Error('failed to create the ijin prinsip record');
        await recordAudit(tx, {
          actorUserId: userId,
          action: 'create',
          entityType: 'ijin_prinsip',
          entityId: ijinRow.id,
          after: ijinAfter(ijinRow),
          reason,
        });
      }
      created += 1;
    }
    return created;
  });
}

/**
 * The wizard action: validate first and return row-level errors (nothing written),
 * then write in one transaction when the load is requested.
 */
export async function openingImportAction(
  _previous: OpeningImportState,
  formData: FormData,
): Promise<OpeningImportState> {
  const user = await actionUser();

  const dataSetRaw = String(formData.get('dataSet') ?? '').trim();
  if (!isOpeningDataSetId(dataSetRaw)) return errorState('Choose an opening data set.');
  const dataSet = dataSetRaw;

  const reference = String(formData.get('reference') ?? '').trim();
  if (reference === '') return errorState('Enter the approval reference for the load.');
  if (reference.length > 160) return errorState('The approval reference is too long.');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return errorState('Choose a CSV or XLSX file to import.');
  }
  if (file.size > MAX_FILE_BYTES) return errorState('The file is larger than 10 MB.');

  const plan = await getCurrentStrategicPlan();
  if (!plan) return errorState('Create the strategic plan before importing.');
  if (plan.status === 'archived') return errorState('The strategic plan is archived and read-only.');

  const scene = await getOpeningLoadScene(plan);
  if (!scene.annualPlan) {
    return errorState(
      `Create the FY${plan.startFiscalYear + 1} annual plan before importing opening balances.`,
    );
  }
  if (scene.annualPlan.status === 'closed') {
    return errorState(`FY${scene.annualPlan.fiscalYear} is closed and cannot receive an import.`);
  }
  if (!scene.context) return errorState('The import context could not be loaded.');

  // The custom-field registry is the runtime owner-column source (W9): every
  // active field for the data set's entity is an importable column, while the
  // committed list stays the headless parser's fallback.
  const registry = await listOpeningRegistryFields(dataSet, plan.startFiscalYear);

  let parsed;
  try {
    parsed = await parseOpeningImport({
      dataSet,
      bytes: new Uint8Array(await file.arrayBuffer()),
      ownerColumns: registry.columns,
    });
  } catch (error) {
    return errorState(describeError(error));
  }
  if (!parsed.ok) {
    return { status: 'invalid', dataSet, reference, errors: parsed.errors };
  }

  const planned = planOpeningLoad(dataSet, parsed.rows, scene.context, registry.fields);
  if (planned.errors.length > 0 || !planned.plan) {
    return { status: 'invalid', dataSet, reference, errors: planned.errors };
  }

  if (formData.get('intent') !== 'load') {
    return {
      status: 'valid',
      dataSet,
      reference,
      rowCount: parsed.rows.length,
      preview: previewRows(dataSet, parsed.rows),
    };
  }

  const reason = openingLoadReason(plan.startFiscalYear, reference);
  let created: number;
  try {
    created = await writeOpeningLoad(planned.plan, user.id, reason, registry.fields);
  } catch (error) {
    return errorState(describeError(error));
  }

  finishWith(LANDING, `Imported ${created} ${DATA_SET_LABELS[dataSet]} record(s) from ${file.name}.`);
}
