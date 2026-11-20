import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { WatcherOverride } from '../../../../../domain/value-objects/watcher/watcher-override.value-object.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  NADIA,
  STRANGER,
  InMemorySpaceDirectory,
  InMemoryTasks,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  taskState,
} from '../../../tasks.fixture.js';
import { SetTaskWatcher } from './set-task-watcher.use-case.js';

/** An editor asking to add Hugo's explicit follow on CAD-482. */
const input = {
  organizationId: ATELIER_NORD,
  actorUserId: CAMILLE,
  taskKey: 'CAD-482',
  userId: HUGO,
  following: true,
  expectedVersions: [12],
};

/** Prepares one watcher service and spies on its transaction's override and outbox adapters. */
function setup(overrides: readonly WatcherOverride[] = []) {
  const tasks = new InMemoryTasks({ tasks: [taskState()] });
  const set = vi.fn<TasksStore['watcherOverrides']['set']>().mockResolvedValue(undefined);
  const append = vi.fn<TasksStore['events']['taskWatcherChanged']>().mockResolvedValue(undefined);
  const unit: TasksUnitOfWork = {
    run: <TResult>(work: (store: TasksStore) => Promise<TResult>): Promise<TResult> =>
      tasks.run((store) =>
        work({
          ...store,
          watcherOverrides: {
            ...store.watcherOverrides,
            list: () => Promise.resolve(overrides),
            set,
          },
          events: { ...store.events, taskWatcherChanged: append },
        }),
      ),
    runReadOnly: (work, options) => tasks.runReadOnly(work, options),
  };
  const members = atelierNordMembers();
  return { tasks, unit, members, set, append };
}

describe('SetTaskWatcher', () => {
  it('takes a version and emits an override without task activity', async () => {
    const { tasks, unit, members, set, append } = setup();
    const useCase = new SetTaskWatcher(unit, members, new InMemorySpaceDirectory());
    expect(await useCase.execute(input)).toEqual({ userId: HUGO, version: 13 });
    expect(set).toHaveBeenCalledWith(ATELIER_NORD, CAD_482, { userId: HUGO, following: true });
    const event = append.mock.calls[0];
    expect(event?.[0].snapshot.version).toBe(13);
    expect(event?.slice(1)).toEqual([
      { userId: HUGO, following: true },
      { type: 'user', id: CAMILLE },
    ]);
    expect(tasks.events).toMatchObject([{ kind: 'updated', changed: ['watchers'], version: 13 }]);
    expect(tasks.entriesOf(CAD_482)).toEqual([]);
  });

  it('checks If-Match before a repeated override and otherwise keeps its version and events', async () => {
    const { tasks, unit, members, set, append } = setup([{ userId: HUGO, following: true }]);
    const useCase = new SetTaskWatcher(unit, members, new InMemorySpaceDirectory());
    expect(await refusalOf(useCase.execute({ ...input, expectedVersions: [11] }))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
    expect(await useCase.execute(input)).toEqual({ userId: HUGO, version: 12 });
    expect(set).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(tasks.events).toEqual([]);
  });

  it('lets a commenter opt out even without a default and refuses a change to another account first', async () => {
    const { unit, members, set } = setup();
    const useCase = new SetTaskWatcher(unit, members, sprint14SharedWith({ [NADIA]: 'comment' }));
    expect(
      await refusalOf(useCase.execute({ ...input, actorUserId: NADIA, userId: STRANGER })),
    ).toEqual({ reason: 'role-insufficient', role: 'comment' });
    expect(
      await useCase.execute({ ...input, actorUserId: NADIA, userId: NADIA, following: false }),
    ).toEqual({ userId: NADIA, version: 13 });
    expect(set).toHaveBeenCalledWith(ATELIER_NORD, CAD_482, { userId: NADIA, following: false });
  });

  it('returns one eligibility refusal for an unknown account and an account unable to read the list', async () => {
    const { unit, members, set } = setup();
    const useCase = new SetTaskWatcher(unit, members, sprint14SharedWith({}));
    for (const userId of [STRANGER, HUGO]) {
      expect(await refusalOf(useCase.execute({ ...input, userId }))).toEqual({
        reason: 'watcher-recipient-invalid',
      });
    }
    expect(set).not.toHaveBeenCalled();
  });

  it('blocks new overrides at the limit and changes existing overrides at capacity', async () => {
    const overrides = Array.from({ length: 99 }, (): WatcherOverride => ({
      userId: randomUUID(),
      following: true,
    }));
    const { unit, members, set } = setup([...overrides, { userId: CAMILLE, following: true }]);
    const useCase = new SetTaskWatcher(unit, members, new InMemorySpaceDirectory());
    expect(await refusalOf(useCase.execute(input))).toEqual({ reason: 'watcher-limit-reached' });
    expect(set).not.toHaveBeenCalled();
    expect(await useCase.execute({ ...input, userId: CAMILLE, following: false })).toEqual({
      userId: CAMILLE,
      version: 13,
    });
  });

  it('rolls back the task version and ordinary event when the watcher outbox append fails', async () => {
    const { tasks, unit, members, append } = setup();
    append.mockRejectedValueOnce(new Error('Outbox unavailable'));
    const useCase = new SetTaskWatcher(unit, members, new InMemorySpaceDirectory());
    await expect(useCase.execute(input)).rejects.toThrow('Outbox unavailable');
    expect(tasks.stored(CAD_482).version).toBe(12);
    expect(tasks.events).toEqual([]);
  });
});
