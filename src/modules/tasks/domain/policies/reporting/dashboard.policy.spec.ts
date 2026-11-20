import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import { buildTeamDashboard } from './dashboard.policy.js';

const camille = '01000000-0000-4000-8000-000000000001';
const lucas = '01000000-0000-4000-8000-000000000002';
const observation = {
  today: '2026-11-03',
  timeZone: 'Europe/Paris',
  weeks: 8 as const,
  observedAt: new Date('2026-11-03T15:00:00Z'),
};
const task = {
  id: '02000000-0000-4000-8000-000000000001',
  key: TaskKey.parse('CAD-482'),
  status: 'blocked' as const,
  dueDate: '2026-11-02',
  assigneeIds: [camille],
};

describe('buildTeamDashboard', () => {
  it('uses current status rules for open, late and blocked tasks and keeps all visible assignees', () => {
    const displayName = 'Préparer Sprint 14';
    const dashboard = buildTeamDashboard(
      observation,
      [
        { ...task, displayName },
        { ...task, id: '2', key: TaskKey.parse('CAD-9'), status: 'todo', displayName },
        {
          ...task,
          id: '3',
          status: 'cancelled',
          assigneeIds: [lucas],
          displayName,
        },
        { ...task, id: '4', status: 'done', displayName },
        { ...task, id: '5', status: 'review', dueDate: observation.today, displayName },
      ],
      [],
    );

    expect(dashboard).toMatchObject({
      openCount: 3,
      blockedCount: 1,
      lateCount: 2,
      completedCount: 0,
      assigneeThreshold: 6,
      assignees: [
        { userId: camille, openCount: 3 },
        { userId: lucas, openCount: 0 },
      ],
      byStatus: [
        { status: 'todo', count: 1 },
        { status: 'review', count: 1 },
        { status: 'blocked', count: 1 },
        { status: 'done', count: 1 },
        { status: 'cancelled', count: 1 },
      ],
    });
    expect(dashboard.overdueTasks.map(({ key }) => key.format())).toEqual(['CAD-9', 'CAD-482']);
    expect(dashboard.overdueTasks[0]?.displayName).toBe(displayName);
    expect(dashboard.completions).toHaveLength(8);
  });

  it('caps the overdue selection at ten without capping the late count', () => {
    const tasks = Array.from({ length: 12 }, (_, index) => ({
      ...task,
      id: String(index + 1),
      key: TaskKey.of('CAD', 12 - index),
    }));

    const dashboard = buildTeamDashboard(observation, tasks, []);

    expect(dashboard.lateCount).toBe(12);
    expect(dashboard.overdueTasks.map(({ key }) => key.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('buckets distinct visible tasks per local completion week through both observation bounds', () => {
    const done = (instant: string, taskId: string = task.id) => ({
      taskId,
      to: 'done' as const,
      occurredAt: new Date(instant),
    });
    const completed = buildTeamDashboard(
      { ...observation, weeks: 12 },
      [task, { ...task, id: '2', key: TaskKey.parse('CAD-483') }],
      [
        done('2026-10-25T22:59:59Z'),
        done('2026-10-25T23:00:00Z'),
        done('2026-11-01T22:59:59Z'),
        done('2026-11-01T23:00:00Z'),
        done('2026-11-03T15:00:00Z'),
        done('2026-11-03T15:00:00.001Z', '2'),
        done('2026-11-02T10:00:00Z', 'invisible'),
        done('2026-08-01T10:00:00Z', '2'),
        { ...done('2026-11-02T10:00:00Z', '2'), to: 'cancelled' },
      ],
    );

    expect(completed.completedCount).toBe(3);
    expect(completed.completions).toHaveLength(12);
    expect(completed.completions.slice(-4)).toEqual([
      { startsOn: '2026-10-12', completedCount: 0 },
      { startsOn: '2026-10-19', completedCount: 1 },
      { startsOn: '2026-10-26', completedCount: 1 },
      { startsOn: '2026-11-02', completedCount: 1 },
    ]);

    const historical = buildTeamDashboard(
      { ...observation, today: '2026-11-02' },
      [task],
      [done('2026-11-02T23:00:00Z')],
    );

    expect(historical.completedCount).toBe(0);
    expect(historical.observedAt).toEqual(observation.observedAt);
  });

  it.each([
    { ...observation, today: '0001-01-01' },
    { ...observation, timeZone: 'Europe/Nowhere' },
    { ...observation, timeZone: '+01:00' },
    { ...observation, observedAt: new Date(Number.NaN) },
  ])('refuses invalid observation or unrepresentable history %#', (input) => {
    expect(() => buildTeamDashboard(input, [], [])).toThrow(InvalidTaskError);
  });
});
