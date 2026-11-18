import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { StartDateInvalidError } from '../../errors/task/start-date-invalid.error.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';
import { isScheduleValid, resolveSchedule } from './schedule.policy.js';

/** The dates of CAD-482: from 2026-11-11, due 2026-11-12. */
const cad482: Pick<TaskState, 'dueDate' | 'startDate'> = {
  dueDate: '2026-11-12',
  startDate: '2026-11-11',
};

describe('resolveSchedule at a creation: the start needs a due date, on or before it', () => {
  it('accepts a start on or before the due date', () => {
    expect(resolveSchedule(null, cad482)).toEqual(cad482);
    expect(resolveSchedule(null, { dueDate: '2026-11-12', startDate: '2026-11-12' })).toEqual({
      dueDate: '2026-11-12',
      startDate: '2026-11-12',
    });
  });

  it('refuses a start after the due date or without one', () => {
    expect(() => resolveSchedule(null, { dueDate: '2026-11-12', startDate: '2026-11-13' })).toThrow(
      StartDateInvalidError,
    );
    expect(() => resolveSchedule(null, { dueDate: null, startDate: '2026-11-11' })).toThrow(
      StartDateInvalidError,
    );
  });

  it('refuses a date that is not a calendar date, the year 0000 included', () => {
    expect(() => resolveSchedule(null, { dueDate: '0000-01-01', startDate: null })).toThrow(
      InvalidTaskError,
    );
    expect(() => resolveSchedule(null, { dueDate: '2026-02-30', startDate: null })).toThrow(
      InvalidTaskError,
    );
  });
});

describe('resolveSchedule on a patch: a new due date moves the start and keeps the duration', () => {
  it('moves the start forward with a later due date', () => {
    expect(resolveSchedule(cad482, { dueDate: '2026-11-19' })).toEqual({
      dueDate: '2026-11-19',
      startDate: '2026-11-18',
    });
  });

  it('moves the start backward with an earlier due date', () => {
    expect(resolveSchedule(cad482, { dueDate: '2026-11-02' })).toEqual({
      dueDate: '2026-11-02',
      startDate: '2026-11-01',
    });
  });

  it('keeps the duration across 29 February of a leap year', () => {
    expect(
      resolveSchedule(
        { dueDate: '2028-03-01', startDate: '2028-02-27' },
        { dueDate: '2028-03-02' },
      ),
    ).toEqual({ dueDate: '2028-03-02', startDate: '2028-02-28' });
    expect(
      resolveSchedule(
        { dueDate: '2028-03-02', startDate: '2028-02-28' },
        { dueDate: '2028-03-03' },
      ),
    ).toEqual({ dueDate: '2028-03-03', startDate: '2028-02-29' });
  });

  it('removes the start with the due date', () => {
    expect(resolveSchedule(cad482, { dueDate: null })).toEqual({ dueDate: null, startDate: null });
  });

  it('sets a due date without inventing a start', () => {
    expect(resolveSchedule({ dueDate: null, startDate: null }, { dueDate: '2026-11-12' })).toEqual({
      dueDate: '2026-11-12',
      startDate: null,
    });
  });

  it('takes the start of the patch instead of moving it', () => {
    expect(resolveSchedule(cad482, { dueDate: '2026-11-19', startDate: '2026-11-10' })).toEqual({
      dueDate: '2026-11-19',
      startDate: '2026-11-10',
    });
  });

  it('refuses a shift that would move the start before 0001-01-01', () => {
    expect(() =>
      resolveSchedule(
        { dueDate: '0001-01-10', startDate: '0001-01-01' },
        { dueDate: '0001-01-09' },
      ),
    ).toThrow(StartDateInvalidError);
    expect(
      resolveSchedule(
        { dueDate: '0001-01-10', startDate: '0001-01-02' },
        { dueDate: '0001-01-09' },
      ),
    ).toEqual({ dueDate: '0001-01-09', startDate: '0001-01-01' });
  });
});

describe('resolveSchedule on a patch: the start alone', () => {
  it('keeps both dates when the patch leaves them out', () => {
    expect(resolveSchedule(cad482, {})).toEqual(cad482);
  });

  it('removes the start alone', () => {
    expect(resolveSchedule(cad482, { startDate: null })).toEqual({
      dueDate: '2026-11-12',
      startDate: null,
    });
  });

  it('refuses a new start after the kept due date', () => {
    expect(() => resolveSchedule(cad482, { startDate: '2026-11-13' })).toThrow(
      StartDateInvalidError,
    );
  });

  it('refuses a start set on a task without a due date', () => {
    expect(() =>
      resolveSchedule({ dueDate: null, startDate: null }, { startDate: '2026-11-11' }),
    ).toThrow(StartDateInvalidError);
  });
});

describe('isScheduleValid: a stored schedule', () => {
  it('accepts the valid shapes and refuses the others', () => {
    expect(isScheduleValid('2026-11-12', '2026-11-11')).toBe(true);
    expect(isScheduleValid('2026-11-12', null)).toBe(true);
    expect(isScheduleValid(null, null)).toBe(true);
    expect(isScheduleValid(null, '2026-11-11')).toBe(false);
    expect(isScheduleValid('2026-11-12', '2026-11-13')).toBe(false);
    expect(isScheduleValid('2026-11-31', null)).toBe(false);
  });
});
