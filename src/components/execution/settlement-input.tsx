'use client';

import { useId } from 'react';
import { useFieldError, useFormEcho } from '@/components/form';

/**
 * A settlement amount (`settle_<commitmentId>`) is an optional raw input beside
 * the spend form rather than a registry field, so it reads the surrounding
 * `<Form>` state directly: a refused save keeps the amount that was typed and
 * a message raised for that row renders under its input with aria wiring.
 */
export function SettlementInput({ name, label }: { name: string; label: string }) {
  const echo = useFormEcho(name);
  const error = useFieldError(name);
  const instanceId = useId();
  const errorId = `${instanceId}-error`;

  return (
    <label className="block text-xs text-slate-600">
      {label}
      <input
        name={name}
        inputMode="numeric"
        placeholder="0"
        defaultValue={echo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
      />
      {error ? (
        <span id={errorId} className="mt-1 block text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}
