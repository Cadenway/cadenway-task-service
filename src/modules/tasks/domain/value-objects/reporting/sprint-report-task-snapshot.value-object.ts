import type { StatusKey } from '../task/status-key.value-object.js';
import type { TaskKey } from '../task/task-key.value-object.js';

/** A historical task already scoped to the sprint and still readable by the caller. */
export interface SprintReportTaskSnapshot {
  // #region Properties
  /** The task key and reporting fields at the evaluation instant. */
  readonly key: TaskKey;
  readonly name: string;
  readonly status: StatusKey;
  readonly parentKey: TaskKey | null;
  readonly milestone: boolean;
  readonly archived: boolean;
  readonly trashed: boolean;
  readonly estimateMinutes: number | null;
  readonly customPoints: number | null;
  // #endregion
}
