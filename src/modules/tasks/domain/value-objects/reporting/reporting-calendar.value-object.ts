import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { CalendarDate } from '../task/calendar-date.value-object.js';

// The first supported task date is a Monday.
const firstMonday = CalendarDate.parse('0001-01-01');

/** Zero-based weekday in the Monday-first calendar of the P3c reports. */
export function reportingWeekday(date: CalendarDate): number {
  return firstMonday.daysUntil(date) % 7;
}

/** Moves within the supported civil dates used in the P3c reporting contracts. */
export function shiftReportingDate(date: CalendarDate, days: number): CalendarDate {
  const shifted = date.plusDays(days);
  if (shifted === null) {
    throw new InvalidTaskError('the whole reporting window fits within the supported dates');
  }
  return shifted;
}

/** Creates a seven- or fourteen-day window from the Monday required by P3c decision 9. */
export function reportingWindow(start: string, length: 7 | 14): readonly CalendarDate[] {
  const monday = CalendarDate.parse(start);
  if (reportingWeekday(monday) !== 0) {
    throw new InvalidTaskError('a reporting window starts on a Monday');
  }
  return Array.from({ length }, (_, index) => shiftReportingDate(monday, index));
}
