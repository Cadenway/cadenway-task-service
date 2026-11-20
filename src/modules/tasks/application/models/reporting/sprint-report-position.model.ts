/** The last returned calendar day and the stable server observation for the next page. */
export interface SprintReportPosition {
  // #region Properties
  /** The last emitted date and the original server observation. */
  readonly date: string;
  readonly serverObservedAt: Date;
  readonly snapshot: SprintReportSnapshot;
  readonly schedule: {
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
  };
  // #endregion
}
import type { SprintReportSnapshot } from './sprint-report-snapshot.model.js';
