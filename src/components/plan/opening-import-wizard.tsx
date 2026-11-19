'use client';

import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/components/ui';
import type { OpeningDataSetId } from '@/lib/opening-import/field-list';
import { openingImportAction } from '@/server/plan/opening-import-actions';
import type { OpeningImportState } from '@/server/plan/opening-import-types';

const DATA_SETS: Array<{ value: OpeningDataSetId; label: string; description: string }> = [
  {
    value: 'strategic-initiatives',
    label: 'Strategic initiatives',
    description: 'Code, name, owner, objective, envelope and prior program budget consumed.',
  },
  {
    value: 'annual-programs',
    label: 'Annual programs',
    description: 'Program, SI code, continuation link, capex/opex budgets and carry-in.',
  },
  {
    value: 'projects',
    label: 'Projects',
    description: 'Project, originating program, years, prices, opening figures and ijin prinsip.',
  },
];

/**
 * The opening-import wizard (W3b): template download, upload/validate, then load.
 * Validation returns row-level errors and writes nothing; the load re-validates
 * and writes in one transaction. Kept as the only client state on the page.
 */
export function OpeningImportWizard({ closingFiscalYear }: { closingFiscalYear: number }) {
  const [state, formAction, pending] = useActionState(openingImportAction, {
    status: 'idle',
  } as OpeningImportState);
  const [dataSet, setDataSet] = useState<OpeningDataSetId>('strategic-initiatives');
  const [reference, setReference] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const selected = DATA_SETS.find((option) => option.value === dataSet) ?? DATA_SETS[0];
  const stateDataSetLabel =
    state.status === 'valid' || state.status === 'invalid'
      ? (DATA_SETS.find((option) => option.value === state.dataSet)?.label ?? state.dataSet)
      : null;
  const stateMismatch =
    (state.status === 'valid' || state.status === 'invalid') && state.dataSet !== dataSet;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget);
    formData.set('dataSet', dataSet);
    formData.set('reference', reference);
    if (selectedFile) formData.set('file', selectedFile);
    if (submitter?.name) formData.set(submitter.name, submitter.value);
    startTransition(() => formAction(formData));
  };

  return (
    <form action={formAction} onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Data set
          <select
            name="dataSet"
            value={dataSet}
            onChange={(event) => setDataSet(event.target.value as OpeningDataSetId)}
            required
            className={inputClass}
          >
            {DATA_SETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">{selected?.description}</span>
        </label>
        <label className={labelClass}>
          Approval reference
          <input
            name="reference"
            maxLength={160}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Board approval / cross-check reference"
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Every imported record stores{' '}
            <code className="font-mono">Opening balance — FY{closingFiscalYear} close / &lt;reference&gt;</code>{' '}
            as its audit reason.
          </span>
        </label>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-800">1. Template</p>
        <p className="mt-1 text-sm text-slate-600">
          Download the current template: headers, type rules, example row and the load reason convention.
          Custom fields defined under Administration are included as columns.
        </p>
        <p className="mt-2 flex gap-4 text-sm font-medium">
          <a
            href={`/plan/opening-balances/import/template?dataSet=${dataSet}&format=csv`}
            className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
          >
            CSV template
          </a>
          <a
            href={`/plan/opening-balances/import/template?dataSet=${dataSet}&format=xlsx`}
            className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
          >
            XLSX template
          </a>
        </p>

        <p className="mt-4 text-sm font-medium text-slate-800">2. Upload and validate</p>
        <label className={`${labelClass} mt-2 block`}>
          CSV or XLSX file
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx"
            onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          />
          {selectedFile ? (
            <span className="mt-1 block text-xs text-slate-500">
              Selected: <span className="font-mono">{selectedFile.name}</span> — retained for the load
              step.
            </span>
          ) : null}
          <span className="mt-1 block text-xs text-slate-500">
            The file is parsed first. Unknown columns and every bad row are reported by line; nothing is
            written by a validation. Custom fields defined under Administration are accepted as columns.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" name="intent" value="validate" className={secondaryButtonClass} disabled={pending}>
          Validate file
        </button>
        <button type="submit" name="intent" value="load" className={primaryButtonClass} disabled={pending}>
          Validate and load
        </button>
        {pending ? <span className="text-sm text-slate-600">Working…</span> : null}
      </div>

      <p className="text-xs text-slate-500">
        “Validate and load” re-validates the file and writes every row in one transaction, with one audit
        entry per created record. Duplicate codes and unknown references are rejected before anything is
        written.
      </p>

      {stateMismatch ? (
        <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The last result was for {stateDataSetLabel}; validate again for the selected data set before
          loading.
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}

      {state.status === 'invalid' ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-medium">
            {stateDataSetLabel}: {state.errors.length} problem(s); nothing was written.
          </p>
          <ul className="mt-2 space-y-1">
            {state.errors.slice(0, 100).map((error) => (
              <li key={`${error.line}-${error.column}-${error.message}`}>
                <span className="font-mono text-xs">
                  line {error.line} · {error.column}
                </span>{' '}
                — {error.message}
              </li>
            ))}
          </ul>
          {state.errors.length > 100 ? (
            <p className="mt-2 text-xs">…and {state.errors.length - 100} more.</p>
          ) : null}
        </div>
      ) : null}

      {state.status === 'valid' ? (
        <div role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p className="font-medium">
            {stateDataSetLabel}: {state.rowCount} row(s) validated, nothing written yet.
          </p>
          <p className="mt-1 text-xs">
            Click “Validate and load” to write them in one transaction. Reference:{' '}
            <span className="font-mono">{state.reference}</span>
          </p>
          {state.preview.length > 0 ? (
            <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              {state.preview.map((line) => (
                <li key={line} className="font-mono">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {state.rowCount > state.preview.length ? (
            <p className="mt-1 text-xs">…and {state.rowCount - state.preview.length} more.</p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
