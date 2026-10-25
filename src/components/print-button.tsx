'use client';

import { secondaryButtonClass } from './ui';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={secondaryButtonClass}
      title="Print this report or save it as PDF"
    >
      Print / PDF
    </button>
  );
}
