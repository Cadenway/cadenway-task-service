import { reportingWindow } from '../../value-objects/reporting/reporting-calendar.value-object.js';
import { compareReportingTaskKeys } from '../../value-objects/reporting/reporting-task-order.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';
import type { TimeEntryDetails } from '../../value-objects/time/time-entry-details.value-object.js';

type TimesheetTask = Pick<TaskState, 'key' | 'name' | 'status'>;

interface TimesheetEntry extends Pick<TimeEntryDetails, 'workDate' | 'minutes'> {
  // #region Properties
  /** Task snapshot and author from the stored entry. */
  readonly task: TimesheetTask;
  readonly authorUserId: string;
  // #endregion
}

interface TimesheetAllocation {
  // #region Properties
  /** Task snapshot and the accumulated minutes within the selected week. */
  readonly task: TimesheetTask;
  readonly minutesByDay: number[];
  totalMinutes: number;
  // #endregion
}

/** The unpaginated week of recorded work, with stable author IDs for display lookup. */
export interface Timesheet {
  // #region Properties
  /** Monday through Sunday in order, with totals over all matching entries. */
  readonly days: readonly { readonly date: string; readonly totalMinutes: number }[];

  /** Sum of recorded work minutes within the week. */
  readonly totalMinutes: number;

  /** One row per author and task, ordered by author ID and then by task key. */
  readonly items: readonly {
    readonly authorUserId: string;
    readonly taskKey: string;
    readonly name: string;
    readonly status: StatusKey;
    readonly minutesByDay: readonly number[];
    readonly totalMinutes: number;
  }[];
  // #endregion
}

/**
 * Buckets stored work dates without a time-zone conversion (P3c decision 9 and
 * `ListTimesheetPage`). The caller supplies authorized entries for currently live list tasks.
 */
export function buildTimesheet(weekStart: string, entries: readonly TimesheetEntry[]): Timesheet {
  const days = reportingWindow(weekStart, 7).map((date) => ({
    date: date.format(),
    totalMinutes: 0,
  }));
  const dayIndexes = new Map(days.map(({ date }, index) => [date, index]));
  const authors = new Map<string, Map<string, TimesheetAllocation>>();
  for (const entry of entries) {
    const index = dayIndexes.get(entry.workDate);
    const day = index === undefined ? undefined : days[index];
    if (index === undefined || day === undefined) {
      continue;
    }
    let tasks = authors.get(entry.authorUserId);
    if (tasks === undefined) {
      tasks = new Map();
      authors.set(entry.authorUserId, tasks);
    }
    const key = entry.task.key.format();
    let row = tasks.get(key);
    if (row === undefined) {
      row = { task: entry.task, minutesByDay: days.map(() => 0), totalMinutes: 0 };
      tasks.set(key, row);
    }
    row.minutesByDay[index] = (row.minutesByDay[index] ?? 0) + entry.minutes;
    row.totalMinutes += entry.minutes;
    day.totalMinutes += entry.minutes;
  }
  const items: Timesheet['items'][number][] = [];
  for (const authorUserId of [...authors.keys()].sort()) {
    const tasks = [...(authors.get(authorUserId)?.values() ?? [])];
    tasks.sort((left, right) => compareReportingTaskKeys(left.task.key, right.task.key));
    for (const { task, minutesByDay, totalMinutes } of tasks) {
      items.push({
        authorUserId,
        taskKey: task.key.format(),
        name: task.name,
        status: task.status,
        minutesByDay,
        totalMinutes,
      });
    }
  }
  return { days, totalMinutes: days.reduce((sum, day) => sum + day.totalMinutes, 0), items };
}
