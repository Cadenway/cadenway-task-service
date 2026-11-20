import type { SprintReportInput } from '../../../domain/value-objects/reporting/sprint-report-input.value-object.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { SprintReportSnapshot } from './sprint-report-snapshot.model.js';

/** The requested sprint, authorization scope and calendar page for one history read. */
export interface SprintReportRead {
  // #region Properties
  /** The already authorized sprint and its caller-visible scope. */
  readonly sprint: SprintReportInput['sprint'];
  readonly visibleListIds: readonly string[];
  readonly viewer: Viewer;
  readonly today: string;
  readonly timeZone: string;
  readonly serverObservedAt: Date;

  /** A previously authenticated snapshot, or null when starting the report. */
  readonly snapshot: SprintReportSnapshot | null;

  readonly after: string | null;
  readonly limit: number;
  // #endregion
}
