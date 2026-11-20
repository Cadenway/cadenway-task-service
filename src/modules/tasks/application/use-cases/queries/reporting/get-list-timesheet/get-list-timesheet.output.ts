import type { Timesheet } from '../../../../../domain/policies/reporting/timesheet.policy.js';
import type { ReportingPosition } from '../../../../models/reporting/reporting-position.model.js';

/** Full-week totals and a page of recorded work. */
export interface GetListTimesheetOutput extends Omit<Timesheet, 'items'> {
  // #region Properties
  /** Report data and dependencies. */
  readonly listId: string;
  readonly weekStart: string;
  readonly items: Timesheet['items'];
  readonly next: ReportingPosition | null;
  // #endregion
}
