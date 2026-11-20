import type { SprintReportHistory } from '../../../../models/reporting/sprint-report-history.model.js';
import type { SprintReportRead } from '../../../../models/reporting/sprint-report-read.model.js';

/** Reconstructs a sprint report from durable facts inside the caller's tenant snapshot. */
export interface SprintReportReader {
  // #region Methods
  /**
   * Restrict every history observation to existing tasks in currently visible lists, including
   * the opening, trend and velocity. A physically purged task contributes nowhere. Resolve
   * local-day boundaries in the supplied IANA zone and use the exact instant at each cutoff.
   *
   * Return dates in ascending order, starting after the cursor and including uncovered days with
   * null actuals. Trend observations are independent of the page. Return `next` as the last
   * returned date only when more dates remain. An unknown baseline or coverage gap stays null.
   * Prior sprints are readable completed sprints of the same space; the domain orders them.
   */
  read(organizationId: string, request: SprintReportRead): Promise<SprintReportHistory>;
  // #endregion
}
