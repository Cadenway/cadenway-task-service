import type { TaskFilterInput } from '../../../../models/query/task-filter-input.model.js';
import type { ReportingPosition } from '../../../../models/reporting/reporting-position.model.js';

/** A validated workload window and caller-bound cursor. */
export interface GetListWorkloadInput {
  // #region Properties
  /** Report data and dependencies. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly listId: string;
  readonly weekStart: string;
  readonly filter: TaskFilterInput;
  readonly after: ReportingPosition | null;
  readonly limit: number;
  // #endregion
}
