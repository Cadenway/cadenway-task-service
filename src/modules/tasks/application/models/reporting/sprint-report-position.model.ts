/** The last returned calendar day and the stable server observation for the next page. */
export interface SprintReportPosition {
  // #region Properties
  /** The last emitted date and the original server observation. */
  readonly date: string;
  readonly serverObservedAt: Date;
  readonly snapshot: SprintReportSnapshot;
  // #endregion
}
import type { SprintReportSnapshot } from './sprint-report-snapshot.model.js';
