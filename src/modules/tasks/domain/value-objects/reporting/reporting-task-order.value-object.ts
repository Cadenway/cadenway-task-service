import type { TaskKey } from '../task/task-key.value-object.js';

/** Orders P3c reporting keys by stored prefix and numeric task number. */
export function compareReportingTaskKeys(left: TaskKey, right: TaskKey): number {
  if (left.prefix === right.prefix) {
    return left.number - right.number;
  }
  return left.prefix < right.prefix ? -1 : 1;
}
