import type { PriorityKey } from '../../../domain/value-objects/task/priority-key.value-object.js';
import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';

/** The fields needed to encode one selected task. */
export interface ReportingExportRow {
  // #region Properties
  /** Task data in its current list, including assignees in assignment order. */
  readonly taskKey: string;
  readonly name: string;
  readonly status: StatusKey;
  readonly priority: PriorityKey;
  readonly assignees: readonly string[];
  readonly dueDate: string | null;
  readonly labels: readonly string[];
  readonly customValues: Readonly<Record<string, string | number | null>>;
  // #endregion
}
