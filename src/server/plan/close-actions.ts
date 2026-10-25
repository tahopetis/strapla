'use server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  carryOverEntries,
  projectYearAllocations,
} from '@/db/schema';
import { closeFiscalYearSchema } from '@/domain/inputs';
import { parseRupiah } from '@/domain/money';
import { validateCarryOverAmount } from '@/domain/close';
import {
  FormError,
  actionUser,
  describeError,
  failWith,
  finishWith,
  parseForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';
import { getCloseState } from './close-queries';

interface CarryEntry {
  entityType: 'program' | 'allocation';
  sourceEntityId: string;
  targetEntityId: string;
  component: 'capex' | 'opex';
  amount: number;
}

function parseAmount(formData: FormData, key: string): number {
  const raw = formData.get(key);
  if (typeof raw !== 'string' || raw.trim() === '') return 0;
  try {
    const amount = parseRupiah(raw);
    if (amount < 0) throw new FormError('Carry-over amounts cannot be negative.');
    return amount;
  } catch {
    throw new FormError('Carry-over amounts must be whole Rupiah numbers.');
  }
}

function requireTarget<T>(targets: T[], value: string | null, label: string): T {
  const target = targets.find((candidate) => candidate === value);
  if (!target) throw new FormError(`Choose a target program for ${label}.`);
  return target;
}

async function closeFiscalYear(
  userId: string,
  input: { annualPlanId: string; reference: string },
  formData: FormData,
): Promise<void> {
  const state = await getCloseState(input.annualPlanId);
  if (!state) throw new FormError('Annual plan not found.');
  if (state.plan.status === 'closed') throw new FormError('This fiscal year is already closed.');
  if (state.plan.status !== 'active') {
    throw new FormError('Only an active annual plan can be closed.');
  }
  if (state.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (!state.targetPlan) {
    throw new FormError(
      `The FY${state.plan.fiscalYear + 1} annual plan does not exist yet; create it before closing.`,
    );
  }
  const targetPlan = state.targetPlan;
  if (targetPlan.status === 'closed') {
    throw new FormError('The target fiscal year is already closed.');
  }
  if (state.carryOvers.length > 0) {
    throw new FormError('Carry-over for this fiscal year is already recorded.');
  }

  const programCarries = new Map<string, { capex: number; opex: number }>();
  for (const row of state.programs) {
    programCarries.set(row.program.id, {
      capex: parseAmount(formData, `carry_program_${row.program.id}_capex`),
      opex: parseAmount(formData, `carry_program_${row.program.id}_opex`),
    });
  }

  const programTargets = new Map<string, string>();
  for (const row of state.programs) {
    const carry = programCarries.get(row.program.id) ?? { capex: 0, opex: 0 };
    const chosen = formData.get(`target_program_${row.program.id}`);
    const value = typeof chosen === 'string' ? chosen.trim() : '';
    if (carry.capex + carry.opex === 0) {
      programTargets.set(row.program.id, value);
      continue;
    }
    const target = requireTarget(
      row.targetPrograms.map((candidate) => candidate.value),
      value,
      `${row.program.code} ${row.program.name}`,
    );
    programTargets.set(row.program.id, target);
  }

  const entries: CarryEntry[] = [];
  for (const row of state.programs) {
    const targetProgramId = programTargets.get(row.program.id);
    const carry = programCarries.get(row.program.id) ?? { capex: 0, opex: 0 };
    for (const component of ['capex', 'opex'] as const) {
      const amount = component === 'capex' ? carry.capex : carry.opex;
      if (amount === 0) continue;
      validateCarryOverAmount({
        amount,
        available: component === 'capex' ? row.unallocatedCapex : row.unallocatedOpex,
        label: `${row.program.code} ${component} carry-over`,
      });
      if (!targetProgramId) throw new FormError(`Choose a target program for ${row.program.code}.`);
      entries.push({
        entityType: 'program',
        sourceEntityId: row.program.id,
        targetEntityId: targetProgramId,
        component,
        amount,
      });
    }
  }

  for (const row of state.allocations) {
    for (const component of ['capex', 'opex'] as const) {
      const amount = parseAmount(formData, `carry_allocation_${row.allocation.id}_${component}`);
      if (amount === 0) continue;
      validateCarryOverAmount({
        amount,
        available: component === 'capex' ? row.remainingCapex : row.remainingOpex,
        label: `${row.project.code} ${component} carry-over`,
      });
      if (!row.targetAllocation && !row.canCreateTarget) {
        throw new FormError(
          row.note ?? `Cannot carry ${row.project.code} into FY${targetPlan.fiscalYear}.`,
        );
      }
      const targetEntityId =
        row.targetAllocation?.id ?? `new-allocation:${row.allocation.id}`;
      entries.push({
        entityType: 'allocation',
        sourceEntityId: row.allocation.id,
        targetEntityId,
        component,
        amount,
      });
    }
  }

  await getDb().transaction(async (tx) => {
    const targetProgramsById = new Map(
      (
        await tx
          .select()
          .from(annualPrograms)
          .where(eq(annualPrograms.annualPlanId, targetPlan?.id ?? ''))
      ).map((program) => [program.id, program]),
    );

    for (const entry of entries.filter((candidate) => candidate.entityType === 'program')) {
      const target = targetProgramsById.get(entry.targetEntityId);
      if (!target) throw new FormError('A target program was not found.');
      await tx
        .update(annualPrograms)
        .set(
          entry.component === 'capex'
            ? { carryInCapex: target.carryInCapex + entry.amount, updatedBy: userId, updatedAt: new Date() }
            : { carryInOpex: target.carryInOpex + entry.amount, updatedBy: userId, updatedAt: new Date() },
        )
        .where(eq(annualPrograms.id, target.id));
      const [created] = await tx
        .insert(carryOverEntries)
        .values({
          sourceAnnualPlanId: state.plan.id,
          targetAnnualPlanId: targetPlan.id,
          entityType: 'program',
          sourceEntityId: entry.sourceEntityId,
          targetEntityId: target.id,
          component: entry.component,
          amount: entry.amount,
          approvalReference: input.reference,
          createdBy: userId,
        })
        .returning();
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'carry_over',
        entityType: 'annual_program',
        entityId: target.id,
        after: {
          amount: entry.amount,
          component: entry.component,
          sourceAnnualPlanId: state.plan.id,
          targetAnnualPlanId: targetPlan.id,
          carryOverEntryId: created?.id,
        },
        reason: input.reference,
      });
    }

    // Allocation carry-over: group per source allocation.
    const allocationGroups = new Map<string, CarryEntry[]>();
    for (const entry of entries.filter((candidate) => candidate.entityType === 'allocation')) {
      const list = allocationGroups.get(entry.sourceEntityId) ?? [];
      list.push(entry);
      allocationGroups.set(entry.sourceEntityId, list);
    }
    for (const [sourceAllocationId, group] of allocationGroups.entries()) {
      const row = state.allocations.find((candidate) => candidate.allocation.id === sourceAllocationId);
      if (!row) throw new FormError('An allocation to carry over was not found.');
      const carryCapex = group.find((entry) => entry.component === 'capex')?.amount ?? 0;
      const carryOpex = group.find((entry) => entry.component === 'opex')?.amount ?? 0;

      let targetAllocationId = row.targetAllocation?.id ?? null;
      if (targetAllocationId) {
        const [target] = await tx
          .select()
          .from(projectYearAllocations)
          .where(eq(projectYearAllocations.id, targetAllocationId))
          .limit(1);
        if (!target) throw new FormError('The target allocation was not found.');
        await tx
          .update(projectYearAllocations)
          .set({
            carryInCapex: target.carryInCapex + carryCapex,
            carryInOpex: target.carryInOpex + carryOpex,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(projectYearAllocations.id, target.id));
      } else {
        const targetProgramId = programTargets.get(row.allocation.annualProgramId);
        if (!targetProgramId) {
          throw new FormError(`No target program for ${row.project.code}.`);
        }
        const [created] = await tx
          .insert(projectYearAllocations)
          .values({
            projectId: row.project.id,
            annualPlanId: targetPlan.id,
            annualProgramId: targetProgramId,
            allocationCapex: 0,
            allocationOpex: 0,
            carryInCapex: carryCapex,
            carryInOpex: carryOpex,
            notes: `Carry-over from FY${state.plan.fiscalYear} (${input.reference}).`,
            createdBy: userId,
            updatedBy: userId,
          })
          .returning();
        if (!created) throw new Error('failed to create the target allocation');
        targetAllocationId = created.id;
        await recordAudit(tx, {
          actorUserId: userId,
          action: 'create',
          entityType: 'project_year_allocation',
          entityId: created.id,
          after: {
            projectId: row.project.id,
            annualPlanId: targetPlan.id,
            carryInCapex: carryCapex,
            carryInOpex: carryOpex,
          },
          reason: `Created by FY${state.plan.fiscalYear} close: ${input.reference}`,
        });
      }

      for (const entry of group) {
        const [createdEntry] = await tx
          .insert(carryOverEntries)
          .values({
            sourceAnnualPlanId: state.plan.id,
            targetAnnualPlanId: targetPlan.id,
            entityType: 'allocation',
            sourceEntityId: sourceAllocationId,
            targetEntityId: targetAllocationId,
            component: entry.component,
            amount: entry.amount,
            approvalReference: input.reference,
            createdBy: userId,
          })
          .returning();
        await recordAudit(tx, {
          actorUserId: userId,
          action: 'carry_over',
          entityType: 'project_year_allocation',
          entityId: targetAllocationId,
          after: {
            amount: entry.amount,
            component: entry.component,
            sourceAnnualPlanId: state.plan.id,
            targetAnnualPlanId: targetPlan.id,
            carryOverEntryId: createdEntry?.id,
          },
          reason: input.reference,
        });
      }
    }

    const [closed] = await tx
      .update(annualPlans)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closedBy: userId,
        closeReference: input.reference,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(annualPlans.id, state.plan.id))
      .returning();
    if (!closed) throw new FormError('Annual plan not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'close',
      entityType: 'annual_plan',
      entityId: state.plan.id,
      before: { status: state.plan.status },
      after: {
        status: 'closed',
        closeReference: input.reference,
        targetAnnualPlanId: targetPlan.id,
        carryOverEntries: entries.length,
      },
      reason: input.reference,
    });
  });
}

export async function closeFiscalYearAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  let planId: string | null = null;
  try {
    const input = parseForm(closeFiscalYearSchema, formData);
    planId = input.annualPlanId;
    await closeFiscalYear(actor.id, input, formData);
  } catch (error) {
    failWith(planId ? `/plan/annual/${planId}/close` : '/plan/annual', describeError(error));
  }
  finishWith(
    planId ? `/plan/annual/${planId}` : '/plan/annual',
    'Fiscal year closed and carry-over recorded.',
  );
}
