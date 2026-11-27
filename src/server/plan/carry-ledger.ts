import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import {
  annualPrograms,
  carryOverEntries,
  projectYearAllocations,
  type CarryOverEntry,
  type CarryOverOrigin,
} from '@/db/schema';
import type { ComponentAmounts } from '@/domain/revisions';

/** The two money components; capex and opex never shift into each other. */
export type CarryLedgerComponent = 'capex' | 'opex';

/**
 * The carry-over ledger service (ADR-0006 §2–3, #113).
 *
 * `carry_over_entries` is the single source of carry-in: entries are appended,
 * never updated or deleted, and there is no reversal entry — a later cut is a
 * budget revision (ADR-0006 §4). The `carry_in_*` columns on programs and
 * allocations remain as a guarded cache, and `recomputeCarryCache` is their only
 * writer: it reads the ledger sum and writes it, so the cache can never drift
 * by incremental updates.
 */

/** Enough of the database handle for a ledger write; both `Db` and a transaction satisfy it. */
export type CarryLedgerExecutor = Pick<Db, 'select' | 'insert' | 'update'>;

export class CarryLedgerError extends Error {}

export interface CarryLedgerTarget {
  entityType: 'program' | 'allocation';
  entityId: string;
}

export interface AppendCarryEntryInput {
  origin: CarryOverOrigin;
  entityType: 'program' | 'allocation';
  /** The receiving entity (annual program or project year allocation id). */
  targetEntityId: string;
  targetAnnualPlanId: string;
  component: CarryLedgerComponent;
  amount: number;
  /**
   * Source year and entity of a carried amount. Both are set for a close
   * receipt, and neither is set for an opening or manual receipt.
   */
  sourceAnnualPlanId?: string | null;
  sourceEntityId?: string | null;
  /** Required for opening/manual receipts; the close stores the row treatment. */
  reason?: string | null;
  /** The close approval reference; close entries inherit it. */
  approvalReference?: string | null;
  /** Carry-of-carry: the receipt entry this amount was carried from (one hop). */
  sourceEntryId?: string | null;
  actorUserId?: string | null;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requirePositiveAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new CarryLedgerError('A carry-over receipt must be a positive whole Rupiah amount.');
  }
  return amount;
}

/**
 * Identities a receipt's source fields are checked against. Opening and manual
 * receipts have no source; a close receipt always names one.
 */
function resolveSource(
  origin: CarryOverOrigin,
  input: AppendCarryEntryInput,
): { sourceAnnualPlanId: string | null; sourceEntityId: string | null } {
  const sourceAnnualPlanId = trimmedOrNull(input.sourceAnnualPlanId);
  const sourceEntityId = trimmedOrNull(input.sourceEntityId);
  if (origin === 'close') {
    if (!sourceAnnualPlanId || !sourceEntityId) {
      throw new CarryLedgerError(
        'A close carry-over receipt must name the source annual plan and entity it came from.',
      );
    }
  } else if (sourceAnnualPlanId || sourceEntityId) {
    throw new CarryLedgerError(
      'An opening or manual receipt has no source year or entity: it enters the ledger directly.',
    );
  }
  return { sourceAnnualPlanId, sourceEntityId };
}

/**
 * Carry-of-carry lineage is one hop per entry; the chain is reconstructable by
 * following `source_entry_id`. The database cannot check it, so the service
 * does: the referenced receipt must exist, must be the receipt that put the
 * amount into this source entity, and its own ancestry must not loop.
 */
async function assertLineage(
  tx: CarryLedgerExecutor,
  input: AppendCarryEntryInput,
  source: { sourceAnnualPlanId: string | null; sourceEntityId: string | null },
): Promise<void> {
  const sourceEntryId = trimmedOrNull(input.sourceEntryId);
  if (sourceEntryId === null) return;

  const seen = new Set<string>();
  let cursor: string | null = sourceEntryId;
  let receipt: CarryOverEntry | undefined;

  while (cursor !== null) {
    if (seen.has(cursor)) {
      throw new CarryLedgerError('The carry-of-carry lineage is cyclic and cannot be extended.');
    }
    seen.add(cursor);

    const rows: CarryOverEntry[] = await tx
      .select()
      .from(carryOverEntries)
      .where(eq(carryOverEntries.id, cursor))
      .limit(1);
    const entry = rows[0];
    if (!entry) {
      throw new CarryLedgerError('The carry-of-carry receipt being referenced was not found.');
    }
    receipt ??= entry;
    cursor = entry.sourceEntryId ?? null;
  }

  if (!receipt) return;
  const matches =
    receipt.targetAnnualPlanId === source.sourceAnnualPlanId &&
    receipt.targetEntityId === source.sourceEntityId &&
    receipt.entityType === input.entityType &&
    receipt.component === input.component;
  if (!matches) {
    throw new CarryLedgerError(
      'The carry-of-carry lineage does not match: the referenced receipt did not fund this entity and component in the source year.',
    );
  }
}

/**
 * Append one receipt to the ledger. It never rewrites an existing entry, and it
 * does not touch the cache — callers either follow with `recomputeCarryCache`
 * or use `receiveCarry`, which does both.
 */
