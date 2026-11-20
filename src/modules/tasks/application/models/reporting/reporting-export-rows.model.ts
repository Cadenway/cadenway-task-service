import type { PriorityKey } from '../../../domain/value-objects/task/priority-key.value-object.js';
import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';

/** Data for an export in the order requested by the caller, with fields in definition order. */
export interface ReportingExportRows {
  // #region Properties
  /** Whether the selected custom field is unavailable in this space. */
  readonly invalidSort: boolean;

  readonly fields: readonly { readonly id: string; readonly name: string }[];
  readonly rows: readonly {
    readonly taskKey: string;
    readonly name: string;
    readonly status: StatusKey;
    readonly priority: PriorityKey;
    readonly assignees: readonly string[];
    readonly dueDate: string | null;
    readonly labels: readonly string[];
    readonly customValues: Readonly<Record<string, string | number | null>>;
  }[];
  // #endregion
}
