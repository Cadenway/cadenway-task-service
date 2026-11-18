import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { StartDateInvalidError } from '../../errors/task/start-date-invalid.error.js';
import { CalendarDate } from '../../value-objects/task/calendar-date.value-object.js';
import type { TaskPatch } from '../../value-objects/task/task-patch.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';

/**
 * Function checkDate
 *
 * @description
 * Refuses a date that is not a calendar date from 0001-01-01 (`dueDate` of `Task`,
 * `openapi/internal/task-service.yaml:2196-2201`).
 *
 * @param {string | null} date - The date, or `null` for none.
 * @returns {string | null} The same date.
 * @throws {InvalidTaskError} When the date is not a calendar date.
 */
function checkDate(date: string | null): string | null {
  if (date !== null && !CalendarDate.isCalendarDate(date)) {
    throw new InvalidTaskError('a date is a calendar date YYYY-MM-DD from 0001-01-01');
  }
  return date;
}

/**
 * Function shiftStart
 *
 * @description
 * The start of a task whose due date moves without a new start (`openapi/public/tasks.yaml:430-432`;
 * `TaskPatch.dueDate`, `openapi/internal/task-service.yaml:2563-2565`): moved by as many days as
 * the due date, so the duration is kept; removed with the due date.
 *
 * @param {Pick<TaskState, 'dueDate' | 'startDate'>} current - The dates before the change.
 * @param {string | null} dueDate - The new due date.
 * @returns {string | null} The new start, or `null` when there is none.
 * @throws {StartDateInvalidError} When the shifted start would be before 0001-01-01 (open question
 * 7 of the design).
 */
function shiftStart(
  current: Pick<TaskState, 'dueDate' | 'startDate'>,
  dueDate: string | null,
): string | null {
  if (current.startDate === null || dueDate === null || current.dueDate === null) {
    return null;
  }
  const days: number = CalendarDate.parse(current.dueDate).daysUntil(CalendarDate.parse(dueDate));
  const start: CalendarDate | null = CalendarDate.parse(current.startDate).plusDays(days);
  if (start === null) {
    throw new StartDateInvalidError();
  }
  return start.format();
}

/**
 * Function isScheduleValid
 *
 * @description
 * Whether two dates can be the due date and the start of a task: calendar dates, a start only
 * with a due date and on or before it (`openapi/internal/task-service.yaml:2202-2207` and
 * 2312-2319). The text order of `YYYY-MM-DD` is the date order.
 *
 * @param {string | null} dueDate - The due date, or `null`.
 * @param {string | null} startDate - The start, or `null`.
 * @returns {boolean} Whether the schedule is valid.
 */
export function isScheduleValid(dueDate: string | null, startDate: string | null): boolean {
  if (dueDate !== null && !CalendarDate.isCalendarDate(dueDate)) {
    return false;
  }
  if (startDate === null) {
    return true;
  }
  return CalendarDate.isCalendarDate(startDate) && dueDate !== null && startDate <= dueDate;
}

/**
 * Function resolveSchedule
 *
 * @description
 * The due date and the start of a task after a creation or a patch
 * (`openapi/public/tasks.yaml:117` and 430-433):
 *
 * - a member left out is unchanged, `null` removes the date;
 * - a new due date without `startDate` moves the existing start by as many days and keeps the
 *   duration, and removing the due date removes the start;
 * - the start needs a due date and is on or before it.
 *
 * @param {Pick<TaskState, 'dueDate' | 'startDate'> | null} current - The dates before the change,
 * or `null` at a creation.
 * @param {Pick<TaskPatch, 'dueDate' | 'startDate'>} change - The dates sent.
 * @returns {Pick<TaskState, 'dueDate' | 'startDate'>} The dates after the change.
 * @throws {InvalidTaskError} When a date is not a calendar date from 0001-01-01.
 * @throws {StartDateInvalidError} When the start is without a due date or after it, or a shift
 * would move it before 0001-01-01.
 */
export function resolveSchedule(
  current: Pick<TaskState, 'dueDate' | 'startDate'> | null,
  change: Pick<TaskPatch, 'dueDate' | 'startDate'>,
): Pick<TaskState, 'dueDate' | 'startDate'> {
  const dueDate: string | null =
    change.dueDate === undefined ? (current?.dueDate ?? null) : checkDate(change.dueDate);
  let startDate: string | null;
  if (change.startDate !== undefined) {
    startDate = checkDate(change.startDate);
  } else if (current === null) {
    startDate = null;
  } else if (change.dueDate === undefined) {
    startDate = current.startDate;
  } else {
    startDate = shiftStart(current, dueDate);
  }
  if (startDate !== null && (dueDate === null || startDate > dueDate)) {
    throw new StartDateInvalidError();
  }
  return { dueDate, startDate };
}
