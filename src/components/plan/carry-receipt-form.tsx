import {
  Form,
  HiddenField,
  MoneyField,
  ReasonField,
  SelectField,
  SubmitButton,
} from '@/components/form';
import type { CarryTargetOptions } from '@/server/plan/carry-queries';
import { receiveManualCarryAction } from '@/server/plan/annual-actions';

/**
 * The reasoned manual carry-in receipt (ADR-0006 §2, #113): a management grant
 * written to the carry-over ledger. It is the only way to add carry-in by hand —
 * the `carry_in_*` columns are a cache the ledger service recomputes. T3 polishes
 * the surfaces; this form is the minimal reasoned path.
 */
export function CarryReceiptForm({
  annualPlanId,
  options,
}: {
  annualPlanId: string;
  options: CarryTargetOptions;
}) {
  const entityOptions = [
    ...options.programs.map((program) => ({
      value: program.id,
      // The card title is "code · name"; use a different separator here so a
      // text/section locator for the program card cannot also match this option.
      label: `Program: ${program.label.split(' · ').join(' — ')}`,
    })),
    ...options.allocations.map((allocation) => ({
      value: allocation.id,
      label: `Allocation: ${allocation.label.split(' · ').join(' — ')}`,
    })),
  ];

  if (entityOptions.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Add a program or a project year allocation before recording a carry-in receipt.
      </p>
    );
  }

  return (
    <Form action={receiveManualCarryAction} className="grid gap-4 sm:grid-cols-2">
      <HiddenField name="annualPlanId" value={annualPlanId} />
      <SelectField
        label="Entity type"
        name="entityType"
        required
        placeholder="Select the entity kind"
        options={[
          { value: 'program', label: 'Annual program' },
          { value: 'allocation', label: 'Project year allocation' },
        ]}
        hint="Both are funded by the same ledger; the type must match the entity below."
      />
      <SelectField
        label="Entity"
        name="entityId"
        required
        placeholder="Select the program or allocation"
        options={entityOptions}
      />
      <SelectField
        label="Component"
        name="component"
        required
        placeholder="Select the component"
        options={[
          { value: 'capex', label: 'Capex' },
          { value: 'opex', label: 'Opex' },
        ]}
        hint="Capex and opex never shift into each other."
      />
      <MoneyField
        label="Carry-in amount"
        name="amount"
        required
        hint="The receipt adds to the entity's carry-in; the cache is recomputed, never incremented."
      />
      <div className="sm:col-span-2">
        <ReasonField hint="Required: why this carry-in is granted (the ledger keeps it)." />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>Record carry-in receipt</SubmitButton>
      </div>
    </Form>
  );
}
