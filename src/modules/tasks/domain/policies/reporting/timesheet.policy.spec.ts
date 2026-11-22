import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import { buildTimesheet, TimesheetAccumulator } from './timesheet.policy.js';

const camille = '01000000-0000-4000-8000-000000000001';
const formerMember = '01000000-0000-4000-8000-000000000002';
const task = { key: TaskKey.parse('CAD-10'), name: 'Préparer Sprint 14', status: 'todo' as const };

describe('buildTimesheet', () => {
  it('sums work dates within Monday through Sunday and sorts by author and natural task key', () => {
    const entry = { task, authorUserId: camille, workDate: '2026-11-02', minutes: 20 };
    const timesheet = buildTimesheet('2026-11-02', [
      { ...entry, authorUserId: formerMember },
      { ...entry, workDate: '2026-11-09', minutes: 50 },
      { ...entry, minutes: 5 },
      { ...entry, task: { ...task, key: TaskKey.parse('CAD-2') } },
      { ...entry, workDate: '2026-11-08', minutes: 35 },
      entry,
      { ...entry, workDate: '2026-11-01' },
    ]);

    expect(timesheet.days).toEqual([
      { date: '2026-11-02', totalMinutes: 65 },
      { date: '2026-11-03', totalMinutes: 0 },
      { date: '2026-11-04', totalMinutes: 0 },
      { date: '2026-11-05', totalMinutes: 0 },
      { date: '2026-11-06', totalMinutes: 0 },
      { date: '2026-11-07', totalMinutes: 0 },
      { date: '2026-11-08', totalMinutes: 35 },
    ]);
    expect(timesheet.items).toMatchObject([
      { authorUserId: camille, taskKey: 'CAD-2', totalMinutes: 20 },
      {
        authorUserId: camille,
        taskKey: 'CAD-10',
        minutesByDay: [25, 0, 0, 0, 0, 0, 35],
        totalMinutes: 60,
      },
      { authorUserId: formerMember, taskKey: 'CAD-10', totalMinutes: 20 },
    ]);
    expect(timesheet.totalMinutes).toBe(100);
  });

  it('returns every calendar date of an empty week including the leap day', () => {
    const timesheet = buildTimesheet('2028-02-28', []);

    expect(timesheet.days).toHaveLength(7);
    expect(timesheet.days[1]).toEqual({ date: '2028-02-29', totalMinutes: 0 });
    expect(timesheet.days.at(-1)).toEqual({ date: '2028-03-05', totalMinutes: 0 });
    expect(timesheet.items).toEqual([]);
    expect(timesheet.totalMinutes).toBe(0);
  });

  it('refuses a non-Monday window start', () => {
    expect(() => buildTimesheet('2026-11-08', [])).toThrow(InvalidTaskError);
  });
});

describe('TimesheetAccumulator', () => {
  it('merges the same author and task across batches using the first in-week task snapshot', () => {
    const weekStart = '2026-11-02';
    const entry = { task, authorUserId: camille, workDate: weekStart, minutes: 20 };
    const laterTask = { ...task, name: 'Renamed', status: 'progress' as const };
    const firstBatch = [
      { ...entry, task: laterTask, workDate: '2026-11-01', minutes: 100 },
      { ...entry, authorUserId: formerMember },
      entry,
    ];
    const secondBatch = [
      { ...entry, task: laterTask, minutes: 5 },
      { ...entry, task: laterTask, workDate: '2026-11-08', minutes: 35 },
      { ...entry, task: { ...task, key: TaskKey.parse('CAD-2') } },
      { ...entry, workDate: '2026-11-09', minutes: 100 },
    ];
    const accumulator = new TimesheetAccumulator(weekStart);

    accumulator.add(firstBatch);
    accumulator.add([]);
    accumulator.add(secondBatch);

    const timesheet = accumulator.build();
    expect(timesheet).toEqual(buildTimesheet(weekStart, [...firstBatch, ...secondBatch]));
    expect(timesheet.totalMinutes).toBe(100);
    expect(timesheet.items[1]).toEqual({
      authorUserId: camille,
      taskKey: 'CAD-10',
      name: task.name,
      status: task.status,
      minutesByDay: [25, 0, 0, 0, 0, 0, 35],
      totalMinutes: 60,
    });
  });

  it('keeps already built reports stable when new batches arrive', () => {
    const weekStart = '2026-11-02';
    const entry = { task, authorUserId: camille, workDate: weekStart, minutes: 20 };
    const accumulator = new TimesheetAccumulator(weekStart);
    accumulator.add([entry]);
    const firstReport = accumulator.build();

    accumulator.add([entry]);

    expect(firstReport).toEqual(buildTimesheet(weekStart, [entry]));
    expect(accumulator.build()).toEqual(buildTimesheet(weekStart, [entry, entry]));
  });
});
