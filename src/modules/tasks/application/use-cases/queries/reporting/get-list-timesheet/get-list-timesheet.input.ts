import type { ReportingPosition } from '../../../../models/reporting/reporting-position.model.js';

/** A validated timesheet week and caller-bound cursor. */
export interface GetListTimesheetInput {
  // #region Properties
  /** Report data and dependencies. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly listId: string;
  readonly weekStart: string;
  readonly after: ReportingPosition | null;
  readonly limit: number;
  // #endregion
}
