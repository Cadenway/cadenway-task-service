import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import { buildWorkload } from './workload.policy.js';

const camille = '01000000-0000-4000-8000-000000000001';
const lucas = '01000000-0000-4000-8000-000000000002';
const task = {
  key: TaskKey.parse('CAD-482'),
  name: 'Préparer Sprint 14',
  status: 'todo' as const,
  startDate: '2026-11-06',
  dueDate: '2026-11-10',
  estimateMinutes: 11,
  assigneeIds: [lucas, camille],
};

describe('buildWorkload', () => {
  it('assigns the whole-day remainders to the earliest weekday and then to the lowest account', () => {
    const workload = buildWorkload('2026-11-02', [task]);

    expect(workload.items).toMatchObject([
      {
        assigneeId: camille,
        taskKey: 'CAD-482',
        minutesByDay: [0, 0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 0, 0, 0],
        totalMinutes: 6,
      },
      {
        assigneeId: lucas,
        taskKey: 'CAD-482',
        minutesByDay: [0, 0, 0, 0, 2, 0, 0, 2, 1, 0, 0, 0, 0, 0],
        totalMinutes: 5,
      },
    ]);
    expect(workload.totalMinutes).toBe(11);
    expect(workload.days[4]).toEqual({
      date: '2026-11-06',
      totalMinutes: 4,
      dailyCapacityMinutes: 360,
    });
    expect(workload.days[5]).toEqual({
      date: '2026-11-07',
      totalMinutes: 0,
      dailyCapacityMinutes: 0,
    });
  });

  it('clips an allocation to the window after calculating it across the full task span', () => {
    const taskAcrossWindows = {
      ...task,
      startDate: '2026-10-30',
      dueDate: '2026-11-03',
      estimateMinutes: 5,
      assigneeIds: [],
    };

    const october = buildWorkload('2026-10-19', [taskAcrossWindows]);
    const november = buildWorkload('2026-11-02', [taskAcrossWindows]);

    expect(october.days[11]?.totalMinutes).toBe(2);
    expect(november.items).toMatchObject([
      { assigneeId: null, minutesByDay: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
    expect(october.totalMinutes + november.totalMinutes).toBe(5);
  });

  it('uses the preceding Friday for a weekend-only span or a weekend due date with no start', () => {
    const saturday = {
      ...task,
      startDate: '2026-11-07',
      dueDate: '2026-11-08',
      estimateMinutes: 60,
      assigneeIds: [],
    };
    const sunday = {
      ...saturday,
      key: TaskKey.parse('CAD-483'),
      startDate: null,
      estimateMinutes: 90,
    };

    const workload = buildWorkload('2026-11-02', [saturday, sunday]);

    expect(workload.totalMinutes).toBe(150);
    expect(workload.days[4]?.totalMinutes).toBe(150);
    expect(workload.days[5]?.totalMinutes).toBe(0);
    expect(workload.days[6]?.totalMinutes).toBe(0);
  });

  it('omits cancelled, undated, zero-estimate and out-of-window tasks while retaining done work', () => {
    const workload = buildWorkload('2026-11-02', [
      { ...task, status: 'cancelled' },
      { ...task, startDate: null, dueDate: null },
      { ...task, estimateMinutes: 0 },
      { ...task, startDate: null, dueDate: '2026-10-29' },
      { ...task, status: 'done', estimateMinutes: 1 },
    ]);

    expect(workload.totalMinutes).toBe(1);
    expect(workload.items).toMatchObject([
      { assigneeId: camille, status: 'done', totalMinutes: 1 },
      { assigneeId: lucas, status: 'done', totalMinutes: 0 },
    ]);
  });

  it('keeps a calendar-wide estimate bounded by the requested fortnight', () => {
    const workload = buildWorkload('2026-11-02', [
      { ...task, startDate: '0001-01-01', dueDate: '9999-12-31', estimateMinutes: 60 },
    ]);

    expect(workload.days).toHaveLength(14);
    expect(workload.totalMinutes).toBe(0);
  });

  it.each(['2026-11-03', '2026-02-30', '9999-12-27'])(
    'refuses the invalid or unrepresentable fortnight %s',
    (date) => {
      expect(() => buildWorkload(date, [])).toThrow(InvalidTaskError);
    },
  );
});
