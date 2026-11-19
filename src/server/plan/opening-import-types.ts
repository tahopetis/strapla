import type { OpeningDataSetId } from '@/lib/opening-import/field-list';
import type { ParseError } from '@/lib/opening-import/parse';

/** State returned by the opening-import server action to the wizard form. */
export type OpeningImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'invalid';
      dataSet: OpeningDataSetId;
      reference: string;
      errors: ParseError[];
    }
  | {
      status: 'valid';
      dataSet: OpeningDataSetId;
      reference: string;
      rowCount: number;
      preview: string[];
    };
