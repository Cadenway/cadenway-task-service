import type { TaskFilterInput } from '../../../../models/query/task-filter-input.model.js';
import type { TaskOrder } from '../../../../models/query/task-order.model.js';

/** Validated export scope, filters and ordering. */
export interface ExportListTasksInput {
  // #region Properties
  /** The verified tenant, actor, list and requested selection. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly listId: string;
  readonly filter: TaskFilterInput;
  readonly order: TaskOrder;
  readonly sheetSort: { readonly column: string; readonly direction: 'asc' | 'desc' } | null;
  // #endregion
}
