import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { CalendarDate } from './calendar-date.value-object.js';

/**
 * Shifts a date by a number of days and formats the result.
 *
 * @param date - The date.
 * @param days - The number of days.
 * @returns The shifted date, or `null` out of range.
 */
function shifted(date: string, days: number): string | null {
  return CalendarDate.parse(date).plusDays(days)?.format() ?? null;
}

describe('CalendarDate: a calendar date YYYY-MM-DD from 0001-01-01', () => {
  it.each(['2026-11-12', '0001-01-01', '9999-12-31', '2024-02-29', '2000-02-29'])(
    'accepts %s',
    (date: string) => {
      expect(CalendarDate.isCalendarDate(date)).toBe(true);
      expect(CalendarDate.parse(date).format()).toBe(date);
    },
  );

  it.each([
    ['the year 0000', '0000-12-31'],
    ['29 February of a common year', '2026-02-29'],
    ['29 February of a century that is not a leap year', '1900-02-29'],
    ['a 31st in a month of 30 days', '2026-11-31'],
    ['the month 13', '2026-13-01'],
    ['the day 0', '2026-11-00'],
    ['a five-digit year', '10000-01-01'],
    ['a date with a time', '2026-11-12T00:00:00Z'],
  ])('refuses %s', (_case: string, date: string) => {
    expect(CalendarDate.isCalendarDate(date)).toBe(false);
    expect(() => CalendarDate.parse(date)).toThrow(InvalidTaskError);
  });
});

describe('CalendarDate arithmetic: whole days, no time zone', () => {
  it('counts the days between two dates both ways', () => {
    const due: CalendarDate = CalendarDate.parse('2026-11-12');

    expect(due.daysUntil(CalendarDate.parse('2026-11-19'))).toBe(7);
    expect(due.daysUntil(CalendarDate.parse('2026-11-05'))).toBe(-7);
    expect(due.daysUntil(CalendarDate.parse('2026-11-12'))).toBe(0);
  });

  it('crosses the end of a month and of a year', () => {
    expect(shifted('2026-11-30', 1)).toBe('2026-12-01');
    expect(shifted('2026-12-31', 1)).toBe('2027-01-01');
    expect(shifted('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('counts 29 February in a leap year and skips it otherwise', () => {
    expect(shifted('2028-02-28', 1)).toBe('2028-02-29');
    expect(shifted('2027-02-28', 1)).toBe('2027-03-01');
    expect(shifted('2000-02-28', 1)).toBe('2000-02-29');
    expect(shifted('2100-02-28', 1)).toBe('2100-03-01');
    expect(CalendarDate.parse('2028-02-01').daysUntil(CalendarDate.parse('2028-03-01'))).toBe(29);
    expect(CalendarDate.parse('2027-02-01').daysUntil(CalendarDate.parse('2027-03-01'))).toBe(28);
  });

  it('agrees with the UTC calendar over centuries', () => {
    for (const date of ['1970-01-01', '1999-12-31', '2026-11-12', '2400-02-29', '1600-03-01']) {
      const epochDays: number = new Date(`${date}T00:00:00Z`).getTime() / 86_400_000;
      expect(CalendarDate.parse('1970-01-01').daysUntil(CalendarDate.parse(date))).toBe(epochDays);
    }
  });

  it('stops at 0001-01-01 and 9999-12-31', () => {
    expect(shifted('0001-01-02', -1)).toBe('0001-01-01');
    expect(shifted('0001-01-01', -1)).toBeNull();
    expect(shifted('9999-12-30', 1)).toBe('9999-12-31');
    expect(shifted('9999-12-31', 1)).toBeNull();
  });

  it('refuses a number of days that is not an integer', () => {
    expect(() => CalendarDate.parse('2026-11-12').plusDays(1.5)).toThrow(InvalidTaskError);
  });

  it('identifies weekends before and after the epoch', () => {
    expect(CalendarDate.parse('1969-12-27').isWeekend()).toBe(true);
    expect(CalendarDate.parse('1969-12-29').isWeekend()).toBe(false);
    expect(CalendarDate.parse('2026-11-22').isWeekend()).toBe(true);
    expect(CalendarDate.parse('2026-11-23').isWeekend()).toBe(false);
  });

  it('moves the month across a year boundary without changing the anchor', () => {
    expect(CalendarDate.parse('2026-12-31').nextMonthOnDay(31)?.format()).toBe('2027-01-31');
    expect(CalendarDate.parse('0001-01-31').nextMonthOnDay(31)?.format()).toBe('0001-02-28');
    expect(CalendarDate.parse('9999-12-01').nextMonthOnDay(31)).toBeNull();
    expect(() => CalendarDate.parse('2026-11-12').nextMonthOnDay(0)).toThrow(InvalidTaskError);
  });
});
