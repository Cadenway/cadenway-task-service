import type { StatusHistoryEntry } from '../../../../../domain/value-objects/activity/status-history-entry.value-object.js';
import type { ActivityPosition } from '../../../../models/activity/activity-position.model.js';
import type { TaskTimeEntry } from '../../../../models/time/task-time-entry.model.js';
import type { TimeEntryPosition } from '../../../../models/time/time-entry-position.model.js';

/** Work logs and durable status observations, scoped to the tenant and task. */
export interface TaskTimeRepository {
  // #region Methods
  /** Current database wall-clock instant for one status observation. */
  observationTime(): Promise<Date>;
  create(
    organizationId: string,
    taskId: string,
    authorUserId: string,
    minutes: number,
    workDate: string,
    note: string | null,
  ): Promise<TaskTimeEntry>;
  find(organizationId: string, taskId: string, entryId: string): Promise<TaskTimeEntry | null>;
  remove(
    organizationId: string,
    taskId: string,
    entryId: string,
    authorUserId: string,
  ): Promise<boolean>;
  page(
    organizationId: string,
    taskId: string,
    after: TimeEntryPosition | null,
    limit: number,
  ): Promise<readonly TaskTimeEntry[]>;
  totals(
    organizationId: string,
    taskId: string,
  ): Promise<{ readonly total: number; readonly totalMinutes: number }>;
  statusHistoryPage(
    organizationId: string,
    taskId: string,
    after: ActivityPosition | null,
    limit: number,
  ): Promise<readonly StatusHistoryEntry[]>;
  // #endregion
}
