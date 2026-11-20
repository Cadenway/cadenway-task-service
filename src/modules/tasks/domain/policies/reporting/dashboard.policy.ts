import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import {
  reportingWeekday,
  shiftReportingDate,
} from '../../value-objects/reporting/reporting-calendar.value-object.js';
import { compareReportingTaskKeys } from '../../value-objects/reporting/reporting-task-order.value-object.js';
import { CalendarDate } from '../../value-objects/task/calendar-date.value-object.js';
import { isClosedStatus } from '../../value-objects/task/status-category.value-object.js';
import { STATUS_KEYS, type StatusKey } from '../../value-objects/task/status-key.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';
import { isLate } from '../task/lateness.policy.js';

type DashboardTask = Pick<TaskState, 'id' | 'key' | 'status' | 'dueDate' | 'assigneeIds'>;

interface DashboardTransition {
  // #region Properties
  /** Task and destination from the persisted status transition. */
  readonly taskId: string;
  readonly to: StatusKey;

  /** Server instant at which the transition was recorded. */
  readonly occurredAt: Date;
  // #endregion
}

interface DashboardObservation {
  // #region Properties
  /** Caller-supplied local date, zone and width of the completion window. */
  readonly today: string;
  readonly timeZone: string;
  readonly weeks: 8 | 12;

  /** Server cut-off for completion facts. */
  readonly observedAt: Date;
  // #endregion
}

/** Current task counts and weekly completions for the same visible task population. */
export interface TeamDashboard<TTask> extends DashboardObservation {
  // #region Properties
  /** Open, overdue and blocked task counts from the current status and due date. */
  readonly openCount: number;
  readonly lateCount: number;
  readonly blockedCount: number;

  /** Sum of the distinct task completion counts for the selected weeks. */
  readonly completedCount: number;

  /** Represented statuses in canonical workflow order. */
  readonly byStatus: readonly { readonly status: StatusKey; readonly count: number }[];

  /** First ten overdue tasks, carrying the caller's original task projection. */
  readonly overdueTasks: readonly TTask[];

  /** P3c dashboard reference for the number of open tasks per assignee. */
  readonly assigneeThreshold: 6;

  /** Open task counts for every assignee of a visible task. */
  readonly assignees: readonly { readonly userId: string; readonly openCount: number }[];

  /** Monday-start weeks in chronological order, including weeks with no completions. */
  readonly completions: readonly {
    readonly startsOn: string;
    readonly completedCount: number;
  }[];
  // #endregion
}

/** Validates the requested IANA zone and builds its Gregorian calendar formatter. */
function dashboardCalendar(timeZone: string): Intl.DateTimeFormat {
  if (timeZone.startsWith('+') || timeZone.startsWith('-')) {
    throw new InvalidTaskError('the dashboard time zone is an IANA identifier');
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      era: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (error) {
    if (error instanceof RangeError) {
      throw new InvalidTaskError('the dashboard time zone is an IANA identifier');
    }
    throw error;
  }
}

/** Reads the local civil date and discards years outside the task calendar. */
function localDate(calendar: Intl.DateTimeFormat, instant: number): string | null {
  const { era, year, month, day } = Object.fromEntries(
    calendar.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  if (
    era !== 'AD' ||
    year === undefined ||
    year.length > 4 ||
    month === undefined ||
    day === undefined
  ) {
    return null;
  }
  return `${year.padStart(4, '0')}-${month}-${day}`;
}

/** Returns the visible week counts bounded by the caller's day and the server instant. */
function countCompletions(
  observation: DashboardObservation,
  visibleTaskIds: ReadonlySet<string>,
  transitions: readonly DashboardTransition[],
): TeamDashboard<DashboardTask>['completions'] {
  const { today, timeZone, weeks, observedAt } = observation;
  const day = CalendarDate.parse(today);
  const observedMilliseconds = observedAt.getTime();
  if (!Number.isFinite(observedMilliseconds)) {
    throw new InvalidTaskError('a dashboard observes a valid server instant');
  }

  const calendar = dashboardCalendar(timeZone);
  const monday = shiftReportingDate(day, -reportingWeekday(day));
  const start = shiftReportingDate(monday, (1 - weeks) * 7);
  const firstDate = start.format();
  const buckets = Array.from({ length: weeks }, () => new Set<string>());
  for (const { taskId, to, occurredAt } of transitions) {
    const milliseconds = occurredAt.getTime();
    if (
      to !== 'done' ||
      !visibleTaskIds.has(taskId) ||
      !Number.isFinite(milliseconds) ||
      milliseconds > observedMilliseconds
    ) {
      continue;
    }
    const local = localDate(calendar, milliseconds);
    if (local !== null && local >= firstDate && local <= today) {
      const index = Math.floor(start.daysUntil(CalendarDate.parse(local)) / 7);
      buckets[index]?.add(taskId);
    }
  }
  return buckets.map((bucket, index) => ({
    startsOn: shiftReportingDate(start, index * 7).format(),
    completedCount: bucket.size,
  }));
}

/**
 * Builds `TeamDashboard` (P3c decision 7) over tasks already filtered for visibility and active
 * lifecycle. The same eligible task IDs restrict completion facts, including for moved tasks.
 */
export function buildTeamDashboard<TTask extends DashboardTask>(
  observation: DashboardObservation,
  tasks: readonly TTask[],
  transitions: readonly DashboardTransition[],
): TeamDashboard<TTask> {
  const completions = countCompletions(
    observation,
    new Set(tasks.map(({ id }) => id)),
    transitions,
  );
  const statusCounts = new Map<StatusKey, number>();
  const assigneeCounts = new Map<string, number>();
  const overdue: { task: TTask; dueDate: string }[] = [];
  let openCount = 0;
  let lateCount = 0;
  for (const task of tasks) {
    const open = Number(!isClosedStatus(task.status));
    openCount += open;
    statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
    for (const assigneeId of new Set(task.assigneeIds)) {
      assigneeCounts.set(assigneeId, (assigneeCounts.get(assigneeId) ?? 0) + open);
    }
    if (task.dueDate !== null && isLate(task.status, task.dueDate, observation.today)) {
      lateCount += 1;
      overdue.push({ task, dueDate: task.dueDate });
      overdue.sort((left, right) => {
        if (left.dueDate === right.dueDate) {
          return compareReportingTaskKeys(left.task.key, right.task.key);
        }
        return left.dueDate < right.dueDate ? -1 : 1;
      });
      if (overdue.length > 10) {
        overdue.pop();
      }
    }
  }
  return {
    ...observation,
    openCount,
    lateCount,
    blockedCount: statusCounts.get('blocked') ?? 0,
    completedCount: completions.reduce((sum, week) => sum + week.completedCount, 0),
    byStatus: STATUS_KEYS.flatMap((status) => {
      const count = statusCounts.get(status);
      return count === undefined ? [] : [{ status, count }];
    }),
    overdueTasks: overdue.map(({ task }) => task),
    assigneeThreshold: 6,
    assignees: [...assigneeCounts.keys()].sort().map((userId) => ({
      userId,
      openCount: assigneeCounts.get(userId) ?? 0,
    })),
    completions,
  };
}
