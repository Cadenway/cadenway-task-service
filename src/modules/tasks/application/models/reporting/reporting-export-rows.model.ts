import type { ReportingExportRow } from './reporting-export-row.model.js';

/** The largest number of task rows accepted by the list export contract. */
export const MAX_LIST_EXPORT_ROWS = 10_000;

/** An authorized selection for this tenant snapshot, with its rows loaded one bounded page at a time. */
export type ReportingExportRows =
  | { readonly invalidSort: true }
  | {
      readonly invalidSort: false;
      readonly fields: readonly { readonly id: string; readonly name: string }[];
      readonly rowCount: number;
      readonly readPage: (offset: number) => Promise<readonly ReportingExportRow[]>;
    };
