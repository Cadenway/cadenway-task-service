import { describe, expect, it, vi } from 'vitest';

import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ATELIER_NORD, HUGO, InMemoryTasks } from '../../../tasks.fixture.js';
import { RemoveMemberWatcherOverrides } from './remove-member-watcher-overrides.use-case.js';

/** Input supplied by the member clean-up worker after its previous batch. */
const input = {
  organizationId: ATELIER_NORD,
  userId: HUGO,
  afterTaskId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e02',
} as const;

/** A task carrying a follow or unfollow override of the former member. */
const pendingTaskId: string = '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e03';

describe('RemoveMemberWatcherOverrides', () => {
  it('checks the membership after acquiring the task locks and preserves a rejoined member', async () => {
    const tasks = new InMemoryTasks();
    const lockTaskIdsForMember = vi.fn().mockResolvedValue([pendingTaskId]);
    const removeForMember = vi.fn();
    const roleOf = vi.fn().mockResolvedValue('member');
    const unit: TasksUnitOfWork = {
      run: (work) =>
        tasks.run((store) =>
          work({
            ...store,
            watcherOverrides: { ...store.watcherOverrides, lockTaskIdsForMember, removeForMember },
          }),
        ),
      runReadOnly: (work, options) => tasks.runReadOnly(work, options),
    };

    await expect(
      new RemoveMemberWatcherOverrides(unit, { roleOf }).execute(input),
    ).resolves.toEqual({ outcome: 'member-again' });
    expect(lockTaskIdsForMember).toHaveBeenCalledWith(ATELIER_NORD, HUGO, input.afterTaskId, 500);
    expect(lockTaskIdsForMember).toHaveBeenCalledBefore(roleOf);
    expect(roleOf).toHaveBeenCalledWith(ATELIER_NORD, HUGO);
    expect(removeForMember).not.toHaveBeenCalled();
  });

  it('removes only the former member overrides of the locked tasks and advances its cursor', async () => {
    const tasks = new InMemoryTasks();
    const lockTaskIdsForMember = vi.fn().mockResolvedValue([pendingTaskId]);
    const removeForMember = vi.fn().mockResolvedValue(1);
    const roleOf = vi.fn().mockResolvedValue(null);
    const unit: TasksUnitOfWork = {
      run: (work) =>
        tasks.run((store) =>
          work({
            ...store,
            watcherOverrides: { ...store.watcherOverrides, lockTaskIdsForMember, removeForMember },
          }),
        ),
      runReadOnly: (work, options) => tasks.runReadOnly(work, options),
    };

    await expect(
      new RemoveMemberWatcherOverrides(unit, { roleOf }).execute(input),
    ).resolves.toEqual({ outcome: 'removed', removed: 1, lastTaskId: pendingTaskId });
    expect(roleOf).toHaveBeenCalledBefore(removeForMember);
    expect(removeForMember).toHaveBeenCalledWith(ATELIER_NORD, HUGO, [pendingTaskId]);
  });
});
