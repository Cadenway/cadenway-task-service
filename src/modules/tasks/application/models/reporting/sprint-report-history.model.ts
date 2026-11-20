import type { SprintReportInput } from '../../../domain/value-objects/reporting/sprint-report-input.value-object.js';
import type { SprintReportSnapshot } from './sprint-report-snapshot.model.js';

/** One calendar page and the complete scope needed to project it. */
export interface SprintReportHistory {
  // #region Properties
  /** Projection inputs and the next calendar position. */
  readonly input: SprintReportInput;
  readonly next: string | null;
  readonly snapshot: SprintReportSnapshot;
  // #endregion
}
