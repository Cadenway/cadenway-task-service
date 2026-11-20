import type { Workload } from '../../../../../domain/policies/reporting/workload.policy.js';
import type { ReportingPosition } from '../../../../models/reporting/reporting-position.model.js';

/** Full-window totals and a page of allocations. */
export interface GetListWorkloadOutput extends Omit<Workload, 'items'> {
  // #region Properties
  /** Report data and dependencies. */
  readonly listId: string;
  readonly weekStart: string;
  readonly items: Workload['items'];
  readonly next: ReportingPosition | null;
  // #endregion
}
