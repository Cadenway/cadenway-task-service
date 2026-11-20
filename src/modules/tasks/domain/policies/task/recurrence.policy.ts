import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { RecurrenceAlreadySpawnedError } from '../../errors/task/recurrence-already-spawned.error.js';
import { RecurrenceDateOutOfRangeError } from '../../errors/task/recurrence-date-out-of-range.error.js';
import { CalendarDate } from '../../value-objects/task/calendar-date.value-object.js';
import type { NextOccurrenceSchedule } from '../../value-objects/task/next-occurrence-schedule.value-object.js';
import { RECURRENCES, type Recurrence } from '../../value-objects/task/recurrence.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import type { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import type { TaskRecurrence } from '../../value-objects/task/task-recurrence.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';

/** The Gregorian calendar advance and any anchor to transfer to its successor. */
interface DueDateAdvance {
  // #region Properties
  /** Next date, or absence when the calendar has no following date for the rule. */
  readonly date: CalendarDate | null;

  /** Original day to keep for an inherited monthly schedule. */
  readonly monthlyAnchorDay: number | null;
  // #endregion
}

/** Fields required to plan a real completion, using the task's final dates and cadence. */
type OccurrenceSource = TaskRecurrence & Pick<TaskState, 'status' | 'dueDate' | 'startDate'>;

/** Checks stored cadence, anchor and history invariants (P3b-2 decisions 13–14). */
export function requireValidRecurrence(fields: TaskRecurrence): void {
  if (!RECURRENCES.includes(fields.recurrence)) {
    throw new InvalidTaskError('recurrence uses a supported cadence');
  }
  const anchor: number | null = fields.monthlyAnchorDay;
  if (
    anchor !== null &&
    (fields.recurrence !== 'monthly' || !Number.isInteger(anchor) || anchor < 1 || anchor > 31)
  ) {
    throw new InvalidTaskError('only a monthly recurrence has an anchor from 1 to 31');
  }
  if (fields.nextOccurrenceKey !== null && fields.recurrence !== 'none') {
    throw new InvalidTaskError('a predecessor with a successor has no active recurrence');
  }
}

/**
 * Resolves recurrence at creation or from an explicit cadence change (P3b-2 decision 14).
 * An unchanged cadence keeps the inherited monthly anchor. Switching cadence clears the anchor.
 *
 * @throws {RecurrenceAlreadySpawnedError} When an already consumed predecessor is rearmed.
 */
export function resolveRecurrence(
  current: TaskRecurrence | null,
  requested: Recurrence | undefined,
): TaskRecurrence {
  const recurrence: Recurrence = requested ?? current?.recurrence ?? 'none';
  const nextOccurrenceKey: TaskKey | null = current?.nextOccurrenceKey ?? null;
  if (nextOccurrenceKey !== null && recurrence !== 'none') {
    throw new RecurrenceAlreadySpawnedError();
  }
  const fields: TaskRecurrence = {
    recurrence,
    monthlyAnchorDay: recurrence === current?.recurrence ? current.monthlyAnchorDay : null,
    nextOccurrenceKey,
  };
  requireValidRecurrence(fields);
  return fields;
}

/** The first working date strictly after the given date (P3b-2 decision 13). */
function nextWorkday(date: CalendarDate): CalendarDate | null {
  let next: CalendarDate | null = date.plusDays(1);
  while (next?.isWeekend() === true) {
    next = next.plusDays(1);
  }
  return next;
}

/** Advances from the existing due date, retaining a monthly chain's original day. */
function advanceDueDate(
  recurrence: NextOccurrenceSchedule['recurrence'],
  due: CalendarDate,
  inheritedDay: number | null,
): DueDateAdvance {
  switch (recurrence) {
    case 'daily':
      return { date: nextWorkday(due), monthlyAnchorDay: null };
    case 'weekly':
      return { date: due.plusDays(7), monthlyAnchorDay: null };
    case 'biweekly':
      return { date: due.plusDays(14), monthlyAnchorDay: null };
    case 'monthly': {
      const monthlyAnchorDay: number = inheritedDay ?? due.dayOfMonth();
      return { date: due.nextMonthOnDay(monthlyAnchorDay), monthlyAnchorDay };
    }
  }
}

/**
 * Plans the next schedule only when an existing live task enters `done` with a due date and
 * a cadence (P3b-2 decisions 13–14). Use this on updates, never during creation or restoration.
 * The application allocates the successor's key and persists both tasks in the same transaction.
 *
 * @throws {RecurrenceDateOutOfRangeError} When the successor dates cannot be represented.
 */
export function planNextOccurrence(
  previousStatus: StatusKey,
  task: OccurrenceSource,
): NextOccurrenceSchedule | null {
  requireValidRecurrence(task);
  if (
    previousStatus === 'done' ||
    task.status !== 'done' ||
    task.recurrence === 'none' ||
    task.dueDate === null
  ) {
    return null;
  }
  const due: CalendarDate = CalendarDate.parse(task.dueDate);
  const next: DueDateAdvance = advanceDueDate(task.recurrence, due, task.monthlyAnchorDay);
  if (next.date === null) throw new RecurrenceDateOutOfRangeError();
  let start: CalendarDate | null = null;
  if (task.startDate !== null) {
    start = CalendarDate.parse(task.startDate).plusDays(due.daysUntil(next.date));
    if (start === null) throw new RecurrenceDateOutOfRangeError();
  }
  return {
    recurrence: task.recurrence,
    monthlyAnchorDay: next.monthlyAnchorDay,
    dueDate: next.date.format(),
    startDate: start?.format() ?? null,
  };
}

/**
 * Records the allocated successor key and consumes the predecessor's cadence (P3b-2 decision 14).
 * Store the marker alongside the successor and outbox facts, and retain it after successor purge.
 *
 * @throws {RecurrenceAlreadySpawnedError} When the predecessor already has a successor.
 * @throws {InvalidTaskError} When the predecessor has no active cadence.
 */
export function recordOccurrence(current: TaskRecurrence, successorKey: TaskKey): TaskRecurrence {
  if (current.nextOccurrenceKey !== null) throw new RecurrenceAlreadySpawnedError();
  if (current.recurrence === 'none') {
    throw new InvalidTaskError('an occurrence needs an active cadence');
  }
  return { recurrence: 'none', monthlyAnchorDay: null, nextOccurrenceKey: successorKey };
}
