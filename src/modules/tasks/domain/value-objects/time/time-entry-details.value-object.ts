import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { CalendarDate } from '../task/calendar-date.value-object.js';

/** The validated work-log details of a `TaskTimeEntry`, separate from its server metadata. */
export interface TimeEntryDetails {
  // #region Properties
  /** Whole minutes recorded, from 1 to 1,440. */
  readonly minutes: number;

  /** Calendar date of the work as supplied by the caller. */
  readonly workDate: string;

  /** Trimmed plain-text note, or null when omitted or blank. */
  readonly note: string | null;
  // #endregion
}

/** Enforces `TaskTimeEntryCreation` bounds before normalizing a work-log note. */
export function normalizeTimeEntry(
  input: Pick<TimeEntryDetails, 'minutes' | 'workDate'> & { readonly note?: string },
): TimeEntryDetails {
  const { minutes, workDate, note = '' } = input;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new InvalidTaskError('a time entry is between 1 and 1440 whole minutes');
  }
  if (!CalendarDate.isCalendarDate(workDate)) {
    throw new InvalidTaskError('a time entry work date is a calendar date YYYY-MM-DD from 0001');
  }
  if (Array.from(note).length > 500) {
    throw new InvalidTaskError('a time entry note has at most 500 Unicode code points');
  }
  return { minutes, workDate, note: note.trim() || null };
}
