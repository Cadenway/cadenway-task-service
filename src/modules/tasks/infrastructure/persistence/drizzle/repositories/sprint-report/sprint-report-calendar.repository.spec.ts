import { describe, expect, it } from 'vitest';

import {
  sprintCalendarPage,
  sprintLocalDay,
  sprintObservedDay,
  sprintTrendDates,
} from './sprint-report-calendar.repository.js';

describe('sprint report calendar', () => {
  it('resolves a 23-hour daylight-saving day in the requested zone', () => {
    const day = sprintLocalDay('2026-03-29', 'Europe/Paris');
    expect(day.startsAt.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(day.endsAt.toISOString()).toBe('2026-03-29T21:59:59.999Z');
    expect(day.endsAt.getTime() - day.startsAt.getTime() + 1).toBe(23 * 60 * 60 * 1000);
    expect(sprintObservedDay(new Date('2026-03-29T21:59:59.999Z'), 'Europe/Paris').date).toBe(
      '2026-03-29',
    );
  });

  it('pages an inclusive range and reports the actual last date as the cursor', () => {
    const first = sprintCalendarPage('2026-11-03', '2026-11-06', null, 2, 'Europe/Paris');
    expect(first.days.map((day) => day.date)).toEqual(['2026-11-03', '2026-11-04']);
    expect(first.next).toBe('2026-11-04');
    const second = sprintCalendarPage('2026-11-03', '2026-11-06', first.next, 2, 'Europe/Paris');
    expect(second.days.map((day) => day.date)).toEqual(['2026-11-05', '2026-11-06']);
    expect(second.next).toBeNull();
  });

  it('finds the two most recent covered dates without scanning a multi-century gap', () => {
    const dates = sprintTrendDates(
      [
        { startDate: '1900-01-01', endDate: '1900-01-01' },
        { startDate: '2026-11-03', endDate: '2026-11-09' },
      ],
      new Date('2026-11-06T11:00:00Z'),
      'Europe/Paris',
    );
    expect(dates.map((day) => day.date)).toEqual(['2026-11-04', '2026-11-05']);
  });

  it('pages a skipped local date without treating it as a trend sample', () => {
    const zone = 'Pacific/Apia';
    const page = sprintCalendarPage('2011-12-29', '2011-12-31', null, 3, zone);
    expect(page.days.map(({ date, hasInstants }) => [date, hasInstants])).toEqual([
      ['2011-12-29', true],
      ['2011-12-30', false],
      ['2011-12-31', true],
    ]);
    const skipped = sprintLocalDay('2011-12-30', zone);
    expect(skipped.startsAt).toEqual(new Date('2011-12-30T10:00:00.000Z'));
    expect(skipped.endsAt).toEqual(new Date('2011-12-30T09:59:59.999Z'));
    const samples = sprintTrendDates(
      [{ startDate: '2011-12-28', endDate: '2011-12-31' }],
      new Date('2011-12-30T11:00:00.000Z'),
      zone,
    );
    expect(samples.map(({ date }) => date)).toEqual(['2011-12-28', '2011-12-29']);
  });
});
