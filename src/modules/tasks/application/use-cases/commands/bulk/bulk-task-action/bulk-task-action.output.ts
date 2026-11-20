import type { BulkTaskResultEntry } from '../../../../models/bulk/bulk-task-result-entry.model.js';

/** The committed outcome for the entire request. */
export interface BulkTaskActionOutput {
  // #region Properties
  /** One outcome per selected key in request order. */
  readonly results: readonly BulkTaskResultEntry[];

  /** Distinct task rows changed or created by the operation. */
  readonly affectedCount: number;
  // #endregion
}
