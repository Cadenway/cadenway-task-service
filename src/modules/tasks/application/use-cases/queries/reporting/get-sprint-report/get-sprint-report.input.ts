import type { SprintReportPosition } from '../../../../models/reporting/sprint-report-position.model.js';

/** Validated sprint-report request and authenticated, report-bound cursor from the HTTP boundary. */
export interface GetSprintReportInput {
  // #region Properties
  /** Verified tenant and actor, sprint and requested calendar. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly listId: string;
  readonly today: string;
  readonly timeZone: string;

  /** Stable server instant for a first page; a later page uses the cursor's instant. */
  readonly serverObservedAt: Date;
  readonly after: SprintReportPosition | null;
  readonly limit: number;
  // #endregion
}
