import {
  reportingWeekday,
  reportingWindow,
  shiftReportingDate,
} from '../../value-objects/reporting/reporting-calendar.value-object.js';
import { CalendarDate } from '../../value-objects/task/calendar-date.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';

type WorkloadTask = Pick<
  TaskState,
  'key' | 'name' | 'status' | 'startDate' | 'dueDate' | 'estimateMinutes' | 'assigneeIds'
>;

/** The full workload before pagination, with account IDs for display lookup by the caller. */
export interface Workload {
  // #region Properties
  /** All fourteen dates, retaining zeroes and the per-person daily capacity. */
  readonly days: readonly {
    readonly date: string;
    readonly totalMinutes: number;
    readonly dailyCapacityMinutes: 0 | 360;
  }[];

  /** Sum of assigned and unassigned minutes within the reporting window. */
  readonly totalMinutes: number;

  /** Allocations in source task order, with assignees ordered by ID within each task. */
  readonly items: readonly {
    readonly assigneeId: string | null;
    readonly taskKey: string;
    readonly name: string;
    readonly status: StatusKey;
    readonly minutesByDay: readonly number[];
    readonly totalMinutes: number;
  }[];
  // #endregion
}

/** Counts the weekdays in a half-open span without scanning the full task interval. */
function countWeekdays(start: CalendarDate, length: number): number {
  const weekday = reportingWeekday(start);
  let count = Math.floor(length / 7) * 5;
  for (let offset = 0; offset < length % 7; offset += 1) {
    if ((weekday + offset) % 7 < 5) {
      count += 1;
    }
  }
  return count;
}

/** Splits a whole-minute total evenly and gives its remainder to the first positions. */
function allocation(total: number, count: number, position: number): number {
  return Math.floor(total / count) + Number(position < total % count);
}

/** Allocates the whole interval first and returns only the shares inside the reporting window. */
function allocateWindow(
  start: CalendarDate,
  due: CalendarDate,
  estimateMinutes: number,
  window: readonly CalendarDate[],
): readonly number[] {
  const weekdays = countWeekdays(start, start.daysUntil(due) + 1);
  if (weekdays === 0) {
    const friday = shiftReportingDate(start, 4 - reportingWeekday(start));
    return window.map((date) => (friday.daysUntil(date) === 0 ? estimateMinutes : 0));
  }
  return window.map((date) => {
    const offset = start.daysUntil(date);
    if (date.isWeekend() || offset < 0 || date.daysUntil(due) < 0) {
      return 0;
    }
    return allocation(estimateMinutes, weekdays, countWeekdays(start, offset));
  });
}

/**
 * Distributes whole minutes first by weekday and then by assignee (P3c decision 9 and
 * `ListWorkloadPage`). The caller supplies all visible live tasks matching the list filters.
 */
export function buildWorkload(weekStart: string, tasks: readonly WorkloadTask[]): Workload {
  const window = reportingWindow(weekStart, 14);
  const days = window.map((date) => ({
    date: date.format(),
    totalMinutes: 0,
    dailyCapacityMinutes: date.isWeekend() ? (0 as const) : (360 as const),
  }));
  const items: Workload['items'][number][] = [];
  for (const { key, name, status, startDate, dueDate, estimateMinutes, assigneeIds } of tasks) {
    if (
      status === 'cancelled' ||
      dueDate === null ||
      estimateMinutes === null ||
      estimateMinutes <= 0
    ) {
      continue;
    }
    const due = CalendarDate.parse(dueDate);
    const start = startDate === null ? due : CalendarDate.parse(startDate);
    const minutesByDay = allocateWindow(start, due, estimateMinutes, window);
    if (minutesByDay.every((minutes) => minutes === 0)) {
      continue;
    }
    for (const [index, day] of days.entries()) {
      day.totalMinutes += minutesByDay[index] ?? 0;
    }
    const assignees: readonly (string | null)[] =
      assigneeIds.length === 0 ? [null] : [...new Set(assigneeIds)].sort();
    for (const [index, assigneeId] of assignees.entries()) {
      const minutes = minutesByDay.map((day) => allocation(day, assignees.length, index));
      items.push({
        assigneeId,
        taskKey: key.format(),
        name,
        status,
        minutesByDay: minutes,
        totalMinutes: minutes.reduce((sum, day) => sum + day, 0),
      });
    }
  }
  return { days, totalMinutes: days.reduce((sum, day) => sum + day.totalMinutes, 0), items };
}