export async function appendCarryEntry(
  tx: CarryLedgerExecutor,
  input: AppendCarryEntryInput,
): Promise<CarryOverEntry> {
  const amount = requirePositiveAmount(input.amount);
  const reason = trimmedOrNull(input.reason);
  if (input.origin === 'close') {
    if (!reason) {
      throw new CarryLedgerError('A close carry-over receipt needs the treatment reason.');
    }
  } else if (!reason) {
    throw new CarryLedgerError(
      'An opening or manual carry-in receipt needs a reason: it is an audited decision, not a silent edit.',
    );
  }
  const source = resolveSource(input.origin, input);
  const approvalReference = trimmedOrNull(input.approvalReference);
  if (input.origin === 'close' && !approvalReference) {
    throw new CarryLedgerError('A close carry-over receipt inherits the close approval reference.');
  }
  if (input.origin !== 'close' && approvalReference) {
    throw new CarryLedgerError('Only a close receipt inherits an approval reference.');
  }

  await assertLineage(tx, input, source);

  const [created] = await tx
    .insert(carryOverEntries)
    .values({
      origin: input.origin,
      sourceAnnualPlanId: source.sourceAnnualPlanId,
      sourceEntityId: source.sourceEntityId,
      targetAnnualPlanId: input.targetAnnualPlanId,
      entityType: input.entityType,
      targetEntityId: input.targetEntityId,
      component: input.component,
      amount,
      reason,
      approvalReference,
      sourceEntryId: trimmedOrNull(input.sourceEntryId),
      createdBy: input.actorUserId ?? null,
    })
    .returning();
  if (!created) throw new CarryLedgerError('failed to append the carry-over entry');
  return created;
}

/** The ledger sum for one target entity, per component. */
export async function ledgerSumByComponent(
  tx: CarryLedgerExecutor,
  target: CarryLedgerTarget,
): Promise<ComponentAmounts> {
  const rows = await tx
    .select({
      component: carryOverEntries.component,
      total: sql<string>`coalesce(sum(${carryOverEntries.amount}), 0)::text`,
    })
    .from(carryOverEntries)
    .where(
      and(
        eq(carryOverEntries.entityType, target.entityType),
        eq(carryOverEntries.targetEntityId, target.entityId),
      ),
    )
    .groupBy(carryOverEntries.component);

  const totals: ComponentAmounts = { capex: 0, opex: 0 };
  for (const row of rows) {
    totals[row.component] = Number(row.total ?? '0');
  }
  return totals;
}

/**
 * Write the guarded `carry_in_*` cache from the ledger sum — the only code path
 * allowed to touch those columns. Recomputing (never incrementing) is what makes
 * the cache safe: re-running it is idempotent and a missed write is repaired by
 * the next one.
 */
export async function recomputeCarryCache(
  tx: CarryLedgerExecutor,
  input: CarryLedgerTarget & { actorUserId?: string | null },
): Promise<ComponentAmounts> {
  const totals = await ledgerSumByComponent(tx, input);
  const stamp = {
    updatedAt: new Date(),
    ...(input.actorUserId === null || input.actorUserId === undefined
      ? {}
      : { updatedBy: input.actorUserId }),
  };

  const updated =
    input.entityType === 'program'
      ? await tx
          .update(annualPrograms)
          .set({ carryInCapex: totals.capex, carryInOpex: totals.opex, ...stamp })
          .where(eq(annualPrograms.id, input.entityId))
          .returning({ id: annualPrograms.id })
      : await tx
          .update(projectYearAllocations)
          .set({ carryInCapex: totals.capex, carryInOpex: totals.opex, ...stamp })
          .where(eq(projectYearAllocations.id, input.entityId))
          .returning({ id: projectYearAllocations.id });

  if (updated.length === 0) {
    throw new CarryLedgerError(
      `The carry-over cache target (${input.entityType}) was not found.`,
    );
  }
  return totals;
}

export interface ReceiveCarryResult {
  entry: CarryOverEntry;
  cache: ComponentAmounts;
}

/** Append a receipt and recompute its target's cache in one step. */
export async function receiveCarry(
  tx: CarryLedgerExecutor,
  input: AppendCarryEntryInput,
): Promise<ReceiveCarryResult> {
  const entry = await appendCarryEntry(tx, input);
  const cache = await recomputeCarryCache(tx, {
    entityType: input.entityType,
    entityId: input.targetEntityId,
    actorUserId: input.actorUserId,
  });
  return { entry, cache };
}

/**
 * The guard behind the cache: the columns must equal the ledger sum. The close
 * runs it in its transaction, and a test proves the invariant on a fresh
 * database; any drift is a bug in a writer, never something to paper over.
 */
export async function assertCarryCacheMatches(
  tx: CarryLedgerExecutor,
  target: CarryLedgerTarget,
): Promise<void> {
  const ledger = await ledgerSumByComponent(tx, target);
  const rows =
    target.entityType === 'program'
      ? await tx
          .select({ carryInCapex: annualPrograms.carryInCapex, carryInOpex: annualPrograms.carryInOpex })
          .from(annualPrograms)
          .where(eq(annualPrograms.id, target.entityId))
          .limit(1)
      : await tx
          .select({
            carryInCapex: projectYearAllocations.carryInCapex,
            carryInOpex: projectYearAllocations.carryInOpex,
          })
          .from(projectYearAllocations)
          .where(eq(projectYearAllocations.id, target.entityId))
          .limit(1);
  const cached = rows[0];
  if (!cached) {
    throw new CarryLedgerError(`The carry-over cache target (${target.entityType}) was not found.`);
  }
  if (cached.carryInCapex !== ledger.capex) {
    throw new CarryLedgerError(
      `The capex carry-in cache (${cached.carryInCapex}) does not equal the ledger sum (${ledger.capex}).`,
    );
  }
  if (cached.carryInOpex !== ledger.opex) {
    throw new CarryLedgerError(
      `The opex carry-in cache (${cached.carryInOpex}) does not equal the ledger sum (${ledger.opex}).`,
    );
  }
}
