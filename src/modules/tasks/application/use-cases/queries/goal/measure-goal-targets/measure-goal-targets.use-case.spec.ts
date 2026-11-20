import { describe, expect, it, vi } from 'vitest';

import type { GoalTargetReader } from '../../../../ports/outbound/persistence/goal/goal-target-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { GoalTargetUnitOfWork } from '../../../../ports/outbound/transactions/goal/goal-target-unit-of-work.port.js';
import { MeasureGoalTargets } from './measure-goal-targets.use-case.js';

describe('MeasureGoalTargets', () => {
  it('batches list visibility and omits inaccessible targets while retaining empty lists', async () => {
    const reader: GoalTargetReader = {
      milestones: vi.fn().mockResolvedValue([
        { key: 'CAD-482', listId: 'visible', status: 'done' },
        { key: 'CAD-483', listId: 'hidden', status: 'done' },
      ]),
      listCounts: vi
        .fn()
        .mockResolvedValue(new Map([['visible', { eligibleTaskCount: 3, doneTaskCount: 2 }]])),
    };
    const unit: GoalTargetUnitOfWork = {
      run: (work) => work(reader),
      read: (work) => work(reader),
    };
    const findVisibleLists = vi.fn((_org: string, _viewer: unknown, ids: readonly string[]) =>
      Promise.resolve(ids.filter((id) => id !== 'hidden').map((id) => ({ id }))),
    );
    const spaces = { findVisibleLists, lockTrashLists: vi.fn() } as unknown as SpaceDirectory;
    const input = {
      organizationId: 'org',
      viewer: { userId: 'member', role: 'guest' as const },
      listIds: [
        ...Array.from({ length: 101 }, (_, index) => `list-${String(index)}`),
        'visible',
        'hidden',
      ],
      milestoneKeys: ['CAD-482', 'CAD-483'],
      lock: false,
    };
    const result = await new MeasureGoalTargets(unit, spaces).execute(input);
    expect(findVisibleLists).toHaveBeenCalledTimes(2);
    expect(result.lists.get('visible')).toEqual({ eligibleTaskCount: 3, doneTaskCount: 2 });
    expect(result.lists.get('list-0')).toEqual({ eligibleTaskCount: 0, doneTaskCount: 0 });
    expect(result.lists.has('hidden')).toBe(false);
    expect([...result.milestones]).toEqual([['CAD-482', true]]);
  });

  it('locks only preauthorized tasks, rechecks their current placement and skips counts for validation', async () => {
    const milestones = vi
      .fn()
      .mockResolvedValueOnce([
        { key: 'CAD-482', listId: 'old', status: 'todo' },
        { key: 'CAD-483', listId: 'hidden', status: 'done' },
      ])
      .mockResolvedValueOnce([{ key: 'CAD-482', listId: 'moved', status: 'done' }]);
    const listCounts = vi.fn();
    const reader: GoalTargetReader = { milestones, listCounts };
    const unit: GoalTargetUnitOfWork = {
      run: (work) => work(reader),
      read: (work) => work(reader),
    };
    const lockTrashLists = vi.fn().mockResolvedValue([
      { listId: 'list', outcome: 'live', role: 'view' },
      { listId: 'moved', outcome: 'live', role: null },
    ]);
    const spaces = {
      findVisibleLists: vi.fn().mockResolvedValue([{ id: 'old' }, { id: 'list' }]),
      lockTrashLists,
    } as unknown as SpaceDirectory;
    const result = await new MeasureGoalTargets(unit, spaces).execute({
      organizationId: 'org',
      viewer: { userId: 'member', role: 'member' },
      listIds: ['list'],
      milestoneKeys: ['CAD-482', 'CAD-483'],
      lock: true,
    });
    expect(milestones).toHaveBeenNthCalledWith(2, 'org', ['CAD-482'], true);
    expect(lockTrashLists).toHaveBeenCalledWith('org', ['list', 'moved'], 'hold', {
      userId: 'member',
      role: 'member',
    });
    expect(listCounts).not.toHaveBeenCalled();
    expect(result.lists.has('list')).toBe(true);
    expect(result.milestones.size).toBe(0);
  });
});
