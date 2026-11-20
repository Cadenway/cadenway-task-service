import { RECURRENCES as PUBLISHED_RECURRENCES } from '@cadenway/contracts';
import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { RecurrenceAlreadySpawnedError } from '../../errors/task/recurrence-already-spawned.error.js';
import { RecurrenceDateOutOfRangeError } from '../../errors/task/recurrence-date-out-of-range.error.js';
import { RECURRENCES } from '../../value-objects/task/recurrence.value-object.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import type { TaskRecurrence } from '../../value-objects/task/task-recurrence.value-object.js';
import {
  planNextOccurrence,
  recordOccurrence,
  requireValidRecurrence,
  resolveRecurrence,
} from './recurrence.policy.js';

const monthly: TaskRecurrence = {
  recurrence: 'monthly',
  monthlyAnchorDay: 31,
  nextOccurrenceKey: null,
};

describe('resolveRecurrence', () => {
  it('uses the published cadences and defaults a new task to none', () => {
    expect(RECURRENCES).toEqual(PUBLISHED_RECURRENCES);
    expect(resolveRecurrence(null, undefined)).toEqual({
      recurrence: 'none',
      monthlyAnchorDay: null,
      nextOccurrenceKey: null,
    });
  });

  it('keeps a transferred monthly anchor unless the cadence changes', () => {
    expect(resolveRecurrence(monthly, undefined)).toEqual(monthly);
    expect(resolveRecurrence(monthly, 'monthly')).toEqual(monthly);
    expect(resolveRecurrence(monthly, 'weekly')).toEqual({
      recurrence: 'weekly',
      monthlyAnchorDay: null,
      nextOccurrenceKey: null,
    });
    expect(resolveRecurrence(resolveRecurrence(monthly, 'none'), 'monthly')).toEqual({
      ...monthly,
      monthlyAnchorDay: null,
    });
  });

  it('keeps the recorded successor and rejects any attempt to rearm its predecessor', () => {
    const successor = TaskKey.parse('CAD-483');
    const recorded: TaskRecurrence = recordOccurrence(monthly, successor);
    expect(recorded).toEqual({
      recurrence: 'none',
      monthlyAnchorDay: null,
      nextOccurrenceKey: successor,
    });
    expect(resolveRecurrence(recorded, undefined)).toEqual(recorded);
    expect(resolveRecurrence(recorded, 'none')).toEqual(recorded);
    expect(() => resolveRecurrence(recorded, 'monthly')).toThrow(RecurrenceAlreadySpawnedError);
    expect(() => recordOccurrence(recorded, TaskKey.parse('CAD-484'))).toThrow(
      RecurrenceAlreadySpawnedError,
    );
  });

  it('rejects invalid persisted anchors or active cadences on consumed predecessors', () => {
    expect(() => {
      requireValidRecurrence({ ...monthly, monthlyAnchorDay: 32 });
    }).toThrow(InvalidTaskError);
    expect(() => {
      requireValidRecurrence({ ...monthly, monthlyAnchorDay: 0.5 });
    }).toThrow(InvalidTaskError);
    expect(() => {
      requireValidRecurrence({ ...monthly, recurrence: 'weekly' });
    }).toThrow(InvalidTaskError);
    expect(() => {
      requireValidRecurrence({ ...monthly, nextOccurrenceKey: TaskKey.parse('CAD-483') });
    }).toThrow(InvalidTaskError);
  });
});

describe('planNextOccurrence', () => {
  it('advances a dated workday cadence and skips both weekend days', () => {
    for (const date of ['2026-11-20', '2026-11-21', '2026-11-22']) {
      expect(
        planNextOccurrence('review', {
          recurrence: 'daily',
          monthlyAnchorDay: null,
          nextOccurrenceKey: null,
          status: 'done',
          dueDate: date,
          startDate: date,
        }),
      ).toEqual({
        recurrence: 'daily',
        monthlyAnchorDay: null,
        dueDate: '2026-11-23',
        startDate: '2026-11-23',
      });
    }
  });

  it.each([
    ['weekly', '2026-12-04', '2026-12-01'],
    ['biweekly', '2026-12-11', '2026-12-08'],
  ] as const)(
    'shifts the start by the same number of calendar days for %s',
    (cadence, dueDate, startDate) => {
      expect(
        planNextOccurrence('todo', {
          recurrence: cadence,
          monthlyAnchorDay: null,
          nextOccurrenceKey: null,
          status: 'done',
          dueDate: '2026-11-27',
          startDate: '2026-11-24',
        }),
      ).toEqual({ recurrence: cadence, monthlyAnchorDay: null, dueDate, startDate });
    },
  );

  it.each([
    ['2026-01-31', '2026-02-28', '2026-03-31'],
    ['2028-01-31', '2028-02-29', '2028-03-31'],
  ])(
    'clamps %s to %s and restores the original day the following month',
    (initial, february, march) => {
      const first = planNextOccurrence('todo', {
        ...monthly,
        monthlyAnchorDay: null,
        status: 'done',
        dueDate: initial,
        startDate: null,
      });
      expect(first).toEqual({
        recurrence: 'monthly',
        monthlyAnchorDay: 31,
        dueDate: february,
        startDate: null,
      });
      if (first === null) throw new Error('The dated task did not plan a successor.');
      expect(
        planNextOccurrence('todo', { ...first, nextOccurrenceKey: null, status: 'done' }),
      ).toEqual({
        ...first,
        dueDate: march,
      });
    },
  );

  it('plans nothing when the task was already done, stayed undated or was cancelled', () => {
    const source = {
      ...monthly,
      status: 'done',
      dueDate: '2026-01-31',
      startDate: null,
    } as const;
    expect(planNextOccurrence('done', source)).toBeNull();
    expect(planNextOccurrence('todo', { ...source, dueDate: null })).toBeNull();
    expect(planNextOccurrence('todo', { ...source, status: 'cancelled' })).toBeNull();
    expect(
      planNextOccurrence('todo', {
        ...source,
        ...recordOccurrence(monthly, TaskKey.parse('CAD-483')),
      }),
    ).toBeNull();
  });

  it('refuses completion dates whose next occurrence would exceed the supported calendar', () => {
    for (const recurrence of ['daily', 'weekly', 'biweekly', 'monthly'] as const) {
      expect(() =>
        planNextOccurrence('todo', {
          recurrence,
          monthlyAnchorDay: null,
          nextOccurrenceKey: null,
          status: 'done',
          dueDate: '9999-12-31',
          startDate: null,
        }),
      ).toThrow(RecurrenceDateOutOfRangeError);
    }
  });
});
