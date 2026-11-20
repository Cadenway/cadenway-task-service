import { compareReportingTaskKeys } from '../../../domain/value-objects/reporting/reporting-task-order.value-object.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { ReportingPosition } from '../../models/reporting/reporting-position.model.js';

/** Orders and pages report rows by account, then task key, with the unassigned bucket last. */
export class ReportingPage {
  // #region Methods
  /** Executes the report operation. */
  public slice<T>(
    items: readonly T[],
    position: (item: T) => ReportingPosition,
    after: ReportingPosition | null,
    limit: number,
  ): { readonly items: readonly T[]; readonly next: ReportingPosition | null } {
    const compare = (left: ReportingPosition, right: ReportingPosition): number => {
      if (left.userId !== right.userId) {
        if (left.userId === null) return 1;
        if (right.userId === null) return -1;
        return left.userId < right.userId ? -1 : 1;
      }
      return compareReportingTaskKeys(TaskKey.parse(left.taskKey), TaskKey.parse(right.taskKey));
    };
    const sorted = [...items].sort((left, right) => compare(position(left), position(right)));
    const rows = (
      after === null ? sorted : sorted.filter((item) => compare(position(item), after) > 0)
    ).slice(0, limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return { items: page, next: rows.length > limit && last !== undefined ? position(last) : null };
  }
  // #endregion
}
